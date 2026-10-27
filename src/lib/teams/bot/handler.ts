import type { SessionUser } from "@/lib/auth/permissions";
import {
  getIntegrationSettings,
  listTeamsConversations,
  removeTeamsConversations,
  upsertTeamsConversation,
} from "@/lib/db/store";
import { describeError } from "@/lib/integrations/graph";
import { listMyOpenTasks, listVisibleProjects, resolveUserByEntraOid } from "@/lib/integrations/actions";
import type { IntegrationSettings, TeamsConversationRef, TeamsConversationScope } from "@/types";
import {
  chooseProjectCard,
  helpCard,
  linkAccountCard,
  messageCard,
  myTasksCard,
  pendingDecisionsCard,
  projectStatusCard,
  todayIso,
} from "./cards";
import { parseCommand, type BotCommand } from "./commands";
import {
  createPersonalConversation,
  replyToActivity,
  sendToConversation,
  updateActivity,
} from "./connector";
import { botI18nFor, buildPendingDecisions, buildProjectStatus, findProjectForUser } from "./context";
import { parseCardAction, renderCardView, runCardAction, viewFor } from "./execute";
import { composeMessage, handleComposeQuery, handleQueryLink } from "./extension";
import type { BotI18n } from "./i18n";
import {
  adaptiveCardAttachment,
  baseConversationId,
  type AdaptiveCard,
  type BotHttpResponse,
  type BotRequestAuth,
  type IncomingActivity,
  type OutgoingActivity,
} from "./types";

/**
 * Traitement des activités Bot Framework authentifiées (Teams) : installation, commandes texte,
 * actions de cartes (Universal Actions) et extension de messagerie.
 */

const CARD_RESPONSE = "application/vnd.microsoft.card.adaptive";
const MESSAGE_RESPONSE = "application/vnd.microsoft.activity.message";
/** Rafraîchissement de la référence d'une conversation personnelle au plus une fois par heure. */
const REF_REFRESH_MS = 3600_000;

interface TurnContext {
  activity: IncomingActivity;
  auth: BotRequestAuth;
  settings: IntegrationSettings;
  scope: TeamsConversationScope;
}

function scopeOf(activity: IncomingActivity): TeamsConversationScope {
  switch (activity.conversation.conversationType) {
    case "personal":
      return "personal";
    case "channel":
      return "channel";
    case "groupChat":
      return "groupChat";
    default:
      if (activity.channelData?.team?.id) return "channel";
      return activity.conversation.isGroup ? "groupChat" : "personal";
  }
}

function cardActivity(card: AdaptiveCard, locale?: string): OutgoingActivity {
  return { type: "message", attachments: [adaptiveCardAttachment(card)], ...(locale ? { locale } : {}) };
}

function textActivity(text: string): OutgoingActivity {
  return { type: "message", text, textFormat: "plain" };
}

// ─── Envoi ─────────────────────────────────────────────────────────────────

/** Répond dans la conversation de l'activité (uniquement vers un serviceUrl authentifié). */
async function reply(ctx: TurnContext, outgoing: OutgoingActivity): Promise<void> {
  const { activity, auth } = ctx;
  if (!auth.serviceUrlTrusted) {
    console.warn("[teams-bot] Réponse non envoyée : serviceUrl non authentifié.");
    return;
  }
  const conversationId = activity.conversation.id;
  try {
    if (activity.id) await replyToActivity(activity.serviceUrl, conversationId, activity.id, outgoing);
    else await sendToConversation(activity.serviceUrl, conversationId, outgoing);
  } catch (error) {
    console.warn(`[teams-bot] Réponse non envoyée : ${describeError(error)}`);
  }
}

/** Envoie en conversation personnelle (données propres à l'utilisateur demandées depuis un canal). */
async function replyPrivately(ctx: TurnContext, outgoing: OutgoingActivity, i18n: BotI18n): Promise<void> {
  const { activity, auth } = ctx;
  if (!auth.serviceUrlTrusted) return;
  try {
    const conversation = await createPersonalConversation(activity.serviceUrl, {
      botId: activity.recipient.id,
      userId: activity.from.id,
      tenantId: auth.tenantId,
    });
    if (!conversation.id) throw new Error("Conversation personnelle non créée.");
    await sendToConversation(activity.serviceUrl, conversation.id, outgoing);
    await reply(ctx, textActivity(i18n.t("bot.privateSent")));
  } catch (error) {
    console.warn(`[teams-bot] Message privé impossible : ${describeError(error)}`);
    await reply(ctx, textActivity(i18n.t("bot.privateFailed")));
  }
}

