import type { Activity, Task, TaskStatus } from "@/types";

export function aggregateTaskFromActivities(
  activities: Activity[],
): { progress: number; status: TaskStatus } {
  if (activities.length === 0) {
    return { progress: 0, status: "a_faire" };
  }

  const progress = Math.round(
    activities.reduce((sum, activity) => sum + activity.progress, 0) /
      activities.length,
  );

  let status: TaskStatus = "a_faire";
  if (activities.every((activity) => activity.status === "termine")) {
    status = "termine";
  } else if (activities.some((activity) => activity.status === "bloque")) {
    status = "bloque";
  } else if (
    activities.some((activity) => activity.status === "en_cours") ||
    progress > 0
  ) {
    status = "en_cours";
  }

  return { progress, status };
}

export function applyActivityAggregation(task: Task, activities: Activity[]): Task {
  if (activities.length === 0) {
    return task;
  }

  const aggregated = aggregateTaskFromActivities(activities);
  return {
    ...task,
    progress: aggregated.progress,
    status: aggregated.status,
  };
}
