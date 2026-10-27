import { getIntegrationSettings, updateIntegrationSettings } from "@/lib/db/store";
import { checkFeature, type FeatureCheck } from "@/lib/integrations/capabilities";
import { getAppCredentials, getConnectorAdminGroupId, getConnectorId, getPublicBaseUrl } from "@/lib/integrations/config";
import { describeError, GraphError } from "@/lib/integrations/graph";
import type { GraphConnectorSchemaStatus, GraphConnectorState, GraphConnectorSyncResult } from "@/types";
import { getConnectorAclMode, type ConnectorAclMode } from "./acl";
import { connectorRequest, isGraphUrl, mapWithConcurrency } from "./graph-client";
import { buildConnectorItems, itemHash, type ExternalItemPayload } from "./items";
import { buildSchemaPayload, CONNECTOR_SCHEMA_PROPERTY_NAMES } from "./schema";

/**
 * Connecteur Microsoft Graph PROJECTOR : connexion externe, schéma (asynchrone), synchronisation
 * incrémentale des éléments (empreintes) et suppression des éléments obsolètes.
 * Permissions d'application : ExternalConnection.ReadWrite.OwnedBy, ExternalItem.ReadWrite.OwnedBy.
 */

const CONNECTION_NAME = "PROJECTOR";
const CONNECTION_DESCRIPTION = "Projets, statut, décisions et rapports HERMES de PROJECTOR";
const PREFER_EVOLVABLE = { Prefer: "include-unknown-enum-members" };
const SYNC_CONCURRENCY = 4;
const MAX_REPORTED_ERRORS = 50;

export interface ConnectorSyncReport extends GraphConnectorSyncResult {
  unchanged: number;
  total: number;
  skipped: string[];
}

export type ConnectorActionResult =
  | { ok: true; state: GraphConnectorState; message: string; sync?: ConnectorSyncReport }
  | { ok: false; status: 400 | 409 | 502 | 503; error: string; state: GraphConnectorState };

export interface ConnectorStatus {
  connectionId: string;
  configured: boolean;
  connection: { exists: boolean; name?: string; state?: string; error?: string };
  schemaStatus: GraphConnectorSchemaStatus;
  schemaError?: string;
  itemCount: number;
  lastSyncAt?: string;
  lastSyncResult?: GraphConnectorSyncResult;
  aclMode: ConnectorAclMode;
  adminGroupConfigured: boolean;
  syncing: boolean;
}

interface GraphConnection {
  id: string;
  name?: string;
  description?: string;
  state?: string;
}

interface GraphOperation {
  status?: "unspecified" | "inprogress" | "completed" | "failed" | string;
  error?: { message?: string; code?: string };
}

function connectionPath(suffix = ""): string {
  return `/external/connections/${encodeURIComponent(getConnectorId())}${suffix}`;
}

function isNotFound(error: unknown): boolean {
  return error instanceof GraphError && error.status === 404;
}

function freshState(connectionId: string): GraphConnectorState {
  return { connectionId, schemaStatus: "none", itemIds: [], itemHashes: {} };
}

async function patchState(mutator: (state: GraphConnectorState) => void): Promise<GraphConnectorState> {
  const settings = await updateIntegrationSettings((current) => {
    const id = getConnectorId();
    if (!current.connector || current.connector.connectionId !== id) current.connector = freshState(id);
    mutator(current.connector);
  });
  return settings.connector;
}

async function readState(): Promise<GraphConnectorState> {
  const state = (await getIntegrationSettings()).connector;
  return state?.connectionId === getConnectorId() ? state : freshState(getConnectorId());
}