// ─── Références de conversation ────────────────────────────────────────────

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function conversationRef(ctx: TurnContext): Omit<TeamsConversationRef, "installedAt" | "updatedAt"> {
  const { activity, auth, scope } = ctx;
  const channelData = activity.channelData ?? {};
  const conversationId = baseConversationId(activity.conversation.id);
  const personal = scope === "personal";
  return compact({
    id: conversationId,
    serviceUrl: activity.serviceUrl,
    tenantId: channelData.tenant?.id ?? activity.conversation.tenantId ?? auth.tenantId,
    scope,
    botId: activity.recipient.id,
    teamId: channelData.team?.id,
    teamAadGroupId: channelData.team?.aadGroupId,
    teamName: channelData.team?.name,
    channelId: scope === "channel" ? (channelData.channel?.id ?? conversationId) : undefined,
    channelName: channelData.channel?.name,
    userAadObjectId: personal ? activity.from.aadObjectId : undefined,
    userName: personal ? activity.from.name : undefined,
  });
}

/** Enregistre la conversation (installation, ou message d'une conversation encore inconnue). */
async function rememberConversation(ctx: TurnContext, force: boolean): Promise<void> {
  if (!ctx.auth.serviceUrlTrusted) return;
  const ref = conversationRef(ctx);
  try {
    const existing = await listTeamsConversations();
    const current = existing.find((item) => item.id === ref.id);
    if (!ref.teamAadGroupId && ref.teamId) {
      ref.teamAadGroupId = existing.find((item) => item.teamId === ref.teamId && item.teamAadGroupId)?.teamAadGroupId;
      if (!ref.teamAadGroupId) delete ref.teamAadGroupId;
    }
    const fresh =
      current &&
      current.serviceUrl === ref.serviceUrl &&
      Date.now() - Date.parse(current.updatedAt) < REF_REFRESH_MS;
    if (!force && fresh) return;
    if (!force && current && ctx.scope !== "personal") return;
    await upsertTeamsConversation(ref);
  } catch (error) {
    console.warn(`[teams-bot] Référence de conversation non enregistrée : ${describeError(error)}`);
  }
}

async function forgetConversation(ctx: TurnContext): Promise<void> {
  const conversationId = baseConversationId(ctx.activity.conversation.id);
  const teamId = ctx.activity.channelData?.team?.id;
  try {
    await removeTeamsConversations((ref) => ref.id === conversationId || (Boolean(teamId) && ref.teamId === teamId));
  } catch (error) {
    console.warn(`[teams-bot] Référence de conversation non supprimée : ${describeError(error)}`);
  }
}

// ─── Installation ──────────────────────────────────────────────────────────

async function sendWelcome(ctx: TurnContext): Promise<void> {
  const { activity, auth, scope } = ctx;
  if (!auth.serviceUrlTrusted || !ctx.settings.features.bot) return;
  const user = scope === "personal" ? await resolveUserByEntraOid(activity.from.aadObjectId) : null;
  const i18n = botI18nFor(user, activity.locale);
  const intro =
    scope === "personal"
      ? i18n.t("help.welcomePersonal")
      : i18n.t("help.welcomeTeam", { team: activity.channelData?.team?.name ?? activity.conversation.name ?? "" });
  const card = scope === "personal" && !user ? linkAccountCard(i18n) : helpCard(i18n, { userName: user?.name, intro });
  try {
    await sendToConversation(activity.serviceUrl, activity.conversation.id, cardActivity(card));
  } catch (error) {
    console.warn(`[teams-bot] Message de bienvenue non envoyé : ${describeError(error)}`);
  }
}

async function handleConversationUpdate(ctx: TurnContext): Promise<void> {
  const { activity } = ctx;
  const botId = activity.recipient.id;
  const eventType = activity.channelData?.eventType;
  if (activity.membersRemoved?.some((member) => member.id === botId) || eventType === "teamDeleted") {
    await forgetConversation(ctx);
    return;
  }
  if (activity.membersAdded?.some((member) => member.id === botId)) {
    await rememberConversation(ctx, true);
    await sendWelcome(ctx);
    return;
  }
  if (eventType === "teamRenamed" || eventType === "channelRenamed" || eventType === "teamRestored") {
    const known = (await listTeamsConversations()).some(
      (ref) => ref.id === baseConversationId(activity.conversation.id),
    );
    if (known) await rememberConversation(ctx, true);
  }
}

