#!/usr/bin/env node
/**
 * Crée (ou met à jour) la ressource Azure Bot de PROJECTOR et active le canal Microsoft Teams,
 * via l'API Azure Resource Manager, sans Azure CLI.
 *
 * Authentification :
 * - `--sp` : principal de service de PROJECTOR (identifiants MS_GRAPH_* / ENTRA_* de .env.local), qui doit
 *   avoir le rôle Contributeur sur le groupe de ressources (Contrôle d'accès IAM) ;
 * - sinon : connexion interactive par code d'appareil (client public Azure CLI) — peut être bloquée par
 *   l'accès conditionnel du locataire.
 * Aucun jeton n'est affiché ni enregistré. Idempotent : peut être relancé sans risque. Le groupe de
 * ressources existant n'est pas recréé.
 *
 * Usage :
 *   node scripts/azure/create-azure-bot.mjs --sp [--subscription <id>] [--resource-group MAITLAB]
 *        [--location switzerlandnorth] [--name projector-bot] [--status-file .local/azure-bot-status.json]
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DEFAULTS = {
  tenant: "c4691421-eeae-4c7e-bd67-17849bca6c78",
  appId: "f5f1bb90-afec-4e0d-9500-2f6e970ef5a9",
  endpoint: "https://projector.aguilera.ch/api/teams/messages",
  subscription: "3897598e-b559-4ce6-97bd-63252cb96e18",
  resourceGroup: "MAITLAB",
  location: "switzerlandnorth",
  name: "projector-bot",
};
const AZURE_CLI_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const ARM = "https://management.azure.com";
const BOT_API = "2022-09-15";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const config = {
  tenant: option("tenant", process.env.AZURE_TENANT_ID || DEFAULTS.tenant),
  appId: option("app-id", DEFAULTS.appId),
  endpoint: option("endpoint", DEFAULTS.endpoint),
  subscription: option("subscription", process.env.AZURE_SUBSCRIPTION_ID || DEFAULTS.subscription),
  resourceGroup: option("resource-group", DEFAULTS.resourceGroup),
  location: option("location", DEFAULTS.location),
  name: option("name", DEFAULTS.name),
  statusFile: option("status-file", ""),
  servicePrincipal: args.includes("--sp"),
};

const status = { step: "start", startedAt: new Date().toISOString(), messages: [] };
function report(step, message, extra = {}) {
  Object.assign(status, { step, updatedAt: new Date().toISOString(), ...extra });
  status.messages.push(`${new Date().toISOString()} ${message}`);
  console.log(message);
  if (config.statusFile) writeFileSync(config.statusFile, `${JSON.stringify(status, null, 2)}\n`);
}

async function form(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function deviceCodeLogin() {
  const base = `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0`;
  const scope = `${ARM}/.default offline_access`;
  const start = await form(`${base}/devicecode`, { client_id: AZURE_CLI_CLIENT_ID, scope });
  if (start.status !== 200) throw new Error(`Code d'appareil refusé : ${start.data.error_description ?? start.status}`);
  report("awaiting_login", `Connexion requise : ouvrez ${start.data.verification_uri} et saisissez le code ${start.data.user_code}`, {
    verificationUri: start.data.verification_uri,
    userCode: start.data.user_code,
    expiresAt: new Date(Date.now() + start.data.expires_in * 1000).toISOString(),
  });
  const deadline = Date.now() + start.data.expires_in * 1000;
  let interval = (start.data.interval ?? 5) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const poll = await form(`${base}/token`, {
      client_id: AZURE_CLI_CLIENT_ID,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: start.data.device_code,
    });
    if (poll.status === 200 && poll.data.access_token) return poll.data.access_token;
    if (poll.data.error === "slow_down") interval += 5000;
    else if (poll.data.error !== "authorization_pending") {
      throw new Error(`Connexion refusée : ${poll.data.error_description?.split("\r\n")[0] ?? poll.data.error}`);
    }
  }
  throw new Error("Code d'appareil expiré (15 minutes) : relancez le script.");
}

/** Lecture ciblée de .env.local (seules les clés d'identifiants de l'application). */
function readEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => /^([A-Z_]+)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, "")]),
  );
}

async function servicePrincipalLogin() {
  const env = { ...readEnvLocal(), ...process.env };
  const tenant = env.MS_GRAPH_TENANT_ID || env.ENTRA_TENANT_ID || config.tenant;
  const clientId = env.MS_GRAPH_CLIENT_ID || env.ENTRA_CLIENT_ID;
  const secret = env.MS_GRAPH_CLIENT_SECRET || env.ENTRA_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("Identifiants MS_GRAPH_* / ENTRA_* introuvables (.env.local).");
  const result = await form(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    client_id: clientId,
    client_secret: secret,
    scope: `${ARM}/.default`,
    grant_type: "client_credentials",
  });
  if (!result.data.access_token) throw new Error(`Jeton ARM refusé : ${result.data.error_description?.split("\r\n")[0] ?? result.status}`);
  return result.data.access_token;
}

const IAM_HINT =
  "Accordez au principal de service PROJECTOR (f5f1bb90-afec-4e0d-9500-2f6e970ef5a9) le rôle Contributeur sur le groupe de ressources : portail Azure › Groupes de ressources › <groupe> › Contrôle d'accès (IAM) › Ajouter une attribution de rôle.";

