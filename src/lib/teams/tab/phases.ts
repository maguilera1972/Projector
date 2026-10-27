import { getPhasesForApproach } from "@/lib/hermes/phases";
import type { HermesApproach, HermesPhaseId } from "@/types";

const PHASE_IDS: readonly HermesPhaseId[] = [
  "initialisation",
  "conception",
  "realisation",
  "deploiement",
  "execution",
  "cloture",
];

export function isHermesPhaseId(value: unknown): value is HermesPhaseId {
  return typeof value === "string" && (PHASE_IDS as readonly string[]).includes(value);
}

/** Phases proposées pour un onglet de canal, dans l'ordre de l'approche du projet. */
export function tabPhasesForApproach(approach: HermesApproach): HermesPhaseId[] {
  return getPhasesForApproach(approach).map((phase) => phase.id);
}

/** entityId stable d'un onglet configurable (identique à celui des onglets créés par Graph). */
export function projectTabEntityId(projectId: string, phase?: HermesPhaseId): string {
  return `projector-project-${projectId}-${phase ?? "general"}`;
}

export function projectTabContentUrl(origin: string, projectId: string, phase?: HermesPhaseId): string {
  const base = `${origin.replace(/\/$/, "")}/teams/project/${encodeURIComponent(projectId)}`;
  return phase ? `${base}?phase=${phase}` : base;
}
