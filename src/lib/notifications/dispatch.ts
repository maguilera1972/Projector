import { isUserActive, type DbUser } from "@/lib/auth/permissions";
import { getPhaseLabel } from "@/lib/hermes/phases";
import type {
  Notification,
  NotificationKind,
  PhaseValidation,
  Project,
} from "@/types";

type DatabaseUsers = DbUser[];

interface NotificationDraft {
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  href?: string;
  projectId?: string;
}

export function resolveMandantUserId(
  users: DatabaseUsers,
  project: Project,
): string | undefined {
  if (project.mandantUserId) {
    const linked = users.find(
      (user) => user.id === project.mandantUserId && isUserActive(user),
    );
    if (linked) return linked.id;
  }

  const mandant = project.mandant.trim().toLowerCase();
  if (!mandant) return undefined;

  return users.find(
    (user) =>
      isUserActive(user) &&
      (user.name.toLowerCase() === mandant ||
        user.email.toLowerCase() === mandant),
  )?.id;
}

export function resolveChefUserId(
  users: DatabaseUsers,
  project: Project,
): string | undefined {
  if (project.chefDeProjetId) {
    const linked = users.find(
      (user) => user.id === project.chefDeProjetId && isUserActive(user),
    );
    if (linked) return linked.id;
  }

  const chef = project.chefDeProjet.trim().toLowerCase();
  if (!chef) return undefined;

  return users.find(
    (user) =>
      isUserActive(user) &&
      (user.name.toLowerCase() === chef || user.email.toLowerCase() === chef),
  )?.id;
}

export function pushNotification(
  notifications: Notification[],
  draft: NotificationDraft,
): Notification {
  const notification: Notification = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...draft,
  };
  notifications.push(notification);
  return notification;
}

function projectHref(projectId: string): string {
  return `/projets/${projectId}`;
}

export function notifyTaskAssigned(
  notifications: Notification[],
  users: DatabaseUsers,
  project: Project,
  task: { id: string; title: string },
  assigneeId: string,
  actorId?: string,
): void {
  if (actorId && assigneeId === actorId) return;

  pushNotification(notifications, {
    userId: assigneeId,
    kind: "task_assigned",
    title: "Nouvelle tâche assignée",
    message: `« ${task.title} » sur le projet ${project.name}.`,
    href: `/taches`,
    projectId: project.id,
  });
}

export function notifyPhaseSubmitted(
  notifications: Notification[],
  users: DatabaseUsers,
  project: Project,
  validation: PhaseValidation,
  actorName: string,
): void {
  const mandantId = resolveMandantUserId(users, project);
  if (!mandantId) return;

  const phaseLabel = getPhaseLabel(validation.fromPhase, project.approach);
  pushNotification(notifications, {
    userId: mandantId,
    kind: "phase_submitted",
    title: "Validation de phase demandée",
    message: `${actorName} demande la libération de la phase ${phaseLabel} pour ${project.name}.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}

export function notifyPhaseApproved(
  notifications: Notification[],
  project: Project,
  validation: PhaseValidation,
  actorName: string,
): void {
  if (!validation.submittedBy) return;

  const phaseLabel = getPhaseLabel(validation.fromPhase, project.approach);
  pushNotification(notifications, {
    userId: validation.submittedBy,
    kind: "phase_approved",
    title: "Phase validée",
    message: `${actorName} a confirmé la phase ${phaseLabel} pour ${project.name}.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}

export function notifyPhaseRejected(
  notifications: Notification[],
  project: Project,
  validation: PhaseValidation,
  actorName: string,
): void {
  if (!validation.submittedBy) return;

  const phaseLabel = getPhaseLabel(validation.fromPhase, project.approach);
  pushNotification(notifications, {
    userId: validation.submittedBy,
    kind: "phase_rejected",
    title: "Validation de phase refusée",
    message: `${actorName} a refusé la libération de ${phaseLabel} pour ${project.name}.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}

export function notifyBudgetRevisionRequested(
  notifications: Notification[],
  users: DatabaseUsers,
  project: Project,
  actorName: string,
  amountCHF: number,
): void {
  const mandantId = resolveMandantUserId(users, project);
  if (!mandantId) return;

  const amount = amountCHF.toLocaleString("fr-CH");
  pushNotification(notifications, {
    userId: mandantId,
    kind: "budget_revision_requested",
    title: "Révision budgétaire à valider",
    message: `${actorName} propose un budget de ${amount} CHF pour ${project.name}.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}

export function notifyBudgetRevisionApproved(
  notifications: Notification[],
  project: Project,
  requestedBy: string,
  actorName: string,
  amountCHF: number,
): void {
  const amount = amountCHF.toLocaleString("fr-CH");
  pushNotification(notifications, {
    userId: requestedBy,
    kind: "budget_revision_approved",
    title: "Révision budgétaire approuvée",
    message: `${actorName} a validé la révision à ${amount} CHF pour ${project.name}.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}

export function notifyBudgetApprovalRequired(
  notifications: Notification[],
  users: DatabaseUsers,
  project: Project,
): void {
  const mandantId = resolveMandantUserId(users, project);
  if (!mandantId) return;

  pushNotification(notifications, {
    userId: mandantId,
    kind: "budget_approval_required",
    title: "Budget à valider",
    message: `Le budget du projet ${project.name} attend votre validation mandant.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}

export function notifyDocumentPvPending(
  notifications: Notification[],
  project: Project,
  document: { id: string; title: string; assignedToUserId?: string },
): void {
  if (!document.assignedToUserId) return;

  pushNotification(notifications, {
    userId: document.assignedToUserId,
    kind: "document_pv_pending",
    title: "PV de séance à archiver",
    message: `« ${document.title} » — confirmez l'archivage dans le dossier projet.`,
    href: projectHref(project.id),
    projectId: project.id,
  });
}
