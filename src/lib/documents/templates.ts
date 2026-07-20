import referentialData from "../../../reference-data/hermes/referential.json";
import registryData from "../../../reference-data/hermes/template-registry.json";
import type { GeneratedDocument, HermesPhaseId } from "@/types";
import { getQualityGateForPhase } from "@/lib/hermes/referential";

export interface HermesDocumentTemplate {
  id: string;
  outcomeKeysFr: string[];
  phases: HermesPhaseId[];
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
  /** Fichier gabarit Word HERMES officiel (.dotx). */
  wordFile?: string;
}

const registryTemplates = (
  registryData as { templates: { id: string; wordFile: string; outcomeKeysFr: string[]; phases: HermesPhaseId[] }[] }
).templates;

const wordById = new Map(
  registryTemplates.map((entry) => [entry.id, entry.wordFile]),
);

function wordFileForTemplate(template: HermesDocumentTemplate): string | undefined {
  const direct = wordById.get(template.id);
  if (direct) return direct;

  return registryTemplates.find(
    (entry) =>
      entry.outcomeKeysFr.some((key) => template.outcomeKeysFr.includes(key)) &&
      entry.phases.some((phase) => template.phases.includes(phase)),
  )?.wordFile;
}

const templates = (
  (referentialData as { documentTemplates?: HermesDocumentTemplate[] })
    .documentTemplates ?? []
).map((template) => ({
  ...template,
  wordFile: wordFileForTemplate(template),
}));

export function listDocumentTemplates(): HermesDocumentTemplate[] {
  return templates;
}

export function getDocumentTemplateById(
  id: string,
): HermesDocumentTemplate | undefined {
  return templates.find((template) => template.id === id);
}

/** Résout le fichier .dotx HERMES (utilisable côté client et serveur). */
export function resolveWordTemplateFile(
  document: GeneratedDocument,
): string | undefined {
  if (document.wordTemplateFile) return document.wordTemplateFile;

  const byTemplateId = getDocumentTemplateById(document.templateId)?.wordFile;
  if (byTemplateId) return byTemplateId;

  return findTemplateForOutcome(document.outcomeKey, document.phase)?.wordFile;
}

export function findTemplateForOutcome(
  outcomeKey: string,
  phase: HermesPhaseId,
): HermesDocumentTemplate | undefined {
  return templates.find(
    (template) =>
      template.outcomeKeysFr.includes(outcomeKey) &&
      template.phases.includes(phase),
  );
}

export function resolveTemplatesForPhaseValidation(
  fromPhase: HermesPhaseId,
  approach: "classic" | "agile",
): HermesDocumentTemplate[] {
  const gate = getQualityGateForPhase(fromPhase, approach);
  const resolved: HermesDocumentTemplate[] = [];
  const seen = new Set<string>();

  function add(template: HermesDocumentTemplate | undefined) {
    if (!template || seen.has(template.id)) return;
    seen.add(template.id);
    resolved.push(template);
  }

  if (gate) {
    for (const outcome of gate.requiredOutcomesFr) {
      add(findTemplateForOutcome(outcome, fromPhase));
    }
  }

  add(findTemplateForOutcome("Rapport de phase", fromPhase));
  add(getDocumentTemplateById("hermes-rapport-phase"));

  return resolved;
}
