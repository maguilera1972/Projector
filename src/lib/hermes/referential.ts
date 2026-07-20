import referentialData from "../../../reference-data/hermes/referential.json";
import type { HermesApproach, HermesPhaseId } from "@/types";

export interface HermesScenario {
  id: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  moduleIds: string[];
}

export interface HermesModule {
  id: string;
  labelFr: string;
  labelEn: string;
}

export interface HermesTaskTemplate {
  id: string;
  moduleId: string;
  phase: HermesPhaseId;
  titleFr: string;
  titleEn: string;
  order: number;
  approaches: HermesApproach[];
}

export interface HermesQualityGate {
  id: string;
  fromPhase: HermesPhaseId;
  approaches: HermesApproach[];
  labelFr: string;
  labelEn: string;
  milestoneFr: string;
  requiredOutcomesFr: string[];
  requiresBudgetApproval: boolean;
  isTerminal?: boolean;
}

export interface HermesReferential {
  version: string;
  source: string;
  scenarios: HermesScenario[];
  modules: HermesModule[];
  taskTemplates: HermesTaskTemplate[];
  qualityGates?: HermesQualityGate[];
}

const referential = referentialData as HermesReferential;

export function getReferential(): HermesReferential {
  return referential;
}

export function listScenarios(): HermesScenario[] {
  return referential.scenarios;
}

export function getScenarioById(id: string): HermesScenario | undefined {
  return referential.scenarios.find((s) => s.id === id);
}

export function getModuleById(id: string): HermesModule | undefined {
  return referential.modules.find((m) => m.id === id);
}

export function getModuleLabel(moduleId: string, locale: "fr" | "en" = "fr"): string {
  const mod = getModuleById(moduleId);
  if (!mod) return moduleId;
  return locale === "en" ? mod.labelEn : mod.labelFr;
}

export function getTaskTemplatesForScenario(
  scenarioId: string,
  approach: HermesApproach,
): HermesTaskTemplate[] {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) return [];

  const moduleSet = new Set(scenario.moduleIds);

  return referential.taskTemplates
    .filter(
      (t) =>
        moduleSet.has(t.moduleId) && t.approaches.includes(approach),
    )
    .sort((a, b) => a.order - b.order);
}

export function getQualityGateForPhase(
  phaseId: HermesPhaseId,
  approach: HermesApproach,
): HermesQualityGate | undefined {
  return (referential.qualityGates ?? []).find(
    (gate) =>
      gate.fromPhase === phaseId && gate.approaches.includes(approach),
  );
}
