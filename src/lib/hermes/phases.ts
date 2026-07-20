import type { HermesApproach, HermesPhase, HermesPhaseId } from "@/types";

export const HERMES_APPROACH_LABELS: Record<HermesApproach, string> = {
  classic: "Classique",
  agile: "Agile",
};

export const HERMES_APPROACH_DESCRIPTIONS: Record<HermesApproach, string> = {
  classic:
    "Initialisation → Conception → Réalisation → Déploiement → Clôture",
  agile: "Initialisation → Exécution → Clôture (libérations intermédiaires optionnelles)",
};

const CLASSIC_PHASES: HermesPhase[] = [
  {
    id: "initialisation",
    label: "Initialisation",
    description: "Mandat, faisabilité et cadrage du projet.",
    order: 1,
  },
  {
    id: "conception",
    label: "Conception",
    description: "Planification, architecture et préparation.",
    order: 2,
  },
  {
    id: "realisation",
    label: "Réalisation",
    description: "Exécution et production des livrables.",
    order: 3,
  },
  {
    id: "deploiement",
    label: "Déploiement",
    description: "Mise en service et transfert aux opérations.",
    order: 4,
  },
  {
    id: "cloture",
    label: "Clôture",
    description: "Évaluation, clôture et capitalisation.",
    order: 5,
  },
];

const AGILE_PHASES: HermesPhase[] = [
  {
    id: "initialisation",
    label: "Initialisation",
    description: "Mandat, faisabilité et choix de l'approche.",
    order: 1,
  },
  {
    id: "execution",
    label: "Exécution",
    description: "Développement itératif avec libérations intermédiaires.",
    order: 2,
  },
  {
    id: "cloture",
    label: "Clôture",
    description: "Évaluation, clôture et capitalisation.",
    order: 3,
  },
];

export function getPhasesForApproach(approach: HermesApproach): HermesPhase[] {
  return approach === "agile" ? AGILE_PHASES : CLASSIC_PHASES;
}

export function getFirstPhase(approach: HermesApproach): HermesPhaseId {
  return "initialisation";
}

export function getNextPhase(
  currentPhase: HermesPhaseId,
  approach: HermesApproach,
): HermesPhaseId | null {
  const phases = getPhasesForApproach(approach);
  const index = phases.findIndex((phase) => phase.id === currentPhase);
  if (index === -1 || index >= phases.length - 1) {
    return null;
  }
  return phases[index + 1].id;
}

export function isTerminalPhase(
  phaseId: HermesPhaseId,
  approach: HermesApproach,
): boolean {
  const phases = getPhasesForApproach(approach);
  const last = phases[phases.length - 1];
  return last?.id === phaseId;
}

export function getPhaseLabel(
  phaseId: HermesPhaseId,
  approach: HermesApproach,
): string {
  const phases = getPhasesForApproach(approach);
  return phases.find((p) => p.id === phaseId)?.label ?? phaseId;
}

/** Phases affichées dans l'aide (référence classique HERMES 5.1). */
export const HERMES_REFERENCE_PHASES = CLASSIC_PHASES;
