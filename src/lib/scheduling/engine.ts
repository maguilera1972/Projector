import {
  addWorkingDays,
  maxIsoDate,
  workingDaysBetween,
} from "@/lib/scheduling/calendar";
import type {
  DependencyType,
  Task,
  TaskDependency,
  TaskScheduleNode,
} from "@/types";

export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  FS: "Fin → Début (FD)",
  SS: "Début → Début (DD)",
  FF: "Fin → Fin (FF)",
  SF: "Début → Fin (DF)",
};

export function getTaskDurationDays(task: Task): number {
  if (task.durationDays && task.durationDays > 0) {
    return task.durationDays;
  }
  if (task.startDate && task.dueDate) {
    return workingDaysBetween(task.startDate, task.dueDate);
  }
  return 1;
}

export function syncTaskDurationFromDates(task: Task): void {
  if (task.startDate && task.dueDate) {
    task.durationDays = workingDaysBetween(task.startDate, task.dueDate);
  }
}

function constraintFromDependency(
  predecessor: Task,
  dependency: TaskDependency,
): { minStart?: string; minDue?: string } {
  const lag = dependency.lagDays ?? 0;
  const predStart = predecessor.startDate;
  const predDue = predecessor.dueDate ?? predecessor.startDate;

  if (!predStart && !predDue) {
    return {};
  }

  switch (dependency.type) {
    case "FS":
      if (!predDue) return {};
      return { minStart: addWorkingDays(predDue, lag + 1) };
    case "SS":
      if (!predStart) return {};
      return { minStart: addWorkingDays(predStart, lag) };
    case "FF":
      if (!predDue) return {};
      return { minDue: addWorkingDays(predDue, lag) };
    case "SF":
      if (!predStart) return {};
      return { minDue: addWorkingDays(predStart, lag) };
    default:
      return {};
  }
}

function applyStartAndDuration(
  task: Task,
  startIso: string,
  duration: number,
): void {
  task.startDate = startIso;
  task.dueDate = addWorkingDays(startIso, duration - 1);
  task.durationDays = duration;
}

function resolveDatesFromConstraints(
  task: Task,
  minStart?: string,
  minDue?: string,
  fallbackStart?: string,
): void {
  const duration = getTaskDurationDays(task);
  let start = minStart ?? task.startDate ?? fallbackStart;

  if (!start && minDue) {
    start = addWorkingDays(minDue, -(duration - 1));
  }

  if (!start) {
    return;
  }

  applyStartAndDuration(task, start, duration);

  if (minDue && task.dueDate && task.dueDate < minDue) {
    applyStartAndDuration(
      task,
      addWorkingDays(minDue, -(duration - 1)),
      duration,
    );
  }

  if (minStart && task.startDate && task.startDate < minStart) {
    applyStartAndDuration(task, minStart, duration);
    if (minDue && task.dueDate && task.dueDate < minDue) {
      applyStartAndDuration(
        task,
        addWorkingDays(minDue, -(duration - 1)),
        duration,
      );
    }
  }
}

export function topologicalSortTasks(
  tasks: Task[],
  dependencies: TaskDependency[],
): Task[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of taskIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const dep of dependencies) {
    if (!taskIds.has(dep.predecessorId) || !taskIds.has(dep.successorId)) {
      continue;
    }
    adjacency.get(dep.predecessorId)!.push(dep.successorId);
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) ?? 0) + 1);
  }

  const queue = [...taskIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const sorted: Task[] = [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const task = taskById.get(id);
    if (task) sorted.push(task);

    for (const successorId of adjacency.get(id) ?? []) {
      const next = (inDegree.get(successorId) ?? 0) - 1;
      inDegree.set(successorId, next);
      if (next === 0) {
        queue.push(successorId);
      }
    }
  }

  if (sorted.length !== tasks.length) {
    throw new Error(
      "Cycle de dépendances détecté : la planification ne peut pas être recalculée.",
    );
  }

  return sorted;
}

export function wouldCreateDependencyCycle(
  dependencies: TaskDependency[],
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) {
    return true;
  }

  const adjacency = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = adjacency.get(dep.predecessorId) ?? [];
    list.push(dep.successorId);
    adjacency.set(dep.predecessorId, list);
  }

  const pending = adjacency.get(predecessorId) ?? [];
  pending.push(successorId);
  adjacency.set(predecessorId, pending);

  const visited = new Set<string>();
  const stack = [successorId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === predecessorId) {
      return true;
    }
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }

  return false;
}

