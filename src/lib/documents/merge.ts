import { getReferential } from "@/lib/hermes/referential";
import { getNextPhase } from "@/lib/hermes/phases";
import {
  localizeDocumentTemplateTitle,
  localizeScenario,
} from "@/lib/hermes/i18n";
import { toIntlLocale } from "@/lib/i18n/config";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
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

function formatBudget(amount?: number, locale: DocumentLocale = "fr"): string {
  if (!amount) return "—";
  return `${amount.toLocaleString(toIntlLocale(locale))} CHF`;
}

function formatHours(hours?: number): string {
  if (!hours) return "—";
  return `${hours} h`;
}

function buildTasksList(
  tasks: Task[],
  phase: HermesPhaseId,
  locale: DocumentLocale,
): string {
  const t = getTranslator(locale);
  const phaseTasks = tasks.filter((task) => task.phase === phase);
  if (phaseTasks.length === 0) {
    return `- *(${t("docs.noTasks")})*`;
  }

  return phaseTasks
    .map((task) => {
      const status = tDynamic(t, `enums.taskStatus.${task.status}`);
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
  const t = getTranslator(locale);
  const scenario = localizeScenario(project.scenarioId, locale);
  const gate = getQualityGateForPhase(fromPhase, approach);
  const nextPhase = getNextPhase(fromPhase, approach);
  // Corps rédigés en FR et EN uniquement : les autres langues utilisent l'anglais
  // avec les libellés (titres, phases, statuts) traduits.
  const body = locale === "fr" ? template.bodyFr : template.bodyEn;
  const title = localizeDocumentTemplateTitle(template.id, locale, {
    fr: template.titleFr,
    en: template.titleEn,
  });
  const budgetStatusLabel = tDynamic(t, `enums.budgetStatus.${project.budgetStatus}`);

  const validationDate =
    validation.approvedAt?.slice(0, 10) ??
    validation.sessionDate ??
    validation.submittedAt.slice(0, 10);

  const validationMode =
    validation.mode === "session" ? t("docs.session") : t("docs.online");

  const replacements: Record<string, string> = {
    "project.name": project.name,
    "project.description": project.description || t("docs.toBeCompleted"),
    "project.mandant": project.mandant || "—",
    "project.chefDeProjet": project.chefDeProjet || "—",
    "project.budgetFormatted": formatBudget(project.budget, locale),
    "project.budgetHoursFormatted": formatHours(project.budgetHours),
    "project.budgetStatusLabel": budgetStatusLabel,
    "project.startDate": formatDate(project.startDate, locale),
    "project.endDate": project.endDate ? formatDate(project.endDate, locale) : "—",
    "project.progress": String(project.progress),
    "project.tasksCompleted": String(project.tasksCompleted),
    "project.tasksTotal": String(project.tasksTotal),
    "scenario.label": scenario?.label ?? "—",
    "approach.label": tDynamic(t, `enums.approach.${approach}`),
    "phase.label": tDynamic(t, `enums.phase.${fromPhase}`),
    "phase.nextLabel": nextPhase
      ? tDynamic(t, `enums.phase.${nextPhase}`)
      : t("docs.closure"),
    "phase.tasksList": buildTasksList(tasks, fromPhase, locale),
    "gate.milestone": gate?.milestoneFr ?? "—",
    "validation.signature": validation.signatureText ?? "—",
    "validation.date": formatDate(validationDate, locale),
    "validation.mode": validationMode,
    "generatedAt": new Date().toLocaleString(toIntlLocale(locale)),
    "document.version": String(version),
    "hermes.version": getReferential().version,
  };

  let contentMarkdown = body;
  for (const [key, value] of Object.entries(replacements)) {
    contentMarkdown = contentMarkdown.replaceAll(`{{${key}}}`, value);
  }

  return { title, contentMarkdown };
}