async function arm(token, method, path, body) {
  const response = await fetch(`${ARM}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

function armError(result) {
  return `${result.status} ${result.data?.error?.code ?? ""} ${result.data?.error?.message ?? result.data?.raw ?? ""}`.trim();
}

async function main() {
  const token = config.servicePrincipal ? await servicePrincipalLogin() : await deviceCodeLogin();
  report("logged_in", config.servicePrincipal ? "Jeton ARM du principal de service obtenu." : "Connexion Azure réussie.");

  let subscription = config.subscription;
  if (!subscription) {
    const list = await arm(token, "GET", "/subscriptions?api-version=2022-12-01");
    const enabled = (list.data.value ?? []).filter((item) => item.state === "Enabled");
    if (enabled.length !== 1) {
      report("choose_subscription", `Abonnements accessibles : ${enabled.map((item) => `${item.displayName} (${item.subscriptionId})`).join(", ") || "aucun"} — relancez avec --subscription <id>.`, {
        subscriptions: enabled.map((item) => ({ id: item.subscriptionId, name: item.displayName })),
      });
      process.exitCode = enabled.length === 0 ? 3 : 2;
      return;
    }
    subscription = enabled[0].subscriptionId;
  }
  report("subscription", `Abonnement : ${subscription}`, { subscription });

  const providerPath = `/subscriptions/${subscription}/providers/Microsoft.BotService?api-version=2021-04-01`;
  const provider = await arm(token, "GET", providerPath);
  if (provider.status === 200 && provider.data.registrationState !== "Registered") {
    const register = await arm(token, "POST", `/subscriptions/${subscription}/providers/Microsoft.BotService/register?api-version=2021-04-01`);
    if (register.status >= 300) {
      throw new Error(`Fournisseur Microsoft.BotService non enregistré (${armError(register)}) : Abonnement › Fournisseurs de ressources › Microsoft.BotService › Inscrire.`);
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const state = await arm(token, "GET", providerPath);
      if (state.data.registrationState === "Registered") break;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    report("provider", "Fournisseur Microsoft.BotService enregistré.");
  } else if (provider.status === 200) {
    report("provider", "Fournisseur Microsoft.BotService déjà enregistré.");
  } else {
    report("provider", `État du fournisseur Microsoft.BotService illisible (${provider.status}) : supposé enregistré.`);
  }

  const groupPath = `/subscriptions/${subscription}/resourceGroups/${config.resourceGroup}`;
  const existing = await arm(token, "GET", `${groupPath}?api-version=2021-04-01`);
  if (existing.status === 403) throw new Error(`Accès refusé au groupe de ressources ${config.resourceGroup} (${armError(existing)}). ${IAM_HINT}`);
  if (existing.status === 404) {
    const group = await arm(token, "PUT", `${groupPath}?api-version=2021-04-01`, {
      location: config.location,
      tags: { application: "PROJECTOR" },
    });
    if (group.status >= 300) throw new Error(`Groupe de ressources : ${armError(group)}`);
    report("resource_group", `Groupe de ressources créé : ${config.resourceGroup} (${config.location}).`);
  } else if (existing.status >= 300) {
    throw new Error(`Groupe de ressources : ${armError(existing)}`);
  } else {
    report("resource_group", `Groupe de ressources existant : ${config.resourceGroup} (${existing.data.location}).`);
  }

  const botPath = `${groupPath}/providers/Microsoft.BotService/botServices/${config.name}`;
  const bot = await arm(token, "PUT", `${botPath}?api-version=${BOT_API}`, {
    location: "global",
    kind: "azurebot",
    sku: { name: "F0" },
    tags: { application: "PROJECTOR" },
    properties: {
      displayName: "PROJECTOR",
      description: "Bot Microsoft Teams de PROJECTOR (gestion de projets HERMES 5.1)",
      endpoint: config.endpoint,
      msaAppId: config.appId,
      msaAppType: "SingleTenant",
      msaAppTenantId: config.tenant,
    },
  });
  if (bot.status >= 300) {
    const hint = bot.status === 403 ? ` ${IAM_HINT}` : bot.data?.error?.code === "MissingSubscriptionRegistration"
      ? " Abonnement › Fournisseurs de ressources › Microsoft.BotService › Inscrire."
      : "";
    throw new Error(`Ressource Azure Bot : ${armError(bot)}${hint}`);
  }
  report("bot", `Azure Bot prêt : ${bot.data.id ?? botPath}`, { botResourceId: bot.data.id ?? botPath });

  const channel = await arm(token, "PUT", `${botPath}/channels/MsTeamsChannel?api-version=${BOT_API}`, {
    location: "global",
    properties: { channelName: "MsTeamsChannel", properties: { isEnabled: true } },
  });
  if (channel.status >= 300) throw new Error(`Canal Microsoft Teams : ${armError(channel)}`);

  const check = await arm(token, "GET", `${botPath}?api-version=${BOT_API}`);
  const channelCheck = await arm(token, "GET", `${botPath}/channels/MsTeamsChannel?api-version=${BOT_API}`);
  report("done", `Terminé : endpoint ${check.data.properties?.endpoint}, type ${check.data.properties?.msaAppType}, canal Teams ${channelCheck.data.properties?.properties?.isEnabled ? "activé" : "inactif"}.`, {
    endpoint: check.data.properties?.endpoint,
    msaAppType: check.data.properties?.msaAppType,
    teamsChannelEnabled: Boolean(channelCheck.data.properties?.properties?.isEnabled),
  });
}

main().catch((error) => {
  report("error", `Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
