import { getQualityGateForPhase } from "@/lib/hermes/referential";
import { getNextPhase, getPhaseLabel, isTerminalPhase } from "@/lib/hermes/phases";
import type {
  BudgetRevision,
  BudgetStatus,
  HermesApproach,
  HermesPhaseId,
  PhaseValidation,
  Project,
  QualityGateCheckItem,
  QualityGateContext,
  Task,
} from "@/types";

function isTaskComplete(task: Task): boolean {
  return task.status === "termine" || (task.progress ?? 0) >= 100;
}

export function buildQualityGateChecklist(
  project: Project,
  tasks: Task[],
  budgetRevisions: BudgetRevision[],
  generatedDocuments: { phase: HermesPhaseId; outcomeKey: string }[] = [],
): QualityGateCheckItem[] {
  const phaseTasks = tasks.filter((task) => task.phase === project.currentPhase);
  const completed = phaseTasks.filter(isTaskComplete).length;
  const total = phaseTasks.length;

  const items: QualityGateCheckItem[] = [
    {
      id: "mandant_user",
      label: "Utilisateur mandant lié au projet",
      status: project.mandantUserId ? "ok" : "blocked",
      detail: project.mandantUserId
        ? undefined
        : "Assignez un mandant dans Paramètres → Administration → Mandants de projet.",
    },
    {
      id: "phase_tasks",
      label: `Tâches de la phase terminées (${completed}/${total})`,
      status:
        total === 0
          ? "ok"
          : completed === total
            ? "ok"
            : "blocked",
      detail:
        total === 0
          ? "Aucune tâche instanciée pour cette phase."
          : undefined,
    },
  ];

  const gate = getQualityGateForPhase(project.currentPhase, project.approach);

  if (gate?.requiresBudgetApproval || project.currentPhase === "initialisation") {
    items.push({
      id: "budget_approved",
      label: "Budget global validé par le mandant",
      status: project.budgetStatus === "approved" ? "ok" : "blocked",
      detail:
        project.budgetStatus === "pending_mandant"
          ? project.currentPhase === "initialisation"
            ? "En attente — le chef de projet peut confirmer la validation (accord mandant signé requis)."
            : "En attente de validation mandant."
          : project.budgetStatus === "draft"
            ? "Budget non soumis à validation."
            : undefined,
    });
  }

  const pendingRevision = budgetRevisions.find(
    (rev) => rev.status === "pending_mandant",
  );
  items.push({
    id: "budget_revision",
    label: "Révision budgétaire en attente",
    status: pendingRevision ? "blocked" : "ok",
    detail: pendingRevision
      ? `Révision « ${pendingRevision.reason?.trim() || "sans motif"} » — validez dans la section Budget ci-dessus (mandant en ligne ou confirmation en séance).`
      : undefined,
  });

  if (gate) {
    for (const outcome of gate.requiredOutcomesFr) {
      const hasDoc = generatedDocuments.some(
        (doc) =>
          doc.phase === project.currentPhase && doc.outcomeKey === outcome,
      );
      items.push({
        id: `outcome_${outcome}`,
        label: `Résultat HERMES : ${outcome}`,
        status: hasDoc ? "ok" : "pending",
        detail: hasDoc
          ? "Document généré automatiquement."
          : "Généré automatiquement à la validation de phase.",
      });
    }
  }

  return items;
}

export function isChecklistReady(items: QualityGateCheckItem[]): boolean {
  return (
    items.every(
      (item) => item.status === "ok" || item.status === "pending",
    ) && !items.some((item) => item.status === "blocked")
  );
}

/** Critères assouplis pour une validation en séance (signature mandant sur place). */
const SESSION_OPTIONAL_CHECKLIST_IDS = new Set([
  "phase_tasks",
  "budget_approved",
  "budget_revision",
]);

export function isChecklistReadyForSession(
  items: QualityGateCheckItem[],
): boolean {
  return !items.some(
    (item) =>
      item.status === "blocked" &&
      !SESSION_OPTIONAL_CHECKLIST_IDS.has(item.id),
  );
}

export function getBlockedChecklistItems(
  items: QualityGateCheckItem[],
  forSession = false,
): QualityGateCheckItem[] {
  return items.filter((item) => {
    if (item.status !== "blocked") return false;
    if (forSession && SESSION_OPTIONAL_CHECKLIST_IDS.has(item.id)) {
      return false;
    }
    return true;
  });
}

export function buildQualityGateContext(
  project: Project,
  tasks: Task[],
  budgetRevisions: BudgetRevision[],
  activeValidation?: PhaseValidation | null,
  pendingPvDocuments = 0,
  generatedDocuments: { phase: HermesPhaseId; outcomeKey: string }[] = [],
): QualityGateContext {
  const gate = getQualityGateForPhase(project.currentPhase, project.approach);
  const nextPhase = getNextPhase(project.currentPhase, project.approach);
  const checklist = buildQualityGateChecklist(
    project,
    tasks,
    budgetRevisions,
    generatedDocuments,
  );
  const terminal = isTerminalPhase(project.currentPhase, project.approach);

  return {
    projectId: project.id,
    currentPhase: project.currentPhase,
    nextPhase,
    approach: project.approach,
    gateLabel: gate?.labelFr ?? "Quality gate",
    milestone: gate?.milestoneFr,
    isTerminal: terminal || gate?.isTerminal === true,
    checklist,
    checklistReady: isChecklistReady(checklist),
    checklistReadyForSession: isChecklistReadyForSession(checklist),
    budgetStatus: project.budgetStatus,
    activeValidation: activeValidation ?? null,
    canAdvance: Boolean(nextPhase) || terminal,
    pendingPvDocuments,
  };
}

export function getInitialBudgetStatus(
  budget?: number,
  budgetHours?: number,
): BudgetStatus {
  if ((budget ?? 0) > 0 || (budgetHours ?? 0) > 0) {
    return "pending_mandant";
  }
  return "pending_mandant";
}

export function formatPhaseTransition(
  from: HermesPhaseId,
  to: HermesPhaseId | null,
  approach: HermesApproach,
): string {
  if (!to) return getPhaseLabel(from, approach);
  return `${getPhaseLabel(from, approach)} → ${getPhaseLabel(to, approach)}`;
}
