import type { User } from "@/lib/auth/permissions";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { buildQualityGateChecklist } from "@/lib/hermes/quality-gates";
import { getQualityGateForPhase } from "@/lib/hermes/referential";
import { localizeQualityGateLabel, localizeScenario, localizeTask } from "@/lib/hermes/i18n";
import type { Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic, type Translator } from "@/lib/i18n/translate";
import type {
  HermesPhaseId,
  PhaseValidation,
  Portfolio,
  Project,
  QualityGateCheckItem,
  Task,
  TaskStatus,
} from "@/types";
import type { ProjectReportData, ReportDataset } from "./data";
import { createFormatter, daysBetween, inPeriod, todayIso, type ReportFormatter } from "./format";
import {
  computeProjectHealth,
  healthToWeather,
  isTaskOverdue,
  toneLabel,
  type ProjectHealth,
} from "./health";
import { getReportTranslator, rtDynamic, type ReportTranslator } from "./i18n";
import type {
  ReportBlock,
  ReportCell,
  ReportDocument,
  ReportParams,
  ReportSection,
  ReportTone,
} from "./types";

export const REPORT_COLORS = {
  cyan: "#7dd3fc",
  indigo: "#818cf8",
  purple: "#a855f7",
  navy: "#334155",
  green: "#10b981",
  orange: "#f59e0b",
  red: "#ef4444",
  slate: "#cbd5e1",
} as const;

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  termine: REPORT_COLORS.green,
  en_cours: REPORT_COLORS.indigo,
  a_faire: REPORT_COLORS.slate,
  bloque: REPORT_COLORS.red,
};

const TASK_STATUS_ORDER: TaskStatus[] = ["termine", "en_cours", "a_faire", "bloque"];

interface BuildContext {
  params: ReportParams;
  locale: Locale;
  t: ReportTranslator;
  tm: Translator;
  fmt: ReportFormatter;
  today: string;
  dataset: ReportDataset;
  userById: Map<string, User>;
  multi: boolean;
}

function userName(ctx: BuildContext, id?: string): string {
  if (!id) return ctx.t("common.none");
  const user = ctx.userById.get(id);
  if (user) return user.name;
  return /^[0-9a-f-]{20,}$/i.test(id) ? ctx.t("common.unknownUser") : id;
}

function personLabel(ctx: BuildContext, id: string | undefined, designated: string): string {
  if (id && ctx.userById.has(id)) return ctx.userById.get(id)!.name;
  return designated?.trim() || ctx.t("common.notSet");
}

function phaseLabel(ctx: BuildContext, phase: HermesPhaseId): string {
  return tDynamic(ctx.tm, `enums.phase.${phase}`);
}

function taskStatusLabel(ctx: BuildContext, status: TaskStatus): string {
  return tDynamic(ctx.tm, `enums.taskStatus.${status}`);
}

function days(ctx: BuildContext, n: number): string {
  return ctx.t("common.days", { n });
}

function signedDays(ctx: BuildContext, n?: number): string {
  if (n === undefined) return ctx.t("common.none");
  const label = days(ctx, Math.abs(n));
  return n > 0 ? `+${label}` : n < 0 ? `−${label}` : label;
}

function cell(text: string, tone?: ReportTone, bold?: boolean): ReportCell {
  return { text, tone, bold };
}

function localizedTask(ctx: BuildContext, task: Task): Task {
  return localizeTask(task, ctx.locale);
}

function healthOf(ctx: BuildContext, data: ProjectReportData): ProjectHealth {
  return computeProjectHealth(data, ctx.t, ctx.fmt, ctx.today);
}

function periodLabel(t: ReportTranslator, fmt: ReportFormatter, from?: string, to?: string): string {
  if (from && to) return t("common.periodRange", { from: fmt.date(from), to: fmt.date(to) });
  if (from) return t("common.periodFrom", { from: fmt.date(from) });
  if (to) return t("common.periodTo", { to: fmt.date(to) });
  return t("common.periodAll");
}

function hasPeriod(ctx: BuildContext): boolean {
  return Boolean(ctx.params.from || ctx.params.to);
}

function matchesPeriod(ctx: BuildContext, value?: string): boolean {
  if (!hasPeriod(ctx)) return true;
  return inPeriod(value, ctx.params.from, ctx.params.to);
}