async function getConnection(): Promise<GraphConnection | null> {
  try {
    return (await connectorRequest<GraphConnection>("GET", connectionPath())).data;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Crée la connexion externe si elle n'existe pas (résolution des liens /projets/{id} vers les éléments). */
export async function ensureConnection(): Promise<{ created: boolean; state: GraphConnectorState }> {
  const existing = await getConnection();
  if (existing) {
    const state = await patchState((current) => {
      current.connectionCreatedAt ??= new Date().toISOString();
    });
    return { created: false, state };
  }

  const base = {
    id: getConnectorId(),
    name: CONNECTION_NAME,
    description: CONNECTION_DESCRIPTION,
  };
  const activitySettings = {
    urlToItemResolvers: [
      {
        "@odata.type": "#microsoft.graph.externalConnectors.itemIdResolver",
        priority: 1,
        itemId: "project-{projectId}",
        urlMatchInfo: {
          baseUrls: [getPublicBaseUrl()],
          urlPattern: "/projets/(?<projectId>[^/?#]+)",
        },
      },
    ],
  };
  try {
    await connectorRequest("POST", "/external/connections", { body: { ...base, activitySettings } });
  } catch (error) {
    if (!(error instanceof GraphError) || error.status !== 400) throw error;
    await connectorRequest("POST", "/external/connections", { body: base });
  }
  const state = await patchState((current) => {
    Object.assign(current, freshState(current.connectionId));
    current.connectionCreatedAt = new Date().toISOString();
  });
  return { created: true, state };
}

async function getSchemaPropertyNames(): Promise<string[] | null> {
  try {
    const { data } = await connectorRequest<{ properties?: { name: string }[] }>("GET", connectionPath("/schema"), {
      headers: PREFER_EVOLVABLE,
    });
    return (data?.properties ?? []).map((property) => property.name);
  } catch (error) {
    if (error instanceof GraphError && (error.status === 401 || error.status === 403)) throw error;
    return null;
  }
}

/** Enregistre (ou complète) le schéma ; Graph répond 202 + Location : l'état passe à « pending ». */
export async function registerSchema(): Promise<GraphConnectorState> {
  const existing = await getSchemaPropertyNames();
  if (existing && CONNECTOR_SCHEMA_PROPERTY_NAMES.every((name) => existing.includes(name))) {
    return patchState((state) => {
      state.schemaStatus = "ready";
      state.schemaOperationUrl = undefined;
      state.schemaError = undefined;
    });
  }

  try {
    const response = await connectorRequest("PATCH", connectionPath("/schema"), {
      body: buildSchemaPayload(),
      headers: PREFER_EVOLVABLE,
    });
    const location = response.headers.get("location") ?? undefined;
    const operationUrl = location && isGraphUrl(location) ? location : undefined;
    return patchState((state) => {
      state.schemaStatus = response.status === 202 ? "pending" : "ready";
      state.schemaOperationUrl = response.status === 202 ? operationUrl : undefined;
      state.schemaError = undefined;
    });
  } catch (error) {
    const message = describeError(error);
    await patchState((state) => {
      state.schemaStatus = "failed";
      state.schemaOperationUrl = undefined;
      state.schemaError = message;
    });
    throw error;
  }
}

/** Interroge l'opération d'enregistrement du schéma (ou le schéma lui-même) et met l'état à jour. */
export async function refreshSchemaStatus(): Promise<GraphConnectorState> {
  const state = await readState();
  if (state.schemaOperationUrl && isGraphUrl(state.schemaOperationUrl)) {
    try {
      const { data } = await connectorRequest<GraphOperation>("GET", state.schemaOperationUrl);
      switch (data?.status) {
        case "completed":
          return patchState((current) => {
            current.schemaStatus = "ready";
            current.schemaOperationUrl = undefined;
            current.schemaError = undefined;
          });
        case "failed":
          return patchState((current) => {
            current.schemaStatus = "failed";
            current.schemaOperationUrl = undefined;
            current.schemaError = data.error?.message ?? data.error?.code ?? "Échec de l'enregistrement du schéma.";
          });
        default:
          return patchState((current) => {
            current.schemaStatus = "pending";
          });
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  const names = await getSchemaPropertyNames();
  const complete = names !== null && CONNECTOR_SCHEMA_PROPERTY_NAMES.every((name) => names.includes(name));
  return patchState((current) => {
    current.schemaOperationUrl = undefined;
    if (complete) {
      current.schemaStatus = "ready";
      current.schemaError = undefined;
    } else if (current.schemaStatus === "ready" || current.schemaStatus === "pending") {
      current.schemaStatus = names === null ? "none" : "pending";
    }
  });
}

function capabilityError(check: Exclude<FeatureCheck, { ok: true }>, state: GraphConnectorState): ConnectorActionResult {
  return { ok: false, status: 503, error: check.message, state };
}

/** Connexion + schéma (autorisé même si la fonctionnalité n'est pas encore activée). */
export async function setupConnector(): Promise<ConnectorActionResult> {
  const settings = await getIntegrationSettings();
  const check = await checkFeature("connector", settings);
  if (!check.ok && check.reason !== "disabled") return capabilityError(check, await readState());
  try {
    const { created } = await ensureConnection();
    const state = await registerSchema();
    const connectionText = created ? "Connexion créée" : "Connexion existante";
    const schemaText =
      state.schemaStatus === "ready"
        ? "schéma prêt : la synchronisation peut être lancée."
        : "schéma en cours d'enregistrement (quelques minutes) : actualisez le statut avant de synchroniser.";
    return { ok: true, state, message: `${connectionText} (${getConnectorId()}), ${schemaText}` };
  } catch (error) {
    return { ok: false, status: 502, error: describeError(error), state: await readState() };
  }
}

export async function refreshConnectorSchema(): Promise<ConnectorActionResult> {
  if (!getAppCredentials()) {
    return { ok: false, status: 503, error: "Microsoft Graph non configuré.", state: await readState() };
  }
  try {
    const state = await refreshSchemaStatus();
    const messages: Record<GraphConnectorSchemaStatus, string> = {
      none: "Aucun schéma enregistré : lancez la configuration.",
      pending: "Enregistrement du schéma toujours en cours.",
      ready: "Schéma prêt.",
      failed: `Échec de l'enregistrement du schéma${state.schemaError ? ` : ${state.schemaError}` : ""}.`,
    };
    return { ok: true, state, message: messages[state.schemaStatus] };
  } catch (error) {
    return { ok: false, status: 502, error: describeError(error), state: await readState() };
  }
}

/** Supprime la connexion externe (et tous ses éléments côté Microsoft 365) puis réinitialise l'état. */
export async function deleteConnection(): Promise<ConnectorActionResult> {
  if (!getAppCredentials()) {
    return { ok: false, status: 503, error: "Microsoft Graph non configuré.", state: await readState() };
  }
  if (getSyncInFlight()) {
    return { ok: false, status: 409, error: "Synchronisation en cours, réessayez plus tard.", state: await readState() };
  }
  try {
    await connectorRequest("DELETE", connectionPath());
  } catch (error) {
    if (!isNotFound(error)) {
      return { ok: false, status: 502, error: describeError(error), state: await readState() };
    }
  }
  const state = await patchState((current) => {
    const lastSyncAt = current.lastSyncAt;
    Object.assign(current, freshState(current.connectionId), { lastSyncAt });
    current.connectionCreatedAt = undefined;
    current.schemaOperationUrl = undefined;
    current.schemaError = undefined;
    current.lastSyncResult = undefined;
  });
  return { ok: true, state, message: `Connexion ${getConnectorId()} supprimée (index Microsoft 365 vidé).` };
}

export async function getConnectorStatus(): Promise<ConnectorStatus> {
  const state = await readState();
  const configured = Boolean(getAppCredentials());
  let connection: ConnectorStatus["connection"] = { exists: false };
  if (configured) {
    try {
      const existing = await getConnection();
      connection = existing ? { exists: true, name: existing.name, state: existing.state } : { exists: false };
    } catch (error) {
      connection = { exists: false, error: describeError(error) };
    }
  }
  return {
    connectionId: getConnectorId(),
    configured,
    connection,
    schemaStatus: state.schemaStatus,
    schemaError: state.schemaError,
    itemCount: state.itemIds.length,
    lastSyncAt: state.lastSyncAt,
    lastSyncResult: state.lastSyncResult,
    aclMode: getConnectorAclMode(),
    adminGroupConfigured: Boolean(getConnectorAdminGroupId()),
    syncing: Boolean(getSyncInFlight()),
  };
}

/* ------------------------------------------------------------------ */

const syncSlot = globalThis as typeof globalThis & {
  __projectorConnectorSync?: Promise<ConnectorSyncReport> | null;
};

function getSyncInFlight(): Promise<ConnectorSyncReport> | null {
  return syncSlot.__projectorConnectorSync ?? null;
}

function capErrors(errors: string[]): string[] {
  if (errors.length <= MAX_REPORTED_ERRORS) return errors;
  return [...errors.slice(0, MAX_REPORTED_ERRORS), `… ${errors.length - MAX_REPORTED_ERRORS} autre(s) erreur(s).`];
}

async function persistResult(report: ConnectorSyncReport): Promise<ConnectorSyncReport> {
  try {
    await patchState((state) => {
      state.lastSyncAt = new Date().toISOString();
      state.lastSyncResult = report;
    });
  } catch (error) {
    report.errors.push(`Persistance de l'état impossible : ${describeError(error)}`);
    report.ok = false;
  }
  return report;
}

function failure(started: number, message: string): ConnectorSyncReport {
  return {
    ok: false,
    upserted: 0,
    deleted: 0,
    unchanged: 0,
    total: 0,
    skipped: [],
    errors: [message],
    durationMs: Date.now() - started,
  };
}

async function putItem(item: ExternalItemPayload): Promise<void> {
  await connectorRequest("PUT", connectionPath(`/items/${encodeURIComponent(item.id)}`), {
    body: { acl: item.acl, properties: item.properties, content: item.content },
  });
}

async function deleteItem(itemId: string): Promise<void> {
  try {
    await connectorRequest("DELETE", connectionPath(`/items/${encodeURIComponent(itemId)}`));
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function syncOnce(full: boolean): Promise<ConnectorSyncReport> {
  const started = Date.now();
  try {
    const settings = await getIntegrationSettings();
    const check = await checkFeature("connector", settings);
    if (!check.ok) return persistResult(failure(started, check.message));

    let state = await readState();
    if (state.schemaStatus !== "ready") {
      if (state.schemaStatus === "pending") {
        try {
          state = await refreshSchemaStatus();
        } catch (error) {
          return persistResult(failure(started, `Statut du schéma indisponible : ${describeError(error)}`));
        }
      }
      if (state.schemaStatus !== "ready") {
        return persistResult(
          failure(
            started,
            `Schéma du connecteur non prêt (statut : ${state.schemaStatus}${state.schemaError ? `, ${state.schemaError}` : ""}). ` +
              "Lancez la configuration (setup) puis attendez que le schéma soit prêt.",
          ),
        );
      }
    }

    const { items, skipped } = await buildConnectorItems();
    const previousIds = new Set(state.itemIds);
    const nextHashes: Record<string, string> = {};
    const presentIds = new Set<string>();
    const errors: string[] = [];
    const changed: { item: ExternalItemPayload; hash: string }[] = [];
    let unchanged = 0;

    for (const item of items) {
      const hash = itemHash(item);
      presentIds.add(item.id);
      if (!full && previousIds.has(item.id) && state.itemHashes[item.id] === hash) {
        nextHashes[item.id] = hash;
        unchanged++;
      } else {
        changed.push({ item, hash });
      }
    }

    let upserted = 0;
    await mapWithConcurrency(changed, SYNC_CONCURRENCY, async ({ item, hash }) => {
      try {
        await putItem(item);
        nextHashes[item.id] = hash;
        upserted++;
      } catch (error) {
        errors.push(`${item.id} : ${describeError(error)}`);
      }
    });

    let deleted = 0;
    const obsolete = [...previousIds].filter((itemId) => !presentIds.has(itemId));
    await mapWithConcurrency(obsolete, SYNC_CONCURRENCY, async (itemId) => {
      try {
        await deleteItem(itemId);
        deleted++;
      } catch (error) {
        presentIds.add(itemId);
        errors.push(`Suppression ${itemId} : ${describeError(error)}`);
      }
    });

    await patchState((current) => {
      current.itemIds = [...presentIds].sort();
      current.itemHashes = nextHashes;
    });

    return persistResult({
      ok: errors.length === 0,
      upserted,
      deleted,
      unchanged,
      total: items.length,
      skipped,
      errors: capErrors([...errors, ...skipped.map((reason) => `Ignoré : ${reason}`)]),
      durationMs: Date.now() - started,
    });
  } catch (error) {
    return persistResult(failure(started, `Synchronisation interrompue : ${describeError(error)}`));
  }
}

/**
 * Synchronise les éléments du connecteur (point d'entrée du planificateur de tâches).
 * Ne lève jamais : les erreurs sont renvoyées (et persistées) dans le résultat.
 * Une synchronisation déjà en cours est partagée plutôt que relancée.
 */
export async function runConnectorSync(options: { full?: boolean } = {}): Promise<ConnectorSyncReport> {
  const inFlight = getSyncInFlight();
  if (inFlight) return inFlight;
  const run = syncOnce(Boolean(options.full)).finally(() => {
    syncSlot.__projectorConnectorSync = null;
  });
  syncSlot.__projectorConnectorSync = run;
  return run;
}
