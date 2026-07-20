import { getPhaseLabel } from "@/lib/hermes/phases";
import { getScenarioById } from "@/lib/hermes/referential";
import type { HermesApproach, HermesPhaseId, Task } from "@/types";

interface PhaseGroup {
  phaseId: HermesPhaseId;
  phaseLabel: string;
  modules: ModuleGroup[];
}

interface ModuleGroup {
  module: string;
  tasks: Task[];
}

export function groupTasksByPhaseAndModule(
  tasks: Task[],
  approach: HermesApproach,
): PhaseGroup[] {
  const sorted = [...tasks].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });

  const phaseMap = new Map<HermesPhaseId, Map<string, Task[]>>();

  for (const task of sorted) {
    if (!phaseMap.has(task.phase)) {
      phaseMap.set(task.phase, new Map());
    }
    const moduleMap = phaseMap.get(task.phase)!;
    const moduleKey = task.moduleId ?? task.module;
    if (!moduleMap.has(moduleKey)) {
      moduleMap.set(moduleKey, []);
    }
    moduleMap.get(moduleKey)!.push(task);
  }

  const phases = Array.from(phaseMap.entries()).map(([phaseId, moduleMap]) => ({
    phaseId,
    phaseLabel: getPhaseLabel(phaseId, approach),
    modules: Array.from(moduleMap.entries()).map(([moduleKey, moduleTasks]) => ({
      module: moduleTasks[0]?.module ?? moduleKey,
      tasks: moduleTasks,
    })),
  }));

  return phases;
}

export function getScenarioLabel(scenarioId?: string): string | null {
  if (!scenarioId) return null;
  const scenario = getScenarioById(scenarioId);
  return scenario?.labelFr ?? null;
}
