import {
  getModuleLabel,
  getTaskTemplatesForScenario,
  type HermesTaskTemplate,
} from "@/lib/hermes/referential";
import type { HermesApproach, Task } from "@/types";

export function buildTasksFromScenario(
  projectId: string,
  scenarioId: string,
  approach: HermesApproach,
): Task[] {
  const templates = getTaskTemplatesForScenario(scenarioId, approach);

  return templates.map((template) =>
    taskFromTemplate(projectId, template),
  );
}

function taskFromTemplate(
  projectId: string,
  template: HermesTaskTemplate,
): Task {
  return {
    id: crypto.randomUUID(),
    projectId,
    title: template.titleFr,
    module: getModuleLabel(template.moduleId),
    moduleId: template.moduleId,
    phase: template.phase,
    status: "a_faire",
    templateId: template.id,
    order: template.order,
    progress: 0,
  };
}