function taskStack(ctx: BuildContext, tasks: Task[]): ReportBlock {
  return {
    kind: "stack",
    total: tasks.length,
    caption: ctx.t("common.tasksTotal", { total: tasks.length }),
    segments: TASK_STATUS_ORDER.map((status) => ({
      label: taskStatusLabel(ctx, status),
      value: tasks.filter((task) => task.status === status).length,
      color: TASK_STATUS_COLORS[status],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Décisions en attente (partagé : décisions, portefeuille)            */
/* ------------------------------------------------------------------ */

interface PendingDecision {
  project: Project;
  label: string;
  since?: string;
  responsible: string;
}

function pendingDecisions(ctx: BuildContext, data: ProjectReportData): PendingDecision[] {
  const { project } = data;
  const mandant = personLabel(ctx, project.mandantUserId, project.mandant);
  const items: PendingDecision[] = [];
  for (const validation of data.validations.filter((item) => item.status === "submitted")) {
    items.push({
      project,
      label: ctx.t("decisions.dPhase", {
        from: phaseLabel(ctx, validation.fromPhase),
        to: phaseLabel(ctx, validation.toPhase),
      }),
      since: validation.submittedAt,
      responsible: mandant,
    });
  }
  if (project.budgetStatus === "pending_mandant" && ((project.budget ?? 0) > 0 || (project.budgetHours ?? 0) > 0)) {
    items.push({
      project,
      label: ctx.t("decisions.dBudget"),
      since: project.createdAt,
      responsible: mandant,
    });
  }
  for (const revision of data.revisions.filter((rev) => rev.status === "pending_mandant")) {
    items.push({
      project,
      label: ctx.t("decisions.dRevision", { amount: ctx.fmt.chf(revision.amountCHF) }),
      since: revision.requestedAt,
      responsible: mandant,
    });
  }
  return items;
}

function pendingDecisionsTable(ctx: BuildContext, items: PendingDecision[]): ReportBlock {
  const sorted = [...items].sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));
  return {
    kind: "table",
    columns: [
      ...(ctx.multi ? [{ label: ctx.t("common.project"), width: 2 }] : []),
      { label: ctx.t("decisions.decision"), width: 3 },
      { label: ctx.t("decisions.since"), width: 1.2 },
      { label: ctx.t("decisions.responsible"), width: 1.6 },
    ],
    rows: sorted.map((item) => [
      ...(ctx.multi ? [cell(item.project.name, undefined, true)] : []),
      item.label,
      ctx.fmt.date(item.since),
      item.responsible,
    ]),
    empty: ctx.t("decisions.noPending"),
  };
}

/* ------------------------------------------------------------------ */
/* Rapport d'avancement                                                */
/* ------------------------------------------------------------------ */

function milestoneStatus(
  ctx: BuildContext,
  project: Project,
  phase: HermesPhaseId,
  phaseIndex: number,
  currentIndex: number,
  validations: PhaseValidation[],
): { text: string; tone: ReportTone; date?: string } {
  const forPhase = validations.filter((item) => item.fromPhase === phase);
  const approved = forPhase.find((item) => item.status === "approved");
  if (approved) return { text: ctx.t("status.msApproved"), tone: "green", date: approved.approvedAt };
  const latest = forPhase[0];
  if (latest?.status === "submitted") {
    return { text: ctx.t("status.msSubmitted"), tone: "orange", date: latest.submittedAt };
  }
  if (phaseIndex < currentIndex || (project.status === "termine" && phaseIndex === currentIndex)) {
    return { text: ctx.t("status.msApproved"), tone: "green" };
  }
  if (latest?.status === "rejected") {
    return { text: ctx.t("status.msRejected"), tone: "red", date: latest.rejectedAt };
  }
  if (phaseIndex === currentIndex) return { text: ctx.t("status.msCurrent"), tone: "brand" };
  return { text: ctx.t("status.msUpcoming"), tone: "neutral" };
}

function buildStatusReport(ctx: BuildContext): ReportSection[] {
  const data = ctx.dataset.projects[0]!;
  const { project } = data;
  const tasks = data.tasks.map((task) => localizedTask(ctx, task));
  const health = healthOf(ctx, data);
  const done = tasks.filter((task) => task.status === "termine").length;
  const overdue = tasks
    .filter((task) => isTaskOverdue(task, ctx.today))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const scenario = localizeScenario(project.scenarioId, ctx.locale)?.label;

  const kpis: ReportBlock = {
    kind: "kpis",
    items: [
      { label: ctx.t("status.progress"), value: ctx.fmt.percent(project.progress), tone: "brand" },
      { label: ctx.t("status.currentPhase"), value: phaseLabel(ctx, project.currentPhase) },
      { label: ctx.t("status.tasksDone"), value: `${done} / ${tasks.length}` },
      {
        label: ctx.t("status.overdue"),
        value: String(overdue.length),
        tone: overdue.length > 0 ? "red" : "green",
      },
      {
        label: ctx.t("status.endDate"),
        value: ctx.fmt.date(project.endDate),
        tone: health.endPassed ? "red" : undefined,
      },
      ...(hasPeriod(ctx)
        ? [
            {
              label: ctx.t("status.completedInPeriod"),
              value: String(tasks.filter((task) => matchesPeriod(ctx, task.completedAt)).length),
            },
          ]
        : []),
    ],
  };

  const keyValues: ReportBlock = {
    kind: "keyValues",
    items: [
      { label: ctx.t("status.chef"), value: personLabel(ctx, project.chefDeProjetId, project.chefDeProjet) },
      { label: ctx.t("status.mandant"), value: personLabel(ctx, project.mandantUserId, project.mandant) },
      { label: ctx.t("status.portfolio"), value: data.portfolio?.name ?? ctx.t("common.none") },
      {
        label: ctx.t("status.approach"),
        value: tDynamic(ctx.tm, `enums.approach.${project.approach}`) + (scenario ? ` · ${scenario}` : ""),
      },
      { label: ctx.t("status.projectStatus"), value: tDynamic(ctx.tm, `enums.projectStatus.${project.status}`) },
      {
        label: `${ctx.t("status.start")} → ${ctx.t("status.endDate")}`,
        value: `${ctx.fmt.date(project.startDate)} → ${ctx.fmt.date(project.endDate)}`,
      },
    ],
  };

  const phases = getPhasesForApproach(project.approach);
  const currentIndex = Math.max(0, phases.findIndex((phase) => phase.id === project.currentPhase));
  const phaseRows = phases.map((phase, index) => {
    const phaseTasks = tasks.filter((task) => task.phase === phase.id);
    const phaseDone = phaseTasks.filter((task) => task.status === "termine").length;
    const avg =
      phaseTasks.length === 0
        ? index < currentIndex
          ? 100
          : 0
        : Math.round(phaseTasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / phaseTasks.length);
    const state =
      index < currentIndex || project.status === "termine"
        ? ctx.t("status.phaseDone")
        : index === currentIndex
          ? ctx.t("status.phaseCurrent")
          : ctx.t("status.phaseUpcoming");
    return {
      label: phaseLabel(ctx, phase.id),
      value: avg,
      detail: `${state} · ${ctx.t("status.phaseDetail", { done: phaseDone, total: phaseTasks.length })}`,
      tone: (index < currentIndex ? "green" : index === currentIndex ? "brand" : "neutral") as ReportTone,
    };
  });

  const milestoneRows: ReportCell[][] = phases.map((phase, index) => {
    const gate = getQualityGateForPhase(phase.id, project.approach);
    const status = milestoneStatus(ctx, project, phase.id, index, currentIndex, data.validations);
    return [
      phaseLabel(ctx, phase.id),
      gate ? localizeQualityGateLabel(gate, ctx.locale) : ctx.t("common.none"),
      ...(ctx.locale === "fr" ? [gate?.milestoneFr ?? ctx.t("common.none")] : []),
      cell(status.text, status.tone),
      ctx.fmt.date(status.date),
    ];
  });

  const sections: ReportSection[] = [
    { title: ctx.t("status.secSummary"), blocks: [kpis, keyValues] },
    { title: ctx.t("status.secWeather"), blocks: [{ kind: "weather", items: healthToWeather(ctx.t, health) }] },
    { title: ctx.t("status.secPhases"), blocks: [{ kind: "progress", rows: phaseRows }] },
    { title: ctx.t("status.secTasks"), blocks: [taskStack(ctx, tasks)] },
    {
      title: ctx.t("status.secMilestones"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("common.phase"), width: 1.3 },
            { label: ctx.t("status.gate"), width: 2.4 },
            ...(ctx.locale === "fr" ? [{ label: ctx.t("status.milestone"), width: 2 }] : []),
            { label: ctx.t("common.status"), width: 1.5 },
            { label: ctx.t("common.date"), width: 1.1 },
          ],
          rows: milestoneRows,
        },
      ],
    },
    buildBaselineSection(ctx, data, tasks),
    {
      title: ctx.t("status.secOverdue"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("common.task"), width: 2.8 },
            { label: ctx.t("common.phase"), width: 1.2 },
            { label: ctx.t("common.assignee"), width: 1.5 },
            { label: ctx.t("common.dueDate"), width: 1.1 },
            { label: ctx.t("common.late"), width: 0.8, align: "right" },
            { label: ctx.t("common.progress"), width: 1.1, align: "right" },
          ],
          rows: overdue.slice(0, 30).map((task) => [
            data.criticalTaskIds.includes(task.id)
              ? cell(`${task.title} · ${ctx.t("status.critical")}`, "red")
              : task.title,
            phaseLabel(ctx, task.phase),
            userName(ctx, task.assigneeId),
            ctx.fmt.date(task.dueDate),
            cell(days(ctx, daysBetween(task.dueDate!, ctx.today)), "red"),
            ctx.fmt.percent(task.progress),
          ]),
          empty: ctx.t("status.noOverdue"),
        },
      ],
    },
  ];

  const horizon = ctx.params.to ?? addDays(ctx.today, 30);
  const upcoming = tasks
    .filter(
      (task) =>
        task.status !== "termine" &&
        task.dueDate &&
        task.dueDate.slice(0, 10) >= ctx.today &&
        task.dueDate.slice(0, 10) <= horizon,
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  sections.push({
    title: ctx.t("status.secUpcoming"),
    description: periodLabel(ctx.t, ctx.fmt, ctx.today, horizon),
    blocks: [
      {
        kind: "table",
        columns: [
          { label: ctx.t("common.task"), width: 3 },
          { label: ctx.t("common.phase"), width: 1.2 },
          { label: ctx.t("common.assignee"), width: 1.6 },
          { label: ctx.t("common.dueDate"), width: 1.1 },
          { label: ctx.t("common.status"), width: 1 },
        ],
        rows: upcoming.slice(0, 30).map((task) => [
          task.title,
          phaseLabel(ctx, task.phase),
          userName(ctx, task.assigneeId),
          ctx.fmt.date(task.dueDate),
          taskStatusLabel(ctx, task.status),
        ]),
        empty: ctx.t("status.noUpcoming"),
      },
    ],
  });

  return sections;
}

