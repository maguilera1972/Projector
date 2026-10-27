import {
  hasPermission,
  isUserActive,
  PERMISSIONS,
  toSessionUser,
  type SessionUser,
} from "@/lib/auth/permissions";
import {
  appendTaskComment,
  approveBudgetRevision,
  approvePhaseValidation,
  getBudgetRevisionById,
  getProjectById,
  getUserByEntraOid,
  listActivities,
  listAllBudgetRevisions,
  listAllPhaseValidations,
  listPortfolios,
  listProjects,
  listTasks,
  rejectBudgetRevision,
  rejectPhaseValidation,
  updateTaskFields,
} from "@/lib/db/store";
import { canUserActAsMandant } from "@/lib/hermes/project-roles";
import { isProjectVisibleInReports } from "@/lib/reports/access";
import { getTaskDetailContext } from "@/lib/tasks/access";
import type { BudgetRevision, PhaseValidation, Project, Task } from "@/types";

/**
 * Actions PROJECTOR exposées à Teams (bot, cartes adaptatives) et à Copilot (API plugin).
 * Chaque action applique les mêmes règles d'autorisation que l'interface web.
 */

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404; error: string };

function fail(status: 400 | 403 | 404, error: string): { ok: false; status: 400 | 403 | 404; error: string } {
  return { ok: false, status, error };
}

/** Utilisateur PROJECTOR actif lié à un objet Entra (aadObjectId Teams / claim oid). */
export async function resolveUserByEntraOid(oid: string | undefined): Promise<SessionUser | null> {
  if (!oid) return null;
  const user = await getUserByEntraOid(oid);
  return user && isUserActive(user) && !user.pendingApproval ? toSessionUser(user) : null;
}

