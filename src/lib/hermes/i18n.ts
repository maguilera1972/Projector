import overlayData from "../../../reference-data/hermes/i18n.json";
import type { Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import {
  getModuleById,
  getReferential,
  getScenarioById,
  type HermesQualityGate,
} from "@/lib/hermes/referential";
import type { HermesApproach, HermesPhase, HermesPhaseId, Task } from "@/types";

interface ReferentialOverlay {
  scenarios?: Record<string, { label: string; description: string }>;
  modules?: Record<string, string>;
  taskTemplates?: Record<string, string>;
  qualityGates?: Record<string, string>;
  documentTemplates?: Record<string, string>;
}

const overlays = overlayData as unknown as Partial<Record<Locale, ReferentialOverlay>>;

function overlay(locale: Locale): ReferentialOverlay | undefined {
  return locale === "fr" || locale === "en" ? undefined : overlays[locale];
}

export function localizeScenario(
  scenarioId: string | undefined,
  locale: Locale,
): { label: string; description: string } | null {
  if (!scenarioId) return null;
  const scenario = getScenarioById(scenarioId);
  if (!scenario) return null;
  if (locale === "fr") {
    return { label: scenario.labelFr, description: scenario.descriptionFr };
  }
  const translated = overlay(locale)?.scenarios?.[scenarioId];
  return translated ?? { label: scenario.labelEn, description: scenario.descriptionEn };
}

export function localizeModule(
  moduleId: string | undefined,
  locale: Locale,
  fallback?: string,
): string {
  if (!moduleId) return fallback ?? "";
  const mod = getModuleById(moduleId);
  if (!mod) return fallback ?? moduleId;
  if (locale === "fr") return mod.labelFr;
  return overlay(locale)?.modules?.[moduleId] ?? mod.labelEn;
}

export function localizeTaskTemplateTitle(
  templateId: string | undefined,
  locale: Locale,
  fallback: string,
): string {
  if (!templateId) return fallback;
  const template = getReferential().taskTemplates.find((t) => t.id === templateId);
  if (!template) return fallback;
  // Un titre modifié manuellement n'est jamais remplacé.
  if (fallback !== template.titleFr && fallback !== template.titleEn) return fallback;
  if (locale === "fr") return template.titleFr;
  return overlay(locale)?.taskTemplates?.[templateId] ?? template.titleEn;
}

export function localizeQualityGateLabel(
  gate: HermesQualityGate | undefined,
  locale: Locale,
): string {
  if (!gate) return "";
  if (locale === "fr") return gate.labelFr;
  return overlay(locale)?.qualityGates?.[gate.id] ?? gate.labelEn;
}

export function localizeDocumentTemplateTitle(
  templateId: string,
  locale: Locale,
  titles: { fr: string; en: string },
): string {
  if (locale === "fr") return titles.fr;
  return overlay(locale)?.documentTemplates?.[templateId] ?? titles.en;
}

/** Applique la langue du projet aux libellés HERMES d'une tâche (titre et module). */
export function localizeTask<T extends Task>(task: T, locale: Locale): T {
  if (locale === "fr" && !task.templateId) return task;
  return {
    ...task,
    title: localizeTaskTemplateTitle(task.templateId, locale, task.title),
    module: localizeModule(task.moduleId, locale, task.module),
  };
}

export function localizeTasks<T extends Task>(
  tasks: T[],
  localeForProject: (projectId: string) => Locale,
): T[] {
  return tasks.map((task) => localizeTask(task, localeForProject(task.projectId)));
}

export function getLocalizedPhaseLabel(phaseId: HermesPhaseId, locale: Locale): string {
  return tDynamic(getTranslator(locale), `enums.phase.${phaseId}`);
}

export function getLocalizedApproachLabel(approach: HermesApproach, locale: Locale): string {
  return tDynamic(getTranslator(locale), `enums.approach.${approach}`);
}

export function getLocalizedPhases(
  phases: HermesPhase[],
  approach: HermesApproach,
  locale: Locale,
): HermesPhase[] {
  const t = getTranslator(locale);
  return phases.map((phase) => {
    const descriptionKey =
      phase.id === "initialisation" && approach === "agile"
        ? "initialisationAgile"
        : phase.id;
    return {
      ...phase,
      label: tDynamic(t, `enums.phase.${phase.id}`),
      description: tDynamic(t, `enums.phaseDescription.${descriptionKey}`),
    };
  });
}
