import type {
  EstimateRevisionReason,
  HermesPhaseId,
  Project,
  Task,
  TaskEstimateRevision,
  TimeEntry,
} from "@/types";
import { minutesToHours } from "./duration";
import { addDaysIso, isValidIsoDate, startOfWeekIso } from "./rules";

/** Nombre maximal de semaines tracées (au-delà, regroupement par pas de plusieurs semaines). */
const MAX_POINTS = 120;
const DEFAULT_PROJECT_DAYS = 90;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}

/** Minutes saisies (actives) par tâche. */
export function minutesByTask(entries: TimeEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    totals.set(entry.taskId, (totals.get(entry.taskId) ?? 0) + entry.durationMinutes);
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* Période du projet                                                   */
/* ------------------------------------------------------------------ */

export interface ProjectPeriod {
  startDate: string;
  /** Fin effective : date saisie, sinon déduite des échéances des tâches. */
  endDate: string;
  /** Faux si la date de fin n'est pas définie sur le projet (« à définir »). */
  endDefined: boolean;
  totalDays: number;
  elapsedDays: number;
  /** Jours restants jusqu'à la fin (négatif si dépassée). */
  remainingDays: number;
  /** Part du temps écoulé (0–100, plafonné). */
  elapsedPercent: number;
}

export function getProjectPeriod(project: Project, tasks: Task[], today: string): ProjectPeriod {
  const taskStarts = tasks.map((task) => task.startDate?.slice(0, 10)).filter(isValidIsoDate).sort();
  const taskEnds = tasks.map((task) => task.dueDate?.slice(0, 10)).filter(isValidIsoDate).sort();
  const startDate = isValidIsoDate(project.startDate?.slice(0, 10))
    ? project.startDate.slice(0, 10)
    : taskStarts[0] ?? project.createdAt.slice(0, 10);
  const definedEnd = project.endDate?.slice(0, 10);
  const endDefined = isValidIsoDate(definedEnd) && definedEnd >= startDate;
  const derivedEnd = taskEnds.at(-1);
  const endDate = endDefined
    ? definedEnd
    : derivedEnd && derivedEnd >= startDate
      ? derivedEnd
      : addDaysIso(startDate, DEFAULT_PROJECT_DAYS);
  const totalDays = Math.max(1, daysBetween(startDate, endDate) + 1);
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(startDate, today) + 1));
  return {
    startDate,
    endDate,
    endDefined,
    totalDays,
    elapsedDays,
    remainingDays: daysBetween(today, endDate),
    elapsedPercent: Math.round((elapsedDays / totalDays) * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Analyse de l'utilisation du temps                                   */
/* ------------------------------------------------------------------ */

export interface EffortFigures {
  /** Heures prévues initialement (première estimation). */
  initialHours: number;
  /** Heures prévues actuellement. */
  plannedHours: number;
  actualHours: number;
  /** Reste à faire estimé (tâches non terminées : prévu − réalisé, plancher 0). */
  remainingHours: number;
  /** Prévision à terminaison : réalisé + reste. */
  forecastHours: number;
}

export interface TimeSeriesPoint {
  /** Début de la période (lundi). */
  start: string;
  end: string;
  plannedCumHours: number;
  initialCumHours: number;
  /** Cumul réalisé (null après aujourd'hui). */
  actualCumHours: number | null;
  actualHours: number;
}

export interface PhaseEffort extends EffortFigures {
  phase: HermesPhaseId;
  label: string;
}

export interface PersonEffort extends EffortFigures {
  userId: string;
  label: string;
  entries: number;
}

export interface TaskEffort extends EffortFigures {
  taskId: string;
  label: string;
  phase: HermesPhaseId;
  status: Task["status"];
  assigneeId?: string;
  revisions: number;
}

export interface RevisionView {
  id: string;
  taskId: string;
  taskTitle: string;
  previousHours: number | null;
  newHours: number | null;
  deltaHours: number;
  reason: EstimateRevisionReason;
  reasonText?: string;
  changedByName: string;
  changedAt: string;
}

export interface RevisionSummary {
  /** Révisions hors fixation initiale. */
  count: number;
  totalDeltaHours: number;
  byReason: { reason: EstimateRevisionReason; count: number; deltaHours: number }[];
  recent: RevisionView[];
}

export interface ProjectTimeAnalysis extends EffortFigures {
  projectId: string;
  today: string;
  period: ProjectPeriod;
  budgetHours?: number;
  budgetUsedPercent?: number;
  /** Tâches sans charge prévue. */
  unplannedTasks: number;
  /** Tâches avec temps saisi mais sans charge prévue. */
  unplannedWithTime: number;
  entryCount: number;
  /** Pas (en semaines) entre deux points de la série. */
  stepWeeks: number;
  series: TimeSeriesPoint[];
  /** Index du point contenant aujourd'hui (absent si hors période). */
  todayIndex?: number;
  byPhase: PhaseEffort[];
  byPerson: PersonEffort[];
  byTask: TaskEffort[];
  revisions: RevisionSummary;
}

interface Accumulator {
  initialHours: number;
  plannedHours: number;
  actualMinutes: number;
  remainingHours: number;
}

function emptyAcc(): Accumulator {
  return { initialHours: 0, plannedHours: 0, actualMinutes: 0, remainingHours: 0 };
}

function figures(acc: Accumulator): EffortFigures {
  const actualHours = minutesToHours(acc.actualMinutes);
  return {
    initialHours: round2(acc.initialHours),
    plannedHours: round2(acc.plannedHours),
    actualHours,
    remainingHours: round2(acc.remainingHours),
    forecastHours: round2(actualHours + acc.remainingHours),
  };
}

function initialOf(task: Task): number {
  return task.initialEstimatedHours ?? task.estimatedHours ?? 0;
}

function remainingOf(task: Task, actualMinutes: number): number {
  if (task.status === "termine" || !task.estimatedHours) return 0;
  return Math.max(0, task.estimatedHours - minutesToHours(actualMinutes));
}

/** Fenêtre de planification d'une tâche : ses dates, sinon la période du projet. */
function taskWindow(task: Task, period: ProjectPeriod): { from: string; to: string } {
  const start = task.startDate?.slice(0, 10);
  const due = task.dueDate?.slice(0, 10);
  const from = isValidIsoDate(start) ? start : period.startDate;
  const to = isValidIsoDate(due) ? due : period.endDate;
  return from <= to ? { from, to } : { from: to, to: from };
}

function fractionDone(window: { from: string; to: string }, day: string): number {
  if (day < window.from) return 0;
  if (day >= window.to) return 1;
  return (daysBetween(window.from, day) + 1) / (daysBetween(window.from, window.to) + 1);
}

export function buildProjectTimeAnalysis(input: {
  project: Project;
  tasks: Task[];
  entries: TimeEntry[];
  revisions: TaskEstimateRevision[];
  today: string;
  userName: (userId: string) => string;
  phaseLabel: (phase: HermesPhaseId) => string;
  phaseOrder?: HermesPhaseId[];
}): ProjectTimeAnalysis {
  const { project, tasks, today } = input;
  const entries = input.entries.filter((entry) => !entry.deletedAt && entry.projectId === project.id);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const perTask = minutesByTask(entries);
  const period = getProjectPeriod(project, tasks, today);

  /* Totaux par tâche, phase, personne */
  const total = emptyAcc();
  const phaseAcc = new Map<HermesPhaseId, Accumulator>();
  const personAcc = new Map<string, Accumulator & { entries: number }>();
  const revisionCount = new Map<string, number>();
  for (const revision of input.revisions) {
    if (revision.reason === "initial") continue;
    revisionCount.set(revision.taskId, (revisionCount.get(revision.taskId) ?? 0) + 1);
  }

  const byTask: TaskEffort[] = [];
  for (const task of tasks) {
    const actualMinutes = perTask.get(task.id) ?? 0;
    const acc: Accumulator = {
      initialHours: initialOf(task),
      plannedHours: task.estimatedHours ?? 0,
      actualMinutes,
      remainingHours: remainingOf(task, actualMinutes),
    };
    if (!phaseAcc.has(task.phase)) phaseAcc.set(task.phase, emptyAcc());
    for (const target of [total, phaseAcc.get(task.phase)!]) {
      target.initialHours += acc.initialHours;
      target.plannedHours += acc.plannedHours;
      target.actualMinutes += acc.actualMinutes;
      target.remainingHours += acc.remainingHours;
    }
    if (task.assigneeId) {
      const person = personAcc.get(task.assigneeId) ?? { ...emptyAcc(), entries: 0 };
      person.initialHours += acc.initialHours;
      person.plannedHours += acc.plannedHours;
      person.remainingHours += acc.remainingHours;
      personAcc.set(task.assigneeId, person);
    }
    if (actualMinutes > 0 || task.estimatedHours || task.initialEstimatedHours) {
      byTask.push({
        ...figures(acc),
        taskId: task.id,
        label: task.title,
        phase: task.phase,
        status: task.status,
        assigneeId: task.assigneeId,
        revisions: revisionCount.get(task.id) ?? 0,
      });
    }
  }
  for (const entry of entries) {
    const person = personAcc.get(entry.userId) ?? { ...emptyAcc(), entries: 0 };
    person.actualMinutes += entry.durationMinutes;
    person.entries += 1;
    personAcc.set(entry.userId, person);
  }

  const order = input.phaseOrder ?? [];
  const byPhase: PhaseEffort[] = [...phaseAcc.entries()]
    .filter(([, acc]) => acc.plannedHours > 0 || acc.actualMinutes > 0 || acc.initialHours > 0)
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([phase, acc]) => ({ ...figures(acc), phase, label: input.phaseLabel(phase) }));

  const byPerson: PersonEffort[] = [...personAcc.entries()]
    .filter(([, acc]) => acc.plannedHours > 0 || acc.actualMinutes > 0)
    .map(([userId, acc]) => ({ ...figures(acc), userId, label: input.userName(userId), entries: acc.entries }))
    .sort((a, b) => b.actualHours - a.actualHours || a.label.localeCompare(b.label));

  byTask.sort((a, b) => b.forecastHours - a.forecastHours || a.label.localeCompare(b.label));

  /* Série temporelle (semaines, du début à la fin du projet) */
  const lastEntry = entries.reduce((max, entry) => (entry.date > max ? entry.date : max), period.endDate);
  const firstWeek = startOfWeekIso(period.startDate);
  const lastWeek = startOfWeekIso(lastEntry > period.endDate ? lastEntry : period.endDate);
  const weekCount = Math.floor(daysBetween(firstWeek, lastWeek) / 7) + 1;
  const stepWeeks = Math.max(1, Math.ceil(weekCount / MAX_POINTS));
  const windows = tasks
    .filter((task) => task.estimatedHours || task.initialEstimatedHours)
    .map((task) => ({ task, window: taskWindow(task, period) }));
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const series: TimeSeriesPoint[] = [];
  let cursor = 0;
  let cumulativeMinutes = 0;
  let todayIndex: number | undefined;
  for (let start = firstWeek; start <= lastWeek; start = addDaysIso(start, 7 * stepWeeks)) {
    const end = addDaysIso(start, 7 * stepWeeks - 1);
    let bucketMinutes = 0;
    while (cursor < sortedEntries.length && sortedEntries[cursor].date <= end) {
      bucketMinutes += sortedEntries[cursor].durationMinutes;
      cursor += 1;
    }
    cumulativeMinutes += bucketMinutes;
    let planned = 0;
    let initial = 0;
    for (const { task, window } of windows) {
      const fraction = fractionDone(window, end);
      planned += (task.estimatedHours ?? 0) * fraction;
      initial += initialOf(task) * fraction;
    }
    if (today >= start && today <= end) todayIndex = series.length;
    series.push({
      start,
      end,
      plannedCumHours: round2(planned),
      initialCumHours: round2(initial),
      actualCumHours: start <= today ? minutesToHours(cumulativeMinutes) : null,
      actualHours: minutesToHours(bucketMinutes),
    });
  }

  /* Révisions de charge */
  const realRevisions = input.revisions.filter((revision) => revision.reason !== "initial");
  const reasonAcc = new Map<EstimateRevisionReason, { count: number; deltaHours: number }>();
  let totalDelta = 0;
  for (const revision of realRevisions) {
    const delta = (revision.newHours ?? 0) - (revision.previousHours ?? 0);
    totalDelta += delta;
    const current = reasonAcc.get(revision.reason) ?? { count: 0, deltaHours: 0 };
    reasonAcc.set(revision.reason, { count: current.count + 1, deltaHours: current.deltaHours + delta });
  }

  const totals = figures(total);
  const budgetHours = project.budgetHours && project.budgetHours > 0 ? project.budgetHours : undefined;
  return {
    ...totals,
    projectId: project.id,
    today,
    period,
    budgetHours,
    budgetUsedPercent: budgetHours ? Math.round((totals.actualHours / budgetHours) * 100) : undefined,
    unplannedTasks: tasks.filter((task) => !task.estimatedHours).length,
    unplannedWithTime: tasks.filter((task) => !task.estimatedHours && perTask.has(task.id)).length,
    entryCount: entries.length,
    stepWeeks,
    series,
    todayIndex,
    byPhase,
    byPerson,
    byTask,
    revisions: {
      count: realRevisions.length,
      totalDeltaHours: round2(totalDelta),
      byReason: [...reasonAcc.entries()].map(([reason, value]) => ({
        reason,
        count: value.count,
        deltaHours: round2(value.deltaHours),
      })),
      recent: [...realRevisions]
        .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
        .slice(0, 15)
        .map((revision) => ({
          id: revision.id,
          taskId: revision.taskId,
          taskTitle: taskById.get(revision.taskId)?.title ?? "—",
          previousHours: revision.previousHours,
          newHours: revision.newHours,
          deltaHours: round2((revision.newHours ?? 0) - (revision.previousHours ?? 0)),
          reason: revision.reason,
          reasonText: revision.reasonText,
          changedByName: input.userName(revision.changedBy),
          changedAt: revision.changedAt,
        })),
    },
  };
}
