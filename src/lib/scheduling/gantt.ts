import { parseIsoDate, toIsoDate } from "@/lib/scheduling/calendar";
import { topologicalSortTasks } from "@/lib/scheduling/engine";
import type {
  BaselineTaskSnapshot,
  GanttBarPosition,
  GanttTaskRow,
  GanttTimeline,
  ProjectBaseline,
  Task,
  TaskDependency,
} from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function diffCalendarDays(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso.slice(0, 10)).getTime();
  const to = parseIsoDate(toIso.slice(0, 10)).getTime();
  return Math.round((to - from) / DAY_MS);
}

export function addCalendarDays(startIso: string, days: number): string {
  const date = parseIsoDate(startIso.slice(0, 10));
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function collectDates(
  tasks: Task[],
  snapshots?: BaselineTaskSnapshot[],
): string[] {
  const dates: string[] = [];

  for (const task of tasks) {
    if (task.startDate) dates.push(task.startDate.slice(0, 10));
    if (task.dueDate) dates.push(task.dueDate.slice(0, 10));
  }

  for (const snap of snapshots ?? []) {
    if (snap.startDate) dates.push(snap.startDate.slice(0, 10));
    if (snap.dueDate) dates.push(snap.dueDate.slice(0, 10));
  }

  return dates;
}

export function computeGanttTimeline(
  tasks: Task[],
  snapshots?: BaselineTaskSnapshot[],
  paddingDays = 7,
): GanttTimeline | null {
  const dates = collectDates(tasks, snapshots);
  if (dates.length === 0) {
    return null;
  }

  const sorted = [...dates].sort();
  const startDate = addCalendarDays(sorted[0], -paddingDays);
  const endDate = addCalendarDays(sorted[sorted.length - 1], paddingDays);
  const totalDays = diffCalendarDays(startDate, endDate) + 1;

  return { startDate, endDate, totalDays };
}

export function computeBarPosition(
  startDate: string | undefined,
  dueDate: string | undefined,
  timeline: GanttTimeline,
): GanttBarPosition | undefined {
  const start = startDate?.slice(0, 10);
  const end = dueDate?.slice(0, 10) ?? start;

  if (!start) {
    return undefined;
  }

  const offset = diffCalendarDays(timeline.startDate, start);
  const duration = Math.max(diffCalendarDays(start, end ?? start) + 1, 1);
  const leftPercent = (offset / timeline.totalDays) * 100;
  const widthPercent = (duration / timeline.totalDays) * 100;

  return {
    leftPercent: Math.max(0, Math.min(leftPercent, 100)),
    widthPercent: Math.max((1 / timeline.totalDays) * 100, widthPercent),
  };
}

export function buildGanttRows(
  tasks: Task[],
  timeline: GanttTimeline,
  options?: {
    criticalTaskIds?: string[];
    baseline?: ProjectBaseline;
    dependencies?: TaskDependency[];
  },
): GanttTaskRow[] {
  const baselineByTask = new Map(
    (options?.baseline?.snapshots ?? []).map((snap) => [snap.taskId, snap]),
  );
  const criticalSet = new Set(options?.criticalTaskIds ?? []);

  let ordered = [...tasks];
  if (options?.dependencies && options.dependencies.length > 0) {
    try {
      ordered = topologicalSortTasks(tasks, options.dependencies);
    } catch {
      ordered = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
  } else {
    ordered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return ordered.map((task) => {
    const snap = baselineByTask.get(task.id);
    const bar = computeBarPosition(task.startDate, task.dueDate, timeline);
    const baselineBar = snap
      ? computeBarPosition(snap.startDate, snap.dueDate, timeline)
      : undefined;

    let startVarianceDays: number | undefined;
    let finishVarianceDays: number | undefined;

    if (snap?.startDate && task.startDate) {
      startVarianceDays = diffCalendarDays(snap.startDate, task.startDate);
    }
    if (snap?.dueDate && task.dueDate) {
      finishVarianceDays = diffCalendarDays(snap.dueDate, task.dueDate);
    }

    return {
      task,
      bar,
      baselineBar,
      progress: task.progress ?? 0,
      isCritical: criticalSet.has(task.id),
      startVarianceDays,
      finishVarianceDays,
    };
  });
}

export interface GanttWeekMarker {
  label: string;
  leftPercent: number;
}

export function buildWeekMarkers(timeline: GanttTimeline): GanttWeekMarker[] {
  const markers: GanttWeekMarker[] = [];
  let cursor = timeline.startDate;
  let index = 0;

  while (cursor <= timeline.endDate) {
    const offset = diffCalendarDays(timeline.startDate, cursor);
    const date = parseIsoDate(cursor);
    const label = date.toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "short",
    });

    if (index % 7 === 0) {
      markers.push({
        label,
        leftPercent: (offset / timeline.totalDays) * 100,
      });
    }

    cursor = addCalendarDays(cursor, 1);
    index++;
  }

  return markers;
}

export function formatVarianceDays(days: number | undefined): string {
  if (days === undefined || days === 0) return "0 j.";
  if (days > 0) return `+${days} j.`;
  return `${days} j.`;
}

export interface DependencyLine {
  id: string;
  x1Percent: number;
  y1Percent: number;
  x2Percent: number;
  y2Percent: number;
}

export function buildDependencyLines(
  rows: GanttTaskRow[],
  dependencies: TaskDependency[],
): DependencyLine[] {
  const rowIndex = new Map(rows.map((row, index) => [row.task.id, index]));
  const rowHeightPercent = 100 / Math.max(rows.length, 1);

  return dependencies
    .map((dep) => {
      const predIndex = rowIndex.get(dep.predecessorId);
      const succIndex = rowIndex.get(dep.successorId);
      const predRow = rows[predIndex ?? -1];
      const succRow = rows[succIndex ?? -1];

      if (
        predIndex === undefined ||
        succIndex === undefined ||
        !predRow?.bar ||
        !succRow?.bar
      ) {
        return null;
      }

      const x1 =
        predRow.bar.leftPercent + predRow.bar.widthPercent;
      const x2 = succRow.bar.leftPercent;
      const y1 = (predIndex + 0.5) * rowHeightPercent;
      const y2 = (succIndex + 0.5) * rowHeightPercent;

      return {
        id: dep.id,
        x1Percent: x1,
        y1Percent: y1,
        x2Percent: x2,
        y2Percent: y2,
      };
    })
    .filter((line): line is DependencyLine => line !== null);
}