function addDays(iso: string, n: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function buildBaselineSection(ctx: BuildContext, data: ProjectReportData, tasks: Task[]): ReportSection {
  const title = ctx.t("status.secBaseline");
  const baseline = data.baseline;
  if (!baseline) {
    return { title, blocks: [{ kind: "paragraph", text: ctx.t("status.noBaseline"), muted: true }] };
  }
  const snapshots = new Map(baseline.snapshots.map((snap) => [snap.taskId, snap]));
  const compared = tasks
    .map((task) => {
      const snap = snapshots.get(task.id);
      if (!snap?.dueDate || !task.dueDate) return null;
      return { task, snap, variance: daysBetween(snap.dueDate, task.dueDate) };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const slipped = compared.filter((row) => row.variance > 0).sort((a, b) => b.variance - a.variance);
  const maxSlip = slipped[0]?.variance ?? 0;
  const health = healthOf(ctx, data);

  return {
    title,
    blocks: [
      {
        kind: "kpis",
        items: [
          { label: ctx.t("status.baselineName"), value: baseline.name, hint: `${ctx.t("status.baselineDate")} ${ctx.fmt.date(baseline.createdAt)}` },
          { label: ctx.t("status.tasksCompared"), value: String(compared.length) },
          {
            label: ctx.t("status.tasksLate"),
            value: String(slipped.length),
            tone: slipped.length > 0 ? "orange" : "green",
          },
          { label: ctx.t("status.maxSlip"), value: signedDays(ctx, maxSlip), tone: maxSlip > 5 ? "orange" : undefined },
          {
            label: ctx.t("status.endVariance"),
            value: signedDays(ctx, health.slipDays),
            tone: (health.slipDays ?? 0) > 30 ? "red" : (health.slipDays ?? 0) > 5 ? "orange" : "green",
          },
        ],
      },
      {
        kind: "table",
        columns: [
          { label: ctx.t("common.task"), width: 3.4 },
          { label: ctx.t("common.phase"), width: 1.2 },
          { label: ctx.t("status.baselineEnd"), width: 1.2 },
          { label: ctx.t("status.currentEnd"), width: 1.2 },
          { label: ctx.t("status.variance"), width: 0.9, align: "right" },
        ],
        rows: slipped.slice(0, 15).map((row) => [
          row.task.title,
          phaseLabel(ctx, row.task.phase),
          ctx.fmt.date(row.snap.dueDate),
          ctx.fmt.date(row.task.dueDate),
          cell(signedDays(ctx, row.variance), row.variance > 5 ? "red" : "orange"),
        ]),
        empty: ctx.t("status.noSlip"),
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Rapport budgétaire                                                  */
/* ------------------------------------------------------------------ */

function buildBudgetReport(ctx: BuildContext): ReportSection[] {
  const data = ctx.dataset.projects[0]!;
  const { project } = data;
  const health = healthOf(ctx, data);
  const current = project.budget;
  const initial = data.initialBudget;
  const pending = data.revisions.find((rev) => rev.status === "pending_mandant");
  const variance = current !== undefined && initial !== undefined ? current - initial : undefined;
  const earned = current !== undefined ? Math.round((current * (project.progress ?? 0)) / 100) : undefined;

  const kpis: ReportBlock = {
    kind: "kpis",
    items: [
      { label: ctx.t("budget.initial"), value: ctx.fmt.chf(initial), hint: initial !== undefined ? `${ctx.t("budget.approvedAt")} ${ctx.fmt.date(data.initialBudgetApprovedAt)}` : undefined },
      { label: ctx.t("budget.current"), value: ctx.fmt.chf(current), tone: "brand" },
      {
        label: ctx.t("budget.variance"),
        value:
          variance === undefined
            ? ctx.t("common.none")
            : `${variance > 0 ? "+" : ""}${ctx.fmt.chf(variance)}${health.budgetIncreasePct !== undefined ? ` (${health.budgetIncreasePct > 0 ? "+" : ""}${health.budgetIncreasePct} %)` : ""}`,
        tone: health.budget.tone === "neutral" ? undefined : health.budget.tone,
      },
      ...(pending
        ? [{ label: ctx.t("budget.pending"), value: ctx.fmt.chf(pending.amountCHF), tone: "orange" as ReportTone, hint: ctx.fmt.date(pending.requestedAt) }]
        : []),
      { label: ctx.t("budget.earned"), value: ctx.fmt.chf(earned), hint: ctx.fmt.percent(project.progress) },
      { label: ctx.t("budget.hours"), value: project.budgetHours ? `${ctx.fmt.number(project.budgetHours)} h` : ctx.t("common.none") },
    ],
  };

  const keyValues: ReportBlock = {
    kind: "keyValues",
    items: [
      { label: ctx.t("budget.budgetStatus"), value: tDynamic(ctx.tm, `enums.budgetStatus.${project.budgetStatus}`) },
      { label: ctx.t("status.mandant"), value: personLabel(ctx, project.mandantUserId, project.mandant) },
      { label: ctx.t("status.currentPhase"), value: phaseLabel(ctx, project.currentPhase) },
      { label: ctx.t("budget.revisionsCount"), value: String(data.revisions.length) },
    ],
  };

  const series = [
    { key: "initial", label: ctx.t("budget.seriesInitial"), color: REPORT_COLORS.slate },
    { key: "current", label: ctx.t("budget.seriesCurrent"), color: REPORT_COLORS.indigo },
    ...(pending ? [{ key: "requested", label: ctx.t("budget.seriesRequested"), color: REPORT_COLORS.orange }] : []),
    { key: "earned", label: ctx.t("budget.seriesEarned"), color: REPORT_COLORS.green },
  ];
  const values = [initial ?? null, current ?? null, ...(pending ? [pending.amountCHF] : []), earned ?? null];

  const revisions = data.revisions.filter((rev) => matchesPeriod(ctx, rev.requestedAt));
  const revisionTone: Record<string, ReportTone> = {
    pending_mandant: "orange",
    approved: "green",
    rejected: "red",
    superseded: "neutral",
  };

  const alerts: { tone: ReportTone; text: string }[] = [];
  if (!current && !project.budgetHours) alerts.push({ tone: "orange", text: ctx.t("budget.aNoBudget") });
  else if (project.budgetStatus !== "approved") {
    alerts.push({ tone: "orange", text: ctx.t("budget.aBudgetNotApproved", { phase: phaseLabel(ctx, project.currentPhase) }) });
  }
  if (pending) {
    alerts.push({
      tone: "orange",
      text: ctx.t("budget.aPending", { amount: ctx.fmt.chf(pending.amountCHF), date: ctx.fmt.date(pending.requestedAt) }),
    });
  }
  if ((health.budgetIncreasePct ?? 0) > 10) {
    alerts.push({
      tone: (health.budgetIncreasePct ?? 0) > 20 ? "red" : "orange",
      text: ctx.t("budget.aIncrease", { pct: health.budgetIncreasePct! }),
    });
  }
  const rejected = data.revisions.filter((rev) => rev.status === "rejected").length;
  if (rejected > 0) alerts.push({ tone: "neutral", text: ctx.t("budget.aRejected", { count: rejected }) });

  return [
    { title: ctx.t("budget.secOverview"), blocks: [kpis, keyValues] },
    {
      title: ctx.t("budget.secComparison"),
      blocks: [
        {
          kind: "bars",
          series,
          rows: [{ label: project.name, values }],
          formatted: [values.map((value) => (value === null ? null : ctx.fmt.chf(value)))],
        },
        { kind: "paragraph", text: ctx.t("budget.earnedHint", { pct: project.progress ?? 0 }), muted: true },
      ],
    },
    {
      title: ctx.t("budget.secRevisions"),
      description: periodLabel(ctx.t, ctx.fmt, ctx.params.from, ctx.params.to),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("budget.requestedAt"), width: 1.1 },
            { label: ctx.t("budget.amount"), width: 1.2, align: "right" },
            { label: ctx.t("budget.hours"), width: 0.8, align: "right" },
            { label: ctx.t("budget.reason"), width: 2.4 },
            { label: ctx.t("common.status"), width: 1.4 },
            { label: ctx.t("budget.decision"), width: 2 },
          ],
          rows: revisions.map((rev) => [
            ctx.fmt.date(rev.requestedAt),
            cell(ctx.fmt.chf(rev.amountCHF), undefined, true),
            rev.hoursForfait ? `${ctx.fmt.number(rev.hoursForfait)} h` : ctx.t("common.none"),
            `${rev.reason ?? ctx.t("common.none")} · ${ctx.t("budget.by")} ${userName(ctx, rev.requestedBy)}`,
            cell(rtDynamic(ctx.t, `budget.revStatus.${rev.status}`), revisionTone[rev.status]),
            rev.approvedAt
              ? `${ctx.fmt.date(rev.approvedAt)} · ${userName(ctx, rev.approvedBy)}`
              : rev.rejectionComment ?? ctx.t("common.none"),
          ]),
          empty: ctx.t("budget.noRevisions"),
        },
      ],
    },
    {
      title: ctx.t("budget.secAlerts"),
      blocks: [
        alerts.length > 0
          ? { kind: "alerts", items: alerts }
          : { kind: "alerts", items: [{ tone: "green", text: ctx.t("budget.alertsNone") }] },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Décisions & quality gates                                           */
/* ------------------------------------------------------------------ */

function checklistLabel(ctx: BuildContext, item: QualityGateCheckItem, data: ProjectReportData): string {
  if (item.id === "mandant_user") return ctx.t("decisions.cMandant");
  if (item.id === "budget_approved") return ctx.t("decisions.cBudget");
  if (item.id === "budget_revision") return ctx.t("decisions.cRevision");
  if (item.id === "phase_tasks") {
    const phaseTasks = data.tasks.filter((task) => task.phase === data.project.currentPhase);
    const done = phaseTasks.filter((task) => task.status === "termine" || (task.progress ?? 0) >= 100).length;
    return ctx.t("decisions.cTasks", { done, total: phaseTasks.length });
  }
  if (item.id.startsWith("outcome_")) {
    return ctx.t("decisions.cOutcome", { name: item.id.slice("outcome_".length) });
  }
  return item.label;
}

function buildDecisionsReport(ctx: BuildContext): ReportSection[] {
  const all = ctx.dataset.projects;
  const validations = all
    .flatMap((data) => data.validations.map((validation) => ({ validation, project: data.project })))
    .filter(({ validation }) =>
      matchesPeriod(ctx, validation.submittedAt) ||
      matchesPeriod(ctx, validation.approvedAt) ||
      matchesPeriod(ctx, validation.rejectedAt),
    )
    .sort((a, b) => b.validation.submittedAt.localeCompare(a.validation.submittedAt));
  const pending = all.flatMap((data) => pendingDecisions(ctx, data));
  const pvs = all.flatMap((data) =>
    data.documents
      .filter((doc) => doc.status === "pending_signature")
      .map((doc) => ({ doc, project: data.project })),
  );
  const statusTone: Record<string, ReportTone> = { submitted: "orange", approved: "green", rejected: "red" };

  const sections: ReportSection[] = [
    {
      title: ctx.t("status.secSummary"),
      blocks: [
        {
          kind: "kpis",
          items: [
            {
              label: ctx.t("decisions.kApproved"),
              value: String(validations.filter(({ validation }) => validation.status === "approved").length),
              tone: "green",
            },
            {
              label: ctx.t("decisions.kRejected"),
              value: String(validations.filter(({ validation }) => validation.status === "rejected").length),
              tone: validations.some(({ validation }) => validation.status === "rejected") ? "red" : undefined,
            },
            { label: ctx.t("decisions.kPending"), value: String(pending.length), tone: pending.length > 0 ? "orange" : "green" },
            { label: ctx.t("decisions.kPv"), value: String(pvs.length), tone: pvs.length > 0 ? "orange" : "green" },
          ],
        },
      ],
    },
    { title: ctx.t("decisions.secPending"), blocks: [pendingDecisionsTable(ctx, pending)] },
  ];

  if (!ctx.multi) {
    const data = all[0]!;
    const gate = getQualityGateForPhase(data.project.currentPhase, data.project.approach);
    const checklist = buildQualityGateChecklist(data.project, data.tasks, data.revisions, data.generatedOutcomes);
    const checkTone: Record<string, ReportTone> = { ok: "green", pending: "orange", blocked: "red" };
    sections.push({
      title: ctx.t("decisions.secGate"),
      description: gate
        ? `${localizeQualityGateLabel(gate, ctx.locale)} · ${phaseLabel(ctx, data.project.currentPhase)}`
        : undefined,
      blocks: [
        ...(gate?.isTerminal ? [{ kind: "paragraph" as const, text: ctx.t("decisions.gateTerminal"), muted: true }] : []),
        {
          kind: "table",
          columns: [
            { label: ctx.t("decisions.criterion"), width: 4 },
            { label: ctx.t("common.status"), width: 1.2 },
          ],
          rows: checklist.map((item) => [
            checklistLabel(ctx, item, data),
            cell(rtDynamic(ctx.t, `decisions.check.${item.status}`), checkTone[item.status]),
          ]),
        },
      ],
    });
  }

  sections.push(
    {
      title: ctx.t("decisions.secLog"),
      description: periodLabel(ctx.t, ctx.fmt, ctx.params.from, ctx.params.to),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("decisions.submittedAt"), width: 1.1 },
            ...(ctx.multi ? [{ label: ctx.t("common.project"), width: 1.6 }] : []),
            { label: ctx.t("decisions.transition"), width: 2 },
            { label: ctx.t("decisions.mode"), width: 0.9 },
            { label: ctx.t("common.status"), width: 1 },
            { label: ctx.t("decisions.submittedBy"), width: 1.3 },
            { label: ctx.t("decisions.decidedBy"), width: 1.6 },
            { label: ctx.t("decisions.comment"), width: 2 },
          ],
          rows: validations.map(({ validation, project }) => {
            const decidedAt = validation.approvedAt ?? validation.rejectedAt;
            const decidedBy = validation.approvedBy ?? validation.rejectedBy;
            return [
              ctx.fmt.date(validation.submittedAt),
              ...(ctx.multi ? [cell(project.name, undefined, true)] : []),
              `${phaseLabel(ctx, validation.fromPhase)} → ${phaseLabel(ctx, validation.toPhase)}`,
              rtDynamic(ctx.t, `decisions.modes.${validation.mode}`),
              cell(rtDynamic(ctx.t, `decisions.valStatus.${validation.status}`), statusTone[validation.status]),
              userName(ctx, validation.submittedBy),
              decidedBy ? `${userName(ctx, decidedBy)} · ${ctx.fmt.date(decidedAt)}` : ctx.t("common.none"),
              validation.rejectionComment ?? validation.submitComment ?? ctx.t("common.none"),
            ];
          }),
          empty: ctx.t("decisions.noValidations"),
        },
      ],
    },
    {
      title: ctx.t("decisions.secPv"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("decisions.pvTitle"), width: 3 },
            ...(ctx.multi ? [{ label: ctx.t("common.project"), width: 1.8 }] : []),
            { label: ctx.t("common.phase"), width: 1.2 },
            { label: ctx.t("decisions.session"), width: 1.1 },
            { label: ctx.t("decisions.assignedTo"), width: 1.6 },
          ],
          rows: pvs.map(({ doc, project }) => [
            doc.title,
            ...(ctx.multi ? [cell(project.name, undefined, true)] : []),
            phaseLabel(ctx, doc.phase),
            ctx.fmt.date(doc.sessionDate),
            userName(ctx, doc.assignedToUserId),
          ]),
          empty: ctx.t("decisions.noPv"),
        },
      ],
    },
  );
  return sections;
}

