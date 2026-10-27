import type { DbUser } from "@/lib/auth/permissions";
import { drainPendingNotificationEmails } from "@/lib/notifications/dispatch";
import { sendNotificationEmails } from "@/lib/notifications/email";
import { sendNotificationActivities } from "@/lib/teams/activity";
import { postPhaseChange } from "@/lib/teams/bot/proactive";
import type {
  HermesPhaseId,
  IntegrationSettings,
  Notification,
  Project,
  TeamsConversationRef,
} from "@/types";

export interface DeliveryContext {
  users: DbUser[];
  projects: Project[];
  integrationSettings: IntegrationSettings;
  teamsConversations: TeamsConversationRef[];
}

/** Événements projet relayés dans le canal Teams du projet (bot, messages proactifs). */
function relayProjectEvents(pending: Notification[], ctx: DeliveryContext): void {
  const { features } = ctx.integrationSettings;
  if (!features.bot || !features.proactive) return;
  const seen = new Set<string>();
  for (const notification of pending) {
    if (notification.kind !== "phase_approved" || !notification.projectId) continue;
    const key = `${notification.projectId}:${notification.params?.phase}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const project = ctx.projects.find((item) => item.id === notification.projectId);
    if (!project?.teams) continue;
    void postPhaseChange(
      structuredClone(project),
      {
        settings: structuredClone(ctx.integrationSettings),
        conversations: structuredClone(ctx.teamsConversations),
      },
      {
        fromPhase: notification.params?.phase as HermesPhaseId,
        toPhase: project.currentPhase,
        actorName: String(notification.params?.actorName ?? ""),
      },
    ).catch((error: unknown) => {
      console.warn(`[teams] Message de changement de phase non publié : ${String(error)}`);
    });
  }
}

/**
 * Diffuse les notifications créées depuis le dernier enregistrement : e-mail, flux d'activité Teams
 * (selon les préférences de chaque destinataire) et canal Teams du projet. Jamais bloquant.
 */
export function flushNotifications(ctx: DeliveryContext): void {
  const pending = drainPendingNotificationEmails();
  if (pending.length === 0) return;
  sendNotificationEmails(pending, ctx.users);
  sendNotificationActivities(pending, ctx.users, ctx.integrationSettings);
  relayProjectEvents(pending, ctx);
}