export function recalculateProjectSchedule(
  tasks: Task[],
  dependencies: TaskDependency[],
  options?: { anchorStart?: string; fromTaskId?: string },
): Task[] {
  const taskById = new Map(tasks.map((task) => [task.id, { ...task }]));
  const mutableTasks = [...taskById.values()];
  const sorted = topologicalSortTasks(mutableTasks, dependencies);

  const startIndex =
    options?.fromTaskId !== undefined
      ? sorted.findIndex((task) => task.id === options.fromTaskId)
      : 0;

  const sliceStart = startIndex >= 0 ? startIndex : 0;
  const tasksToProcess = sorted.slice(sliceStart);

  for (const task of tasksToProcess) {
    const incoming = dependencies.filter((dep) => dep.successorId === task.id);
    let minStart: string | undefined;
    let minDue: string | undefined;

    for (const dep of incoming) {
      const predecessor = taskById.get(dep.predecessorId);
      if (!predecessor) continue;
      const constraint = constraintFromDependency(predecessor, dep);
      minStart = maxIsoDate(minStart, constraint.minStart);
      minDue = maxIsoDate(minDue, constraint.minDue);
    }

    if (incoming.length > 0) {
      resolveDatesFromConstraints(
        task,
        minStart,
        minDue,
        options?.anchorStart,
      );
    } else if (!task.startDate && options?.anchorStart) {
      applyStartAndDuration(task, options.anchorStart, getTaskDurationDays(task));
    }

    taskById.set(task.id, task);
  }

  return [...taskById.values()];
}

export interface CriticalPathResult {
  nodes: TaskScheduleNode[];
  criticalTaskIds: string[];
  projectEnd?: string;
}

export function computeCriticalPath(
  tasks: Task[],
  dependencies: TaskDependency[],
  anchorStart?: string,
): CriticalPathResult {
  const scheduled = recalculateProjectSchedule(tasks, dependencies, {
    anchorStart,
  });
  const taskById = new Map(scheduled.map((task) => [task.id, task]));
  const sorted = topologicalSortTasks(scheduled, dependencies);

  const earlyStart = new Map<string, string>();
  const earlyFinish = new Map<string, string>();

  for (const task of sorted) {
    const duration = getTaskDurationDays(task);
    const incoming = dependencies.filter((dep) => dep.successorId === task.id);
    let es: string | undefined;

    for (const dep of incoming) {
      const pred = taskById.get(dep.predecessorId);
      if (!pred) continue;
      const predEs = earlyStart.get(pred.id) ?? pred.startDate;
      const predEf = earlyFinish.get(pred.id) ?? pred.dueDate ?? predEs;
      if (!predEs && !predEf) continue;

      const constraint = constraintFromDependency(
        {
          ...pred,
          startDate: predEs ?? pred.startDate,
          dueDate: predEf ?? pred.dueDate,
        },
        dep,
      );

      if (constraint.minStart) {
        es = maxIsoDate(es, constraint.minStart);
      }
      if (constraint.minDue) {
        const derivedStart = addWorkingDays(constraint.minDue, -(duration - 1));
        es = maxIsoDate(es, derivedStart);
      }
    }

    if (!es) {
      es = task.startDate ?? anchorStart;
    }

    if (!es) continue;

    const ef = addWorkingDays(es, duration - 1);
    earlyStart.set(task.id, es);
    earlyFinish.set(task.id, ef);
  }

  const projectEnd = maxIsoDate(...[...earlyFinish.values()]);
  if (!projectEnd) {
    return { nodes: [], criticalTaskIds: [], projectEnd: undefined };
  }

  const lateFinish = new Map<string, string>();
  const lateStart = new Map<string, string>();

  for (const task of [...sorted].reverse()) {
    const duration = getTaskDurationDays(task);
    const outgoing = dependencies.filter(
      (dep) => dep.predecessorId === task.id,
    );

    let lf = projectEnd;

    if (outgoing.length > 0) {
      const successorLimits = outgoing
        .map((dep) => {
          const succLs = lateStart.get(dep.successorId);
          const succLf = lateFinish.get(dep.successorId);
          if (!succLs && !succLf) return undefined;

          switch (dep.type) {
            case "FS":
              return succLs
                ? addWorkingDays(succLs, -(dep.lagDays + 1))
                : undefined;
            case "SS":
              return succLs ? addWorkingDays(succLs, -dep.lagDays) : undefined;
            case "FF":
              return succLf ? addWorkingDays(succLf, -dep.lagDays) : undefined;
            case "SF":
              return succLf ? addWorkingDays(succLf, -dep.lagDays) : undefined;
            default:
              return undefined;
          }
        })
        .filter((value): value is string => Boolean(value));

      if (successorLimits.length > 0) {
        lf = successorLimits.reduce((min, current) =>
          current < min ? current : min,
        );
      }
    }

    lateFinish.set(task.id, lf);
    lateStart.set(task.id, addWorkingDays(lf, -(duration - 1)));
  }

  const nodes: TaskScheduleNode[] = sorted.map((task) => {
    const es = earlyStart.get(task.id) ?? task.startDate;
    const ef = earlyFinish.get(task.id) ?? task.dueDate;
    const ls = lateStart.get(task.id);
    const slackDays =
      es && ls ? workingDaysBetween(es, ls) - 1 : undefined;
    const isCritical =
      es !== undefined &&
      slackDays !== undefined &&
      Math.max(slackDays, 0) === 0;

    return {
      taskId: task.id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lateFinish.get(task.id),
      slackDays: slackDays !== undefined ? Math.max(slackDays, 0) : undefined,
      isCritical,
    };
  });

  const criticalTaskIds = nodes
    .filter((node) => node.isCritical)
    .map((node) => node.taskId);

  return { nodes, criticalTaskIds, projectEnd };
}