/* ------------------------------------------------------------------ */
/* Rapport portefeuille                                                */
/* ------------------------------------------------------------------ */

function buildPortfolioReport(ctx: BuildContext): ReportSection[] {
  const rows = ctx.dataset.projects.map((data) => ({ data, health: healthOf(ctx, data) }));
  if (rows.length === 0) {
    return [{ title: ctx.t("portfolio.secSummary"), blocks: [{ kind: "paragraph", text: ctx.t("portfolio.noProjects"), muted: true }] }];
  }
  const active = rows.filter(({ data }) => data.project.status === "en_cours" || data.project.status === "planifie");
  const avgProgress = Math.round(rows.reduce((sum, { data }) => sum + (data.project.progress ?? 0), 0) / rows.length);
  const totalBudget = rows.reduce((sum, { data }) => sum + (data.project.budget ?? 0), 0);
  const totalInitial = rows.reduce((sum, { data }) => sum + (data.initialBudget ?? data.project.budget ?? 0), 0);
  const late = rows.filter(
    ({ health }) => health.endPassed || health.overdueCount > 0 || (health.slipDays ?? 0) > 5,
  );
  const pending = rows.flatMap(({ data }) => pendingDecisions(ctx, data));

  const toneCount = (tone: ReportTone) => rows.filter(({ health }) => health.overall === tone).length;

  const nextGates: PendingDecision[] = rows
    .filter(({ data }) => data.project.status !== "termine" && !pending.some((item) => item.project.id === data.project.id))
    .map(({ data }) => {
      const gate = getQualityGateForPhase(data.project.currentPhase, data.project.approach);
      return {
        project: data.project,
        label: `${ctx.t("portfolio.nextGate")} — ${gate ? localizeQualityGateLabel(gate, ctx.locale) : phaseLabel(ctx, data.project.currentPhase)}`,
        since: undefined,
        responsible: personLabel(ctx, data.project.chefDeProjetId, data.project.chefDeProjet),
      };
    });

  const budgetRows = rows.filter(({ data }) => (data.project.budget ?? 0) > 0);

  return [
    {
      title: ctx.t("portfolio.secSummary"),
      blocks: [
        {
          kind: "kpis",
          items: [
            { label: ctx.t("portfolio.projects"), value: String(rows.length) },
            { label: ctx.t("portfolio.active"), value: String(active.length) },
            { label: ctx.t("portfolio.avgProgress"), value: ctx.fmt.percent(avgProgress), tone: "brand" },
            { label: ctx.t("portfolio.totalBudget"), value: ctx.fmt.chf(totalBudget) },
            { label: ctx.t("portfolio.lateProjects"), value: String(late.length), tone: late.length > 0 ? "red" : "green" },
            { label: ctx.t("portfolio.pendingDecisions"), value: String(pending.length), tone: pending.length > 0 ? "orange" : "green" },
          ],
        },
      ],
    },
    {
      title: ctx.t("portfolio.secHealth"),
      blocks: [
        {
          kind: "stack",
          total: rows.length,
          caption: ctx.t("common.projectsCount", { count: rows.length }),
          segments: [
            { label: ctx.t("weather.green"), value: toneCount("green"), color: REPORT_COLORS.green },
            { label: ctx.t("weather.orange"), value: toneCount("orange"), color: REPORT_COLORS.orange },
            { label: ctx.t("weather.red"), value: toneCount("red"), color: REPORT_COLORS.red },
            { label: ctx.t("weather.neutral"), value: toneCount("neutral"), color: REPORT_COLORS.slate },
          ],
        },
      ],
    },
    {
      title: ctx.t("portfolio.secProjects"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("common.project"), width: 2.4 },
            { label: ctx.t("common.phase"), width: 1.2 },
            { label: ctx.t("common.status"), width: 1 },
            { label: ctx.t("common.progress"), width: 0.9, align: "right" },
            { label: ctx.t("portfolio.weather"), width: 1.2 },
            { label: ctx.t("portfolio.budget"), width: 1.2, align: "right" },
            { label: ctx.t("portfolio.end"), width: 1.1 },
            { label: ctx.t("portfolio.overdueTasks"), width: 0.9, align: "right" },
          ],
          rows: rows.map(({ data, health }) => [
            cell(data.project.name, undefined, true),
            phaseLabel(ctx, data.project.currentPhase),
            tDynamic(ctx.tm, `enums.projectStatus.${data.project.status}`),
            ctx.fmt.percent(data.project.progress),
            cell(toneLabel(ctx.t, health.overall), health.overall),
            ctx.fmt.chf(data.project.budget),
            cell(ctx.fmt.date(data.project.endDate), health.endPassed ? "red" : undefined),
            cell(String(health.overdueCount), health.overdueCount > 0 ? "red" : undefined),
          ]),
        },
      ],
    },
    {
      title: ctx.t("portfolio.secProgress"),
      blocks: [
        {
          kind: "progress",
          rows: rows.map(({ data, health }) => ({
            label: data.project.name,
            value: data.project.progress ?? 0,
            detail: `${phaseLabel(ctx, data.project.currentPhase)} · ${toneLabel(ctx.t, health.overall)}`,
            tone: health.overall === "neutral" ? "brand" : health.overall,
          })),
        },
      ],
    },
    {
      title: ctx.t("portfolio.secBudget"),
      blocks: [
        {
          kind: "kpis",
          items: [
            { label: ctx.t("portfolio.totalInitial"), value: ctx.fmt.chf(totalInitial) },
            { label: ctx.t("portfolio.totalBudget"), value: ctx.fmt.chf(totalBudget), tone: "brand" },
            {
              label: ctx.t("portfolio.totalVariance"),
              value: `${totalBudget - totalInitial > 0 ? "+" : ""}${ctx.fmt.chf(totalBudget - totalInitial)}`,
              tone: totalBudget - totalInitial > 0 ? "orange" : "green",
            },
          ],
        },
        ...(budgetRows.length > 0
          ? [
              {
                kind: "bars" as const,
                series: [
                  { key: "initial", label: ctx.t("budget.seriesInitial"), color: REPORT_COLORS.slate },
                  { key: "current", label: ctx.t("budget.seriesCurrent"), color: REPORT_COLORS.indigo },
                ],
                rows: budgetRows.map(({ data }) => ({
                  label: data.project.name,
                  values: [data.initialBudget ?? null, data.project.budget ?? null],
                })),
                formatted: budgetRows.map(({ data }) => [
                  data.initialBudget !== undefined ? ctx.fmt.chf(data.initialBudget) : null,
                  ctx.fmt.chf(data.project.budget),
                ]),
              },
            ]
          : []),
      ],
    },
    {
      title: ctx.t("portfolio.secLate"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("common.project"), width: 2 },
            { label: ctx.t("portfolio.reasons"), width: 3.6 },
            { label: ctx.t("portfolio.end"), width: 1.1 },
            { label: ctx.t("portfolio.weather"), width: 1.1 },
          ],
          rows: late.map(({ data, health }) => [
            cell(data.project.name, undefined, true),
            health.schedule.reasons.join(" · "),
            ctx.fmt.date(data.project.endDate),
            cell(toneLabel(ctx.t, health.schedule.tone), health.schedule.tone),
          ]),
          empty: ctx.t("portfolio.noLate"),
        },
      ],
    },
    { title: ctx.t("portfolio.secNext"), blocks: [pendingDecisionsTable(ctx, [...pending, ...nextGates])] },
  ];
}

