import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  deleteConnection,
  getConnectorStatus,
  refreshConnectorSchema,
  runConnectorSync,
  setupConnector,
  type ConnectorActionResult,
} from "@/lib/copilot/connector";
import { appendAuditEntries, getIntegrationSettings } from "@/lib/db/store";
import { isPlatformAdmin } from "@/lib/hermes/project-roles";
import { checkFeature } from "@/lib/integrations/capabilities";
import { describeError } from "@/lib/integrations/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = ["setup", "refreshSchema", "sync", "syncFull", "delete"] as const;
type ConnectorAction = (typeof ACTIONS)[number];

function isConnectorAction(value: unknown): value is ConnectorAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { user: null, response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  if (!isPlatformAdmin(user)) {
    return { user: null, response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  try {
    const settings = await getIntegrationSettings();
    const [status, capability] = await Promise.all([getConnectorStatus(), checkFeature("connector", settings)]);
    return NextResponse.json({ state: settings.connector, status, capability });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

async function runAction(action: ConnectorAction): Promise<ConnectorActionResult> {
  switch (action) {
    case "setup":
      return setupConnector();
    case "refreshSchema":
      return refreshConnectorSchema();
    case "sync":
    case "syncFull": {
      const result = await runConnectorSync({ full: action === "syncFull" });
      const state = (await getIntegrationSettings()).connector;
      if (!result.ok && result.upserted === 0 && result.deleted === 0) {
        return { ok: false, status: 409, error: result.errors[0] ?? "Synchronisation impossible.", state };
      }
      const summary =
        `${result.upserted} élément(s) indexé(s), ${result.unchanged} inchangé(s), ${result.deleted} supprimé(s)` +
        (result.skipped.length > 0 ? `, ${result.skipped.length} ignoré(s)` : "") +
        (result.ok ? "." : ` ; ${result.errors.length} erreur(s).`);
      return {
        ok: true,
        state,
        message: `Synchronisation ${action === "syncFull" ? "complète" : "incrémentale"} : ${summary}`,
        sync: result,
      };
    }
    case "delete":
      return deleteConnection();
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (!isConnectorAction(body.action)) {
    return NextResponse.json({ error: `Action inconnue. Valeurs : ${ACTIONS.join(", ")}.` }, { status: 400 });
  }
  const action = body.action;

  try {
    const result = await runAction(action);
    await appendAuditEntries([
      {
        action: `integrations.connector.${action}`,
        actorId: user.id,
        actorName: user.name,
        details: result.ok ? { ok: true, message: result.message } : { ok: false, error: result.error },
      },
    ]).catch(() => undefined);
    if (!result.ok) return NextResponse.json({ error: result.error, state: result.state }, { status: result.status });
    return NextResponse.json({ state: result.state, message: result.message, sync: result.sync });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
