import type { SessionUser } from "@/lib/auth/permissions";
import { getProjectById, listAllBudgetRevisions, listAllPhaseValidations } from "@/lib/db/store";
import {
  approveBudgetRevisionAs,
  approvePhaseGateAs,
  commentTaskAs,
  completeTaskAs,
  getVisibleProject,
  listMyOpenTasks,
  rejectBudgetRevisionAs,
  rejectPhaseGateAs,
  type ActionResult,
} from "@/lib/integrations/actions";
import {
  CARD_VERBS,
  inputIds,
  messageCard,
  myTasksCard,
  pendingDecisionsCard,
  projectStatusCard,
  todayIso,
  type Banner,
  type CardVerb,
  type CardView,
} from "./cards";
import { buildPendingDecisions, buildProjectStatus, withTaskTime } from "./context";
import type { BotI18n } from "./i18n";
import type { AdaptiveCard } from "./types";

/**
 * Actions des cartes adaptatives (Action.Execute, ou Action.Submit sur les anciens clients) :
 * toute autorisation est déléguée à la couche `@/lib/integrations/actions`.
 */

export interface CardActionRequest {
  verb: CardVerb;
  view?: CardView;
  fields: Record<string, string>;
}

const CARD_VIEWS: CardView[] = ["tasks", "decisions", "status"];

function isCardVerb(value: unknown): value is CardVerb {
  return typeof value === "string" && (CARD_VERBS as string[]).includes(value);
}

function isCardView(value: unknown): value is CardView {
  return typeof value === "string" && (CARD_VIEWS as string[]).includes(value);
}

function stringFields(data: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!data || typeof data !== "object") return fields;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "string") fields[key] = value.slice(0, 4000);
  }
  return fields;
}

/** Lit la charge utile d'une action : invoke `adaptiveCard/action` ({action:{verb,data}}) ou valeur Action.Submit. */
export function parseCardAction(value: unknown): CardActionRequest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { action?: { verb?: unknown; data?: unknown }; verb?: unknown };
  const data = record.action ? record.action.data : value;
  const fields = stringFields(data);
  const verb = record.action?.verb ?? fields.verb ?? record.verb;
  if (!isCardVerb(verb)) return null;
  return { verb, view: isCardView(fields.view) ? fields.view : undefined, fields };
}

function input(fields: Record<string, string>, ids: string[]): string {
  for (const id of ids) {
    const value = fields[id]?.trim();
    if (value) return value;
  }
  return "";
}

function failure<T>(i18n: BotI18n, result: Extract<ActionResult<T>, { ok: false }>): Banner {
  return {
    kind: "attention",
    text:
      result.status === 403
        ? i18n.t("errors.forbidden", { error: result.error })
        : i18n.t("errors.failed", { error: result.error }),
  };
}

async function gateStillPending(projectId: string, validationId: string | undefined): Promise<boolean> {
  const validations = await listAllPhaseValidations();
  return validations.some(
    (validation) =>
      validation.projectId === projectId &&
      validation.status === "submitted" &&
      (!validationId || validation.id === validationId),
  );
}

async function budgetStillPending(revisionId: string): Promise<boolean> {
  const revisions = await listAllBudgetRevisions();
  return revisions.some((revision) => revision.id === revisionId && revision.status === "pending_mandant");
}