/* ------------------------------------------------------------------ */
/* Ressources & charge                                                 */
/* ------------------------------------------------------------------ */

interface WorkItem {
  kind: "task" | "activity";
  title: string;
  project: Project;
  status: TaskStatus;
  progress: number;
  dueDate?: string;
  assigneeId?: string;
}

function buildResourcesReport(ctx: BuildContext): ReportSection[] {
  const items: WorkItem[] = [];
  const unassigned: { task: Task; project: Project }[] = [];
  for (const data of ctx.dataset.projects) {
    const taskById = new Map(data.tasks.map((task) => [task.id, localizedTask(ctx, task)]));
    for (const task of taskById.values()) {
      if (task.assigneeId) {
        items.push({ kind: "task", title: task.title, project: data.project, status: task.status, progress: task.progress ?? 0, dueDate: task.dueDate, assigneeId: task.assigneeId });
      } else if (task.status !== "termine") {
        const hasAssignedActivity = data.activities.some((activity) => activity.taskId === task.id && activity.assigneeId);
        if (!hasAssignedActivity) unassigned.push({ task, project: data.project });
      }
    }
    for (const activity of data.activities) {
      if (!activity.assigneeId) continue;
      const parent = taskById.get(activity.taskId);
      items.push({
        kind: "activity",
        title: parent ? `${activity.title} (${parent.title})` : activity.title,
        project: data.project,
        status: activity.status,
        progress: activity.progress ?? 0,
        dueDate: activity.dueDate,
        assigneeId: activity.assigneeId,
      });
    }
  }

  const byPerson = new Map<string, WorkItem[]>();
  for (const item of items) {
    const list = byPerson.get(item.assigneeId!) ?? [];
    list.push(item);
    byPerson.set(item.assigneeId!, list);
  }
  const capacity = new Map(ctx.dataset.resourceProfiles.map((profile) => [profile.userId, profile.weeklyCapacityPercent]));
  const people = [...byPerson.entries()]
    .map(([userId, list]) => {
      const open = list.filter((item) => item.status !== "termine");
      return {
        userId,
        name: userName(ctx, userId),
        total: list.length,
        done: list.length - open.length,
        inProgress: list.filter((item) => item.status === "en_cours").length,
        open: open.length,
        overdue: list.filter((item) => isTaskOverdue(item, ctx.today)),
        avg: Math.round(list.reduce((sum, item) => sum + item.progress, 0) / list.length),
      };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, ctx.locale));
  const maxOpen = Math.max(1, ...people.map((person) => person.open));
  const overdueTotal = people.reduce((sum, person) => sum + person.overdue.length, 0);

  const lateRows = people
    .flatMap((person) =>
      person.overdue.map((item) => ({ person, item, late: daysBetween(item.dueDate!, ctx.today) })),
    )
    .sort((a, b) => a.person.name.localeCompare(b.person.name, ctx.locale) || b.late - a.late);

  return [
    {
      title: ctx.t("resources.secSummary"),
      blocks: [
        {
          kind: "kpis",
          items: [
            { label: ctx.t("resources.people"), value: String(people.length) },
            { label: ctx.t("resources.assigned"), value: String(items.length), tone: "brand" },
            { label: ctx.t("resources.overdue"), value: String(overdueTotal), tone: overdueTotal > 0 ? "red" : "green" },
            { label: ctx.t("resources.unassigned"), value: String(unassigned.length), tone: unassigned.length > 0 ? "orange" : "green" },
          ],
        },
      ],
    },
    {
      title: ctx.t("resources.secOpenLoad"),
      blocks: [
        people.length > 0
          ? {
              kind: "progress",
              rows: people.map((person) => ({
                label: person.name,
                value: Math.round((person.open / maxOpen) * 100),
                valueLabel: String(person.open),
                detail: ctx.t("resources.openDetail", { open: person.open, overdue: person.overdue.length }),
                tone: person.overdue.length > 0 ? "orange" : "brand",
              })),
            }
          : { kind: "paragraph", text: ctx.t("resources.noAssignments"), muted: true },
      ],
    },
    {
      title: ctx.t("resources.secLoad"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("resources.person"), width: 2.2 },
            { label: ctx.t("resources.items"), width: 0.9, align: "right" },
            { label: ctx.t("resources.done"), width: 0.9, align: "right" },
            { label: ctx.t("resources.inProgress"), width: 0.9, align: "right" },
            { label: ctx.t("resources.overdue"), width: 0.9, align: "right" },
            { label: ctx.t("resources.avgProgress"), width: 1, align: "right" },
            { label: ctx.t("resources.capacity"), width: 1, align: "right" },
          ],
          rows: people.map((person) => [
            cell(person.name, undefined, true),
            String(person.total),
            String(person.done),
            String(person.inProgress),
            cell(String(person.overdue.length), person.overdue.length > 0 ? "red" : undefined),
            ctx.fmt.percent(person.avg),
            capacity.has(person.userId) ? ctx.fmt.percent(capacity.get(person.userId)) : ctx.t("common.none"),
          ]),
          empty: ctx.t("resources.noAssignments"),
        },
      ],
    },
    {
      title: ctx.t("resources.secLate"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("resources.person"), width: 1.6 },
            { label: ctx.t("resources.item"), width: 3.2 },
            ...(ctx.multi ? [{ label: ctx.t("common.project"), width: 1.6 }] : []),
            { label: ctx.t("common.dueDate"), width: 1 },
            { label: ctx.t("common.late"), width: 0.8, align: "right" },
          ],
          rows: lateRows.slice(0, 40).map(({ person, item, late }) => [
            person.name,
            `${item.kind === "task" ? ctx.t("resources.kindTask") : ctx.t("resources.kindActivity")} · ${item.title}`,
            ...(ctx.multi ? [item.project.name] : []),
            ctx.fmt.date(item.dueDate),
            cell(days(ctx, late), "red"),
          ]),
          empty: ctx.t("resources.noLate"),
        },
      ],
    },
    {
      title: ctx.t("resources.secUnassigned"),
      blocks: [
        {
          kind: "table",
          columns: [
            { label: ctx.t("common.task"), width: 3.2 },
            ...(ctx.multi ? [{ label: ctx.t("common.project"), width: 1.8 }] : []),
            { label: ctx.t("common.phase"), width: 1.2 },
            { label: ctx.t("common.dueDate"), width: 1 },
          ],
          rows: unassigned.slice(0, 40).map(({ task, project }) => [
            task.title,
            ...(ctx.multi ? [project.name] : []),
            phaseLabel(ctx, task.phase),
            ctx.fmt.date(task.dueDate),
          ]),
          empty: ctx.t("resources.noUnassigned"),
        },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */

export interface BuildReportInput {
  params: ReportParams;
  dataset: ReportDataset;
  portfolio?: Portfolio;
  generatedBy: string;
  now?: Date;
}

export function buildReport(input: BuildReportInput): ReportDocument {
  const { params, dataset, portfolio } = input;
  const locale = params.locale;
  const t = getReportTranslator(locale);
  const fmt = createFormatter(locale, t("common.none"));
  const ctx: BuildContext = {
    params,
    locale,
    t,
    tm: getTranslator(locale),
    fmt,
    today: todayIso(),
    dataset,
    userById: new Map(dataset.users.map((user) => [user.id, user])),
    multi: params.scope.kind !== "project",
  };

  const builders = {
    status: buildStatusReport,
    budget: buildBudgetReport,
    decisions: buildDecisionsReport,
    portfolio: buildPortfolioReport,
    resources: buildResourcesReport,
  } as const;

  const scopeLabel =
    params.scope.kind === "project"
      ? dataset.projects[0]?.project.name ?? ""
      : params.scope.kind === "portfolio"
        ? portfolio?.name ?? ""
        : t("common.allProjects");

  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const subtitleParts = [scopeLabel];
  if (params.scope.kind !== "project") {
    subtitleParts.push(t("common.projectsCount", { count: dataset.projects.length }));
  }

  return {
    type: params.type,
    locale,
    title: rtDynamic(t, `types.${params.type}.name`),
    subtitle: subtitleParts.join(" · "),
    scopeLabel,
    periodLabel: periodLabel(t, fmt, params.from, params.to),
    generatedAt,
    generatedAtLabel: t("common.generatedOn", { date: fmt.dateTime(generatedAt), name: input.generatedBy }),
    generatedBy: input.generatedBy,
    projectIds: dataset.projects.map((data) => data.project.id),
    sections: builders[params.type](ctx),
    labels: {
      generatedOn: t("common.generatedOn", { date: fmt.dateTime(generatedAt), name: input.generatedBy }),
      page: t("common.page", { page: "{page}", total: "{total}" }),
      confidential: t("common.confidential"),
      scope: t("common.scope"),
      period: t("common.period"),
    },
  };
}