/** Projets visibles : tous pour les internes (projects:read), projets liés pour les invités externes. */
export async function listVisibleProjects(user: SessionUser): Promise<Project[]> {
  if (!hasPermission(user, PERMISSIONS.PROJECTS_READ)) return [];
  const [projects, portfolios, tasks, activities] = await Promise.all([
    listProjects(),
    listPortfolios(true),
    listTasks(),
    listActivities(),
  ]);
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));
  return projects
    .filter((project) =>
      isProjectVisibleInReports(
        user,
        project,
        project.portfolioId ? portfolioById.get(project.portfolioId) : undefined,
        tasks,
        activities,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function getVisibleProject(user: SessionUser, projectId: string): Promise<Project | null> {
  const projects = await listVisibleProjects(user);
  return projects.find((project) => project.id === projectId) ?? null;
}

/** Recherche un projet visible par identifiant ou par nom (exact, puis partiel). */
export async function findVisibleProject(user: SessionUser, query: string): Promise<Project | null> {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const projects = await listVisibleProjects(user);
  return (
    projects.find((project) => project.id === query.trim()) ??
    projects.find((project) => project.name.toLowerCase() === needle) ??
    projects.find((project) => project.name.toLowerCase().includes(needle)) ??
    null
  );
}

export interface TaskWithProject {
  task: Task;
  project: Project;
}

/** Tâches ouvertes assignées à l'utilisateur, triées par échéance. */
export async function listMyOpenTasks(user: SessionUser): Promise<TaskWithProject[]> {
  const [tasks, projects] = await Promise.all([listTasks(), listProjects()]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return tasks
    .filter((task) => task.assigneeId === user.id && task.status !== "termine")
    .map((task) => ({ task, project: projectById.get(task.projectId) }))
    .filter((item): item is TaskWithProject => Boolean(item.project))
    .sort((a, b) => (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999"));
}

export interface PendingDecisions {
  phaseGates: { validation: PhaseValidation; project: Project }[];
  budgetRevisions: { revision: BudgetRevision; project: Project }[];
}

/** Décisions en attente de l'utilisateur en tant que mandant (ou toutes si `all`). */
export async function listPendingDecisions(
  user: SessionUser | null,
  options: { all?: boolean } = {},
): Promise<PendingDecisions> {
  const [validations, revisions, projects] = await Promise.all([
    listAllPhaseValidations(),
    listAllBudgetRevisions(),
    listProjects(),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const allowed = (project: Project) =>
    options.all || (user !== null && canUserActAsMandant(user, project));

  return {
    phaseGates: validations
      .filter((validation) => validation.status === "submitted")
      .map((validation) => ({ validation, project: projectById.get(validation.projectId)! }))
      .filter((item) => item.project && allowed(item.project)),
    budgetRevisions: revisions
      .filter((revision) => revision.status === "pending_mandant")
      .map((revision) => ({ revision, project: projectById.get(revision.projectId)! }))
      .filter((item) => item.project && allowed(item.project)),
  };
}

async function activeValidation(projectId: string): Promise<PhaseValidation | undefined> {
  const validations = await listAllPhaseValidations();
  return validations.find(
    (validation) => validation.projectId === projectId && validation.status === "submitted",
  );
}

export async function approvePhaseGateAs(
  user: SessionUser,
  projectId: string,
  signatureText: string,
): Promise<ActionResult<{ project: Project; validation: PhaseValidation }>> {
  const project = await getProjectById(projectId);
  if (!project) return fail(404, "Projet introuvable.");
  if (!canUserActAsMandant(user, project)) return fail(403, "Seul le mandant peut valider la phase.");
  const active = await activeValidation(projectId);
  if (!active) return fail(400, "Aucune demande de validation en attente.");
  try {
    const value = await approvePhaseValidation(active.id, user.id, user.name, {
      signatureText: signatureText.trim() || user.name,
    });
    return { ok: true, value };
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Validation impossible.");
  }
}

export async function rejectPhaseGateAs(
  user: SessionUser,
  projectId: string,
  comment: string,
): Promise<ActionResult<PhaseValidation>> {
  const project = await getProjectById(projectId);
  if (!project) return fail(404, "Projet introuvable.");
  if (!canUserActAsMandant(user, project)) return fail(403, "Seul le mandant peut refuser la phase.");
  if (!comment.trim()) return fail(400, "Un motif de refus est requis.");
  const active = await activeValidation(projectId);
  if (!active) return fail(400, "Aucune demande de validation en attente.");
  try {
    return { ok: true, value: await rejectPhaseValidation(active.id, user.id, user.name, { comment }) };
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Refus impossible.");
  }
}

async function revisionWithMandantCheck(
  user: SessionUser,
  revisionId: string,
): Promise<ActionResult<{ revision: BudgetRevision; project: Project }>> {
  const revision = await getBudgetRevisionById(revisionId);
  if (!revision) return fail(404, "Révision introuvable.");
  const project = await getProjectById(revision.projectId);
  if (!project) return fail(404, "Projet introuvable.");
  if (!canUserActAsMandant(user, project)) return fail(403, "Seul le mandant peut statuer sur le budget.");
  return { ok: true, value: { revision, project } };
}

export async function approveBudgetRevisionAs(
  user: SessionUser,
  revisionId: string,
  signatureText: string,
): Promise<ActionResult<{ project: Project; revision: BudgetRevision }>> {
  const check = await revisionWithMandantCheck(user, revisionId);
  if (!check.ok) return check;
  try {
    const value = await approveBudgetRevision(revisionId, user.id, user.name, {
      signatureText: signatureText.trim() || user.name,
    });
    return { ok: true, value };
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Validation impossible.");
  }
}

export async function rejectBudgetRevisionAs(
  user: SessionUser,
  revisionId: string,
  comment: string,
): Promise<ActionResult<BudgetRevision>> {
  const check = await revisionWithMandantCheck(user, revisionId);
  if (!check.ok) return check;
  try {
    return { ok: true, value: await rejectBudgetRevision(revisionId, user.id, user.name, comment) };
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Refus impossible.");
  }
}

/** Marque une tâche terminée (mêmes droits que la modification du statut dans l'interface). */
export async function completeTaskAs(user: SessionUser, taskId: string): Promise<ActionResult<Task>> {
  const context = await getTaskDetailContext(taskId, user);
  if (!context) return fail(404, "Tâche introuvable.");
  if (!context.permissions.canEditTaskFields) {
    return fail(403, "Vous ne pouvez pas modifier le statut de cette tâche.");
  }
  try {
    return { ok: true, value: await updateTaskFields(taskId, { status: "termine", progress: 100 }, user.id) };
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Mise à jour impossible.");
  }
}

export async function commentTaskAs(
  user: SessionUser,
  taskId: string,
  text: string,
): Promise<ActionResult<Task>> {
  const context = await getTaskDetailContext(taskId, user);
  if (!context) return fail(404, "Tâche introuvable.");
  const canComment =
    context.permissions.canManage ||
    (context.permissions.canWork && context.task.assigneeId === user.id);
  if (!canComment) return fail(403, "Vous ne pouvez pas commenter cette tâche.");
  try {
    return { ok: true, value: await appendTaskComment(taskId, { id: user.id, name: user.name }, text) };
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Commentaire impossible.");
  }
}
