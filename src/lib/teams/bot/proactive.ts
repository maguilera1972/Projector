import { normalizeLocale } from "@/lib/i18n/config";
import { getBotCredentials } from "@/lib/integrations/config";
import { describeError } from "@/lib/integrations/graph";
import type {
  HermesPhaseId,
  IntegrationSettings,
  Project,
  Task,
  TeamsConversationRef,
} from "@/types";
import { todayIso } from "./cards";
import { phaseChangeCard, weatherAlertCard, weeklySummaryCard } from "./cards-share";
import { createChannelThread, isAllowedServiceUrl } from "./connector";
import { getBotI18n, type BotI18n } from "./i18n";
import { adaptiveCardAttachment, type AdaptiveCard } from "./types";

/**
 * Messages proactifs du bot PROJECTOR vers les canaux des projets (nouveau fil par événement).
 * Ce module ne doit pas importer `@/lib/db/store` (il est appelé depuis la diffusion des notifications).
 *
 * Cible : l'équipe Teams du projet (`project.teams.teamId` = groupe Entra) doit avoir le bot installé,
 * c'est-à-dire une référence « channel » avec ce `teamAadGroupId`, ou dont le canal est un canal du projet.
 * Le fil est publié dans le canal de la phase (changement de phase) ou dans le canal principal.
 */

export interface ProactiveContext {
  settings: IntegrationSettings;
  conversations: TeamsConversationRef[];
}

export type WeatherTone = "green" | "orange" | "red" | "neutral";

export interface WeeklySummaryInput {
  project: Project;
  tasks: Task[];
  weather: WeatherTone;
  reasons: string[];
}

interface ChannelTarget {
  channelId: string;
  ref: TeamsConversationRef;
}

function proactiveEnabled(ctx: ProactiveContext): boolean {
  return Boolean(ctx.settings.features.bot && ctx.settings.features.proactive && getBotCredentials());
}

function sameId(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** Canaux où publier, dédoublonnés (un seul message par canal et par événement). */
function channelTargets(project: Project, ctx: ProactiveContext, preferredChannelId?: string): ChannelTarget[] {
  const teams = project.teams;
  if (!teams) return [];
  const projectChannels = new Set(
    [teams.primaryChannelId, ...teams.channels.map((channel) => channel.channelId)].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const usable = ctx.conversations.filter(
    (ref) => ref.scope === "channel" && ref.botId && isAllowedServiceUrl(ref.serviceUrl),
  );
  const targets = new Map<string, TeamsConversationRef>();

  const teamRef =
    usable.find((ref) => sameId(ref.teamAadGroupId, teams.teamId)) ??
    usable.find((ref) => ref.channelId && projectChannels.has(ref.channelId));
  const channelId = preferredChannelId ?? teams.primaryChannelId ?? teamRef?.channelId;
  if (teamRef && channelId) targets.set(channelId, teamRef);

  for (const ref of usable) {
    if (!ref.channelId || !projectChannels.has(ref.channelId) || targets.has(ref.channelId)) continue;
    const sameTeam =
      teamRef && (sameId(ref.teamAadGroupId, teams.teamId) || sameId(ref.teamId, teamRef.teamId));
    if (!sameTeam) targets.set(ref.channelId, ref);
  }
  return [...targets].map(([id, ref]) => ({ channelId: id, ref }));
}

function projectI18n(project: Project): BotI18n {
  return getBotI18n(normalizeLocale(project.documentLocale ?? "fr"));
}

/** Publie la carte dans chaque canal cible ; ne lève jamais d'exception. */
async function postToProject(
  project: Project,
  targets: ChannelTarget[],
  card: AdaptiveCard,
  summary: string,
  errors: string[],
): Promise<number> {
  let posted = 0;
  for (const { channelId, ref } of targets) {
    try {
      await createChannelThread(ref.serviceUrl, {
        botId: ref.botId,
        channelId,
        tenantId: ref.tenantId,
        activity: { type: "message", summary, attachments: [adaptiveCardAttachment(card)] },
      });
      posted += 1;
    } catch (error) {
      errors.push(`${project.name} : ${describeError(error)}`);
    }
  }
  return posted;
}

export async function postPhaseChange(
  project: Project,
  ctx: ProactiveContext,
  info: { fromPhase: HermesPhaseId; toPhase?: HermesPhaseId; actorName: string },
): Promise<number> {
  try {
    if (!proactiveEnabled(ctx) || !project.teams) return 0;
    const phaseChannel = info.toPhase
      ? project.teams.channels.find((channel) => channel.phase === info.toPhase)?.channelId
      : undefined;
    const targets = channelTargets(project, ctx, phaseChannel);
    if (targets.length === 0) return 0;
    const i18n = projectI18n(project);
    const errors: string[] = [];
    const posted = await postToProject(
      project,
      targets,
      phaseChangeCard(i18n, project, info),
      `${i18n.t("proactive.phaseTitle")} — ${project.name}`,
      errors,
    );
    for (const error of errors) console.warn(`[teams-bot] Changement de phase non publié : ${error}`);
    return posted;
  } catch (error) {
    console.warn(`[teams-bot] Changement de phase non publié : ${describeError(error)}`);
    return 0;
  }
}

export async function postWeatherAlert(
  project: Project,
  ctx: ProactiveContext,
  info: { reasons: string[] },
): Promise<number> {
  try {
    if (!proactiveEnabled(ctx) || !project.teams) return 0;
    const targets = channelTargets(project, ctx);
    if (targets.length === 0) return 0;
    const i18n = projectI18n(project);
    const errors: string[] = [];
    const posted = await postToProject(
      project,
      targets,
      weatherAlertCard(i18n, project, info.reasons),
      `${i18n.t("proactive.weatherTitle")} — ${project.name}`,
      errors,
    );
    for (const error of errors) console.warn(`[teams-bot] Alerte météo non publiée : ${error}`);
    return posted;
  } catch (error) {
    console.warn(`[teams-bot] Alerte météo non publiée : ${describeError(error)}`);
    return 0;
  }
}

export async function postWeeklySummaries(
  items: WeeklySummaryInput[],
  ctx: ProactiveContext,
): Promise<{ posted: number; errors: string[] }> {
  const errors: string[] = [];
  let posted = 0;
  if (!proactiveEnabled(ctx)) return { posted, errors };
  const today = todayIso();
  for (const item of items) {
    try {
      if (!item.project.teams) continue;
      const targets = channelTargets(item.project, ctx);
      if (targets.length === 0) continue;
      const i18n = projectI18n(item.project);
      posted += await postToProject(
        item.project,
        targets,
        weeklySummaryCard(i18n, item, today),
        `${i18n.t("proactive.weeklyTitle")} — ${item.project.name}`,
        errors,
      );
    } catch (error) {
      errors.push(`${item.project.name} : ${describeError(error)}`);
    }
  }
  return { posted, errors };
}
