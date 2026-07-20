import { getScenarioById, getReferential } from "@/lib/hermes/referential";
import {
  getNextPhase,
  getPhaseLabel,
  HERMES_APPROACH_LABELS,
} from "@/lib/hermes/phases";
import { getQualityGateForPhase } from "@/lib/hermes/referential";
import { formatDate } from "@/lib/utils";
import type {
  DocumentLocale,
  HermesApproach,
  HermesPhaseId,
  PhaseValidation,
  Project,
  Task,
} from "@/types";
import type { HermesDocumentTemplate } from "@/lib/documents/templates";

const BUDGET_STATUS: Record<string, { fr: string; en: string }> = {
  draft: { fr: "Brouillon", en: "Draft" },
  pending_mandant: { fr: "En attente mandant", en: "Pending sponsor" },
  approved: { fr: "Validé", en: "Approved" },
};

function formatBudget(amount?: number, locale: DocumentLocale = "fr"): string {
  if (!amount) return locale === "en" ? "—" : "—";
  return `${amount.toLocaleString(locale === "en" ? "en-CH" : "fr-CH")} CHF`;
}

function formatHours(hours?: number, locale: DocumentLocale = "fr"): string {
  if (!hours) return "—";
  return locale === "en" ? `${hours} h` : `${hours} h`;
}

function buildTasksList(
  tasks: Task[],
  phase: HermesPhaseId,
  locale: DocumentLocale,
): string {
  const phaseTasks = tasks.filter((task) => task.phase === phase);
  if (phaseTasks.length === 0) {
    return locale === "en" ? "- *(no tasks)*" : "- *(aucune tâche)*";
  }

  return phaseTasks
    .map((task) => {
      const status =
        task.status === "termine"
          ? locale === "en"
            ? "done"
            : "terminé"
          : task.status;
      return `- ${task.title} (${task.progress ?? 0} % — ${status})`;
    })
    .join("\n");
}

export function mergeDocumentTemplate(
  template: HermesDocumentTemplate,
  locale: DocumentLocale,
  project: Project,
  fromPhase: HermesPhaseId,
  validation: PhaseValidation,
  tasks: Task[],
  version: number,
): { title: string; contentMarkdown: string } {
  const approach = project.approach;
  const scenario = project.scenarioId
    ? getScenarioById(project.scenarioId)
    : undefined;
  const gate = getQualityGateForPhase(fromPhase, approach);
  const nextPhase = getNextPhase(fromPhase, approach);
  const body = locale === "en" ? template.bodyEn : template.bodyFr;
  const title = locale === "en" ? template.titleEn : template.titleFr;
  const budgetStatusLabel =
    BUDGET_STATUS[project.budgetStatus]?.[locale] ?? project.budgetStatus;

  const validationDate =
    validation.approvedAt?.slice(0, 10) ??
    validation.sessionDate ??
    validation.submittedAt.slice(0, 10);

  const validationMode =
    validation.mode === "session"
      ? locale === "en"
        ? "Session meeting"
        : "Séance"
      : locale === "en"
        ? "Online"
        : "En ligne";

  const replacements: Record<string, string> = {
    "project.name": project.name,
    "project.description": project.description || (locale === "en" ? "[to be completed]" : "[à compléter]"),
    "project.mandant": project.mandant || "—",
    "project.chefDeProjet": project.chefDeProjet || "—",
    "project.budgetFormatted": formatBudget(project.budget, locale),
    "project.budgetHoursFormatted": formatHours(project.budgetHours, locale),
    "project.budgetStatusLabel": budgetStatusLabel,
    "project.startDate": formatDate(project.startDate),
    "project.endDate": project.endDate ? formatDate(project.endDate) : "—",
    "project.progress": String(project.progress),
    "project.tasksCompleted": String(project.tasksCompleted),
    "project.tasksTotal": String(project.tasksTotal),
    "scenario.label":
      scenario && locale === "en" ? scenario.labelEn : scenario?.labelFr ?? "—",
    "approach.label": HERMES_APPROACH_LABELS[approach],
    "phase.label": getPhaseLabel(fromPhase, approach),
    "phase.nextLabel": nextPhase
      ? getPhaseLabel(nextPhase, approach)
      : locale === "en"
        ? "Closure"
        : "Clôture",
    "phase.tasksList": buildTasksList(tasks, fromPhase, locale),
    "gate.milestone":
      gate && locale === "en"
        ? gate.milestoneFr
        : gate?.milestoneFr ?? "—",
    "validation.signature": validation.signatureText ?? "—",
    "validation.date": formatDate(validationDate),
    "validation.mode": validationMode,
    "generatedAt": new Date().toLocaleString(locale === "en" ? "en-CH" : "fr-CH"),
    "document.version": String(version),
    "hermes.version": getReferential().version,
  };

  let contentMarkdown = body;
  for (const [key, value] of Object.entries(replacements)) {
    contentMarkdown = contentMarkdown.replaceAll(`{{${key}}}`, value);
  }

  return { title, contentMarkdown };
}