/** Exécute le verbe ; renvoie le bandeau de résultat (aucun pour `refresh`). */
export async function runCardAction(
  user: SessionUser,
  request: CardActionRequest,
  i18n: BotI18n,
): Promise<Banner | undefined> {
  const { t } = i18n;
  const { fields } = request;
  const handled: Banner = { kind: "warning", text: t("decisions.alreadyHandled") };
  switch (request.verb) {
    case "refresh":
      return undefined;
    case "completeTask": {
      const result = await completeTaskAs(user, fields.taskId ?? "");
      return result.ok
        ? { kind: "good", text: t("tasks.completed", { title: result.value.title }) }
        : failure(i18n, result);
    }
    case "commentTask": {
      const taskId = fields.taskId ?? "";
      const text = input(fields, [inputIds.comment(taskId), "comment"]);
      if (!text) return { kind: "warning", text: t("tasks.commentRequired") };
      const result = await commentTaskAs(user, taskId, text);
      return result.ok
        ? { kind: "good", text: t("tasks.commented", { title: result.value.title }) }
        : failure(i18n, result);
    }
    case "approveGate": {
      const projectId = fields.projectId ?? "";
      const signature = input(fields, [inputIds.signature(fields.validationId ?? ""), "signature"]);
      if (!signature) return { kind: "warning", text: t("decisions.signatureRequired") };
      if (!(await gateStillPending(projectId, fields.validationId))) return handled;
      const result = await approvePhaseGateAs(user, projectId, signature);
      return result.ok
        ? { kind: "good", text: t("decisions.gateApproved", { project: result.value.project.name }) }
        : failure(i18n, result);
    }
    case "rejectGate": {
      const projectId = fields.projectId ?? "";
      const reason = input(fields, [inputIds.reason(fields.validationId ?? ""), "reason", "comment"]);
      if (!reason) return { kind: "warning", text: t("decisions.rejectRequired") };
      if (!(await gateStillPending(projectId, fields.validationId))) return handled;
      const result = await rejectPhaseGateAs(user, projectId, reason);
      if (!result.ok) return failure(i18n, result);
      const project = await getProjectById(projectId);
      return { kind: "good", text: t("decisions.gateRejected", { project: project?.name ?? "" }) };
    }
    case "approveBudget": {
      const revisionId = fields.revisionId ?? "";
      const signature = input(fields, [inputIds.signature(revisionId), "signature"]);
      if (!signature) return { kind: "warning", text: t("decisions.signatureRequired") };
      if (!(await budgetStillPending(revisionId))) return handled;
      const result = await approveBudgetRevisionAs(user, revisionId, signature);
      return result.ok
        ? { kind: "good", text: t("decisions.budgetApproved", { project: result.value.project.name }) }
        : failure(i18n, result);
    }
    case "rejectBudget": {
      const revisionId = fields.revisionId ?? "";
      const reason = input(fields, [inputIds.reason(revisionId), "reason", "comment"]);
      if (!reason) return { kind: "warning", text: t("decisions.rejectRequired") };
      if (!(await budgetStillPending(revisionId))) return handled;
      const result = await rejectBudgetRevisionAs(user, revisionId, reason);
      if (!result.ok) return failure(i18n, result);
      const project = await getProjectById(result.value.projectId);
      return { kind: "good", text: t("decisions.budgetRejected", { project: project?.name ?? "" }) };
    }
    default: {
      const exhaustive: never = request.verb;
      return { kind: "attention", text: `${t("errors.unknownAction")} ${String(exhaustive)}` };
    }
  }
}

/** Vue régénérée après l'action : déduite du verbe si la carte ne la précise pas. */
export function viewFor(request: CardActionRequest): CardView {
  if (request.view) return request.view;
  switch (request.verb) {
    case "completeTask":
    case "commentTask":
    case "refresh":
      return "tasks";
    case "approveGate":
    case "rejectGate":
    case "approveBudget":
    case "rejectBudget":
      return "decisions";
    default: {
      const exhaustive: never = request.verb;
      return exhaustive;
    }
  }
}

/** Carte à jour pour l'utilisateur qui agit (liste personnelle ou état du projet). */
export async function renderCardView(
  user: SessionUser,
  view: CardView,
  fields: Record<string, string>,
  i18n: BotI18n,
  banner?: Banner,
): Promise<AdaptiveCard> {
  switch (view) {
    case "tasks":
      return myTasksCard(i18n, await withTaskTime(await listMyOpenTasks(user)), todayIso(), banner);
    case "decisions": {
      const { gates, budgets } = await buildPendingDecisions(user);
      return pendingDecisionsCard(i18n, gates, budgets, banner);
    }
    case "status": {
      const project = fields.projectId ? await getVisibleProject(user, fields.projectId) : null;
      if (!project) {
        return messageCard(i18n, banner ?? { kind: "warning", text: i18n.t("status.notFound", { query: "" }) });
      }
      return projectStatusCard(i18n, await buildProjectStatus(project), banner);
    }
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}