async function handleInstallationUpdate(ctx: TurnContext): Promise<void> {
  const action = ctx.activity.action ?? "";
  if (action.startsWith("remove")) await forgetConversation(ctx);
  else if (action.startsWith("add")) await rememberConversation(ctx, true);
}

// ─── Messages ──────────────────────────────────────────────────────────────

/** Les commandes qui exposent des données propres à l'utilisateur partent en privé hors conversation personnelle. */
async function commandCard(
  ctx: TurnContext,
  command: Exclude<BotCommand, { kind: "help" } | { kind: "unknown" }>,
  user: SessionUser,
  i18n: BotI18n,
): Promise<{ card: AdaptiveCard; shareable: boolean }> {
  switch (command.kind) {
    case "myTasks":
      return { card: myTasksCard(i18n, await listMyOpenTasks(user), todayIso()), shareable: false };
    case "decisions": {
      const { gates, budgets } = await buildPendingDecisions(user);
      return { card: pendingDecisionsCard(i18n, gates, budgets), shareable: false };
    }
    case "status": {
      if (!command.query) {
        return { card: chooseProjectCard(i18n, await listVisibleProjects(user)), shareable: false };
      }
      const project = await findProjectForUser(user, command.query);
      if (!project) {
        const message = i18n.t("status.notFound", { query: command.query.slice(0, 100) });
        return { card: chooseProjectCard(i18n, await listVisibleProjects(user), message), shareable: false };
      }
      const teamGroupId = ctx.activity.channelData?.team?.aadGroupId;
      const linkedTeam = (await listTeamsConversations()).find(
        (ref) => ref.teamId && ref.teamId === ctx.activity.channelData?.team?.id,
      )?.teamAadGroupId;
      const channelTeam = teamGroupId ?? linkedTeam;
      return {
        card: projectStatusCard(i18n, await buildProjectStatus(project)),
        shareable: ctx.scope === "channel" && Boolean(channelTeam) && project.teams?.teamId === channelTeam,
      };
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

/** Action.Submit (clients sans Universal Actions) : même traitement qu'Action.Execute. */
async function handleSubmittedAction(ctx: TurnContext, user: SessionUser | null, i18n: BotI18n): Promise<boolean> {
  const request = parseCardAction(ctx.activity.value);
  if (!request) return false;
  if (!user) {
    await reply(ctx, cardActivity(linkAccountCard(i18n)));
    return true;
  }
  const banner = await runCardAction(user, request, i18n);
  if (ctx.scope !== "personal") {
    await reply(ctx, textActivity(banner?.text ?? i18n.t("bot.refreshPersonalOnly")));
    return true;
  }
  const card = await renderCardView(user, viewFor(request), request.fields, i18n, banner);
  const { activity } = ctx;
  if (activity.replyToId && ctx.auth.serviceUrlTrusted) {
    try {
      await updateActivity(activity.serviceUrl, activity.conversation.id, activity.replyToId, cardActivity(card));
      return true;
    } catch (error) {
      console.warn(`[teams-bot] Carte non mise à jour : ${describeError(error)}`);
    }
  }
  await reply(ctx, cardActivity(card));
  return true;
}

async function handleMessage(ctx: TurnContext): Promise<void> {
  const { activity } = ctx;
  await rememberConversation(ctx, false);
  const user = await resolveUserByEntraOid(activity.from.aadObjectId);
  const i18n = botI18nFor(user, activity.locale);

  if (!ctx.settings.features.bot) {
    await reply(ctx, textActivity(i18n.t("bot.disabled")));
    return;
  }
  if (await handleSubmittedAction(ctx, user, i18n)) return;

  const command = parseCommand(activity.text ?? "");
  if (command.kind === "help" || command.kind === "unknown") {
    const intro = command.kind === "unknown" ? i18n.t("help.unknown", { text: command.text.slice(0, 100) }) : undefined;
    await reply(ctx, cardActivity(helpCard(i18n, { userName: user?.name, intro })));
    return;
  }
  if (!user) {
    await reply(ctx, cardActivity(linkAccountCard(i18n)));
    return;
  }
  const { card, shareable } = await commandCard(ctx, command, user, i18n);
  if (ctx.scope === "personal" || shareable) await reply(ctx, cardActivity(card));
  else await replyPrivately(ctx, cardActivity(card), i18n);
}

// ─── Invoke ────────────────────────────────────────────────────────────────

function invokeMessage(text: string): BotHttpResponse {
  return { status: 200, body: { statusCode: 200, type: MESSAGE_RESPONSE, value: text } };
}

function invokeCard(card: AdaptiveCard): BotHttpResponse {
  return { status: 200, body: { statusCode: 200, type: CARD_RESPONSE, value: card } };
}

/** `adaptiveCard/action` : réponse synchrone (carte mise à jour, ou message hors conversation personnelle). */
async function handleCardAction(ctx: TurnContext): Promise<BotHttpResponse> {
  const { activity } = ctx;
  const user = await resolveUserByEntraOid(activity.from.aadObjectId);
  const i18n = botI18nFor(user, activity.locale);
  if (!ctx.settings.features.bot) return invokeMessage(i18n.t("bot.disabled"));
  if (!user) {
    return ctx.scope === "personal" ? invokeCard(linkAccountCard(i18n)) : invokeMessage(i18n.t("link.text"));
  }
  const request = parseCardAction(activity.value);
  if (!request) return invokeMessage(i18n.t("errors.unknownAction"));

  try {
    const banner = await runCardAction(user, request, i18n);
    const view = viewFor(request);
    if (ctx.scope === "personal") {
      return invokeCard(await renderCardView(user, view, request.fields, i18n, banner));
    }
    if (request.verb === "refresh" && view === "status") {
      return invokeCard(await renderCardView(user, view, request.fields, i18n));
    }
    return invokeMessage(banner?.text ?? i18n.t("bot.refreshPersonalOnly"));
  } catch (error) {
    console.warn(`[teams-bot] Action de carte en échec : ${describeError(error)}`);
    const banner = { kind: "attention" as const, text: i18n.t("bot.error") };
    return ctx.scope === "personal" ? invokeCard(messageCard(i18n, banner)) : invokeMessage(banner.text);
  }
}

async function handleInvoke(ctx: TurnContext): Promise<BotHttpResponse> {
  const { activity } = ctx;
  const name = activity.name ?? "";
  if (name === "adaptiveCard/action") return handleCardAction(ctx);
  if (name.startsWith("composeExtension/") && !ctx.settings.features.bot) {
    const user = await resolveUserByEntraOid(activity.from.aadObjectId);
    return { status: 200, body: composeMessage(botI18nFor(user, activity.locale).t("bot.disabled")) };
  }
  try {
    switch (name) {
      case "composeExtension/query":
        return { status: 200, body: await handleComposeQuery(activity) };
      case "composeExtension/queryLink":
        return { status: 200, body: await handleQueryLink(activity) };
      case "composeExtension/anonymousQueryLink":
        return { status: 200, body: await handleQueryLink(activity, true) };
      default:
        return { status: 200, body: {} };
    }
  } catch (error) {
    console.warn(`[teams-bot] Invoke ${name} en échec : ${describeError(error)}`);
    return { status: 200, body: composeMessage(botI18nFor(null, activity.locale).t("bot.error")) };
  }
}

/** Point d'entrée : activité déjà authentifiée par `authenticateBotRequest`. */
export async function handleActivity(activity: IncomingActivity, auth: BotRequestAuth): Promise<BotHttpResponse> {
  const ctx: TurnContext = {
    activity,
    auth,
    settings: await getIntegrationSettings(),
    scope: scopeOf(activity),
  };
  try {
    switch (activity.type) {
      case "message":
        await handleMessage(ctx);
        return { status: 200 };
      case "conversationUpdate":
        await handleConversationUpdate(ctx);
        return { status: 200 };
      case "installationUpdate":
        await handleInstallationUpdate(ctx);
        return { status: 200 };
      case "invoke":
        return await handleInvoke(ctx);
      default:
        return { status: 200 };
    }
  } catch (error) {
    // 200 malgré l'échec : un 5xx ferait rejouer l'activité par le Bot Connector (actions en double).
    console.error(`[teams-bot] Activité ${activity.type} en échec : ${describeError(error)}`);
    return { status: 200, body: activity.type === "invoke" ? {} : undefined };
  }
}
