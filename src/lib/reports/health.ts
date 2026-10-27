import type { ProjectReportData } from "./data";
import type { ReportFormatter } from "./format";
import { daysBetween } from "./format";
import type { ReportTranslator } from "./i18n";
import type { ReportTone, ReportWeather } from "./types";

export interface DimensionHealth {
  tone: ReportTone;
  reasons: string[];
}

export interface ProjectHealth {
  overall: ReportTone;
  schedule: DimensionHealth;
  budget: DimensionHealth;
  decisions: DimensionHealth;
  overdueCount: number;
  blockedCount: number;
  endPassed: boolean;
  /** Glissement (jours) de la fin de projet par rapport au baseline. */
  slipDays?: number;
  budgetIncreasePct?: number;
  pendingPv: number;
}

const RANK: Record<ReportTone, number> = { neutral: 0, brand: 0, green: 1, orange: 2, red: 3 };

export function worstTone(tones: ReportTone[]): ReportTone {
  const evaluated = tones.filter((tone) => tone !== "neutral" && tone !== "brand");
  if (evaluated.length === 0) return "neutral";
  return evaluated.reduce((worst, tone) => (RANK[tone] > RANK[worst] ? tone : worst));
}

export function isTaskOverdue(task: { dueDate?: string; status: string }, today: string): boolean {
  return Boolean(task.dueDate) && task.status !== "termine" && task.dueDate!.slice(0, 10) < today;
}

function maxDate(values: (string | undefined)[]): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 10))
    .sort()
    .pop();
}

/** Glissement de la date de fin calculée (tâches) par rapport au baseline de référence. */
export function computeEndSlip(data: ProjectReportData): number | undefined {
  if (!data.baseline) return undefined;
  const baselineEnd = maxDate(data.baseline.snapshots.map((snap) => snap.dueDate));
  const currentEnd = maxDate(data.tasks.map((task) => task.dueDate));
  if (!baselineEnd || !currentEnd) return undefined;
  return daysBetween(baselineEnd, currentEnd);
}

export function computeProjectHealth(
  data: ProjectReportData,
  t: ReportTranslator,
  fmt: ReportFormatter,
  today: string,
): ProjectHealth {
  const { project, tasks, revisions, validations, documents } = data;
  const completed = project.status === "termine";

  const open = tasks.filter((task) => task.status !== "termine");
  const overdueCount = open.filter((task) => isTaskOverdue(task, today)).length;
  const blockedCount = open.filter((task) => task.status === "bloque").length;
  const endPassed = !completed && Boolean(project.endDate) && project.endDate!.slice(0, 10) < today;
  const slipDays = computeEndSlip(data);

  const schedule: DimensionHealth = { tone: "green", reasons: [] };
  if (completed) {
    schedule.reasons.push(t("weather.rCompleted"));
  } else if (tasks.length === 0 && !project.endDate) {
    schedule.tone = "neutral";
  } else {
    if (endPassed) schedule.reasons.push(t("weather.rEndPassed", { date: fmt.date(project.endDate) }));
    if (overdueCount > 0) schedule.reasons.push(t("weather.rOverdue", { count: overdueCount }));
    if (blockedCount > 0) schedule.reasons.push(t("weather.rBlocked", { count: blockedCount }));
    if (slipDays !== undefined && slipDays > 0) {
      schedule.reasons.push(t("weather.rSlip", { days: slipDays }));
    }
    const overdueRatio = open.length > 0 ? overdueCount / open.length : 0;
    if (endPassed || (slipDays ?? 0) > 30 || (overdueCount >= 2 && overdueRatio > 0.25)) {
      schedule.tone = "red";
    } else if (overdueCount > 0 || blockedCount > 0 || (slipDays ?? 0) > 5) {
      schedule.tone = "orange";
    }
    if (schedule.reasons.length === 0) schedule.reasons.push(t("weather.rOnTrack"));
  }

  const budget: DimensionHealth = { tone: "green", reasons: [] };
  const current = project.budget ?? 0;
  const pendingRevision = revisions.find((rev) => rev.status === "pending_mandant");
  let budgetIncreasePct: number | undefined;
  if (current <= 0 && !(project.budgetHours && project.budgetHours > 0)) {
    budget.tone = "neutral";
    budget.reasons.push(t("weather.rNoBudget"));
  } else {
    if (project.budgetStatus !== "approved") {
      budget.tone = "orange";
      budget.reasons.push(t("weather.rBudgetPending"));
    }
    if (pendingRevision) {
      budget.tone = worstTone([budget.tone, "orange"]);
      budget.reasons.push(
        t("weather.rRevisionPending", { amount: fmt.chf(pendingRevision.amountCHF) }),
      );
    }
    if (data.initialBudget && data.initialBudget > 0 && current > 0) {
      budgetIncreasePct = Math.round(((current - data.initialBudget) / data.initialBudget) * 100);
      if (budgetIncreasePct > 0) {
        budget.reasons.push(t("weather.rBudgetIncrease", { pct: budgetIncreasePct }));
      }
      if (budgetIncreasePct > 20) budget.tone = "red";
      else if (budgetIncreasePct > 10) budget.tone = worstTone([budget.tone, "orange"]);
    }
    if (budget.reasons.length === 0) budget.reasons.push(t("weather.rBudgetOk"));
  }

  const decisions: DimensionHealth = { tone: "green", reasons: [] };
  const latest = validations[0];
  const pendingPv = documents.filter((doc) => doc.status === "pending_signature").length;
  if (latest?.status === "submitted") {
    decisions.reasons.push(t("weather.rGateSubmitted"));
    if (daysBetween(latest.submittedAt, today) > 14) decisions.tone = "orange";
  } else if (latest?.status === "rejected") {
    decisions.tone = "orange";
    decisions.reasons.push(t("weather.rGateRejected"));
  }
  if (pendingPv > 0) {
    decisions.tone = worstTone([decisions.tone, "orange"]);
    decisions.reasons.push(t("weather.rPvPending", { count: pendingPv }));
  }
  if (decisions.reasons.length === 0) decisions.reasons.push(t("weather.rDecisionsOk"));

  return {
    overall: worstTone([schedule.tone, budget.tone, decisions.tone]),
    schedule,
    budget,
    decisions,
    overdueCount,
    blockedCount,
    endPassed,
    slipDays,
    budgetIncreasePct,
    pendingPv,
  };
}

export function toneLabel(t: ReportTranslator, tone: ReportTone): string {
  if (tone === "green" || tone === "orange" || tone === "red") return t(`weather.${tone}`);
  return t("weather.neutral");
}

export function healthToWeather(t: ReportTranslator, health: ProjectHealth): ReportWeather[] {
  const overallReasons = [health.schedule, health.budget, health.decisions]
    .filter((dimension) => dimension.tone === "orange" || dimension.tone === "red")
    .flatMap((dimension) => dimension.reasons);
  return [
    {
      dimension: t("weather.overall"),
      tone: health.overall,
      label: toneLabel(t, health.overall),
      reasons: overallReasons.slice(0, 4),
    },
    {
      dimension: t("weather.schedule"),
      tone: health.schedule.tone,
      label: toneLabel(t, health.schedule.tone),
      reasons: health.schedule.reasons,
    },
    {
      dimension: t("weather.budget"),
      tone: health.budget.tone,
      label: toneLabel(t, health.budget.tone),
      reasons: health.budget.reasons,
    },
    {
      dimension: t("weather.decisions"),
      tone: health.decisions.tone,
      label: toneLabel(t, health.decisions.tone),
      reasons: health.decisions.reasons,
    },
  ];
}
