"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, ListChecks } from "lucide-react";
import type { ProjectTimeAnalysis, TaskEffort } from "@/lib/time-tracking/summary";
import { ESTIMATE_REVISION_REASONS, type EstimateRevisionReason, type HermesPhaseId } from "@/types";
import { TimeUsageChart } from "./time-usage-chart";
import { useTimeI18n, type TimeI18n } from "./use-time-i18n";

export interface PlanningTask {
  taskId: string;
  title: string;
  phase: HermesPhaseId;
  phaseLabel: string;
  estimatedHours: number | null;
  initialEstimatedHours: number | null;
}

interface ProjectTimePanelProps {
  analysis: ProjectTimeAnalysis;
  canManage: boolean;
  planningTasks: PlanningTask[];
}

export function ProjectTimePanel({ analysis, canManage, planningTasks }: ProjectTimePanelProps) {
  const i18n = useTimeI18n();
  const { tt } = i18n;
  const [planning, setPlanning] = useState(false);
  const h = i18n.hours;

  const alerts: string[] = [];
  if (analysis.budgetHours !== undefined && analysis.forecastHours > analysis.budgetHours) {
    alerts.push(
      tt("analysis.forecastOverBudget", { forecast: h(analysis.forecastHours), budget: h(analysis.budgetHours) }),
    );
  }
  if (analysis.plannedHours > 0 && analysis.forecastHours > analysis.plannedHours) {
    alerts.push(
      tt("analysis.forecastOverPlan", {
        value: h(Math.round((analysis.forecastHours - analysis.plannedHours) * 100) / 100),
      }),
    );
  }
  if (analysis.unplannedWithTime > 0) {
    alerts.push(tt("analysis.unplannedWithTime", { count: analysis.unplannedWithTime }));
  }

  const kpis = [
    { label: tt("analysis.initialPlan"), value: h(analysis.initialHours) },
    { label: tt("analysis.currentPlan"), value: h(analysis.plannedHours) },
    { label: tt("analysis.actual"), value: h(analysis.actualHours), tone: "brand" },
    { label: tt("analysis.remaining"), value: h(analysis.remainingHours) },
    {
      label: tt("analysis.forecast"),
      value: h(analysis.forecastHours),
      tone:
        (analysis.budgetHours !== undefined && analysis.forecastHours > analysis.budgetHours) ||
        (analysis.plannedHours > 0 && analysis.forecastHours > analysis.plannedHours)
          ? "warn"
          : undefined,
    },
    {
      label: tt("project.budgetHours"),
      value: analysis.budgetHours !== undefined ? h(analysis.budgetHours) : tt("project.noBudget"),
      hint:
        analysis.budgetUsedPercent !== undefined
          ? tt("project.budgetUsed", { pct: analysis.budgetUsedPercent })
          : undefined,
    },
  ];

  return (
    <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Clock className="h-5 w-5 text-brand-indigo" />
            {tt("project.title")}
          </h2>
          <p className="mt-1 text-sm text-brand-muted">{tt("project.subtitle")}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setPlanning((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <ListChecks className="h-4 w-4" />
            {tt("analysis.planning")}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-lg border p-3 ${
              kpi.tone === "warn"
                ? "border-amber-200 bg-amber-50"
                : kpi.tone === "brand"
                  ? "border-indigo-200 bg-indigo-50"
                  : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">{kpi.label}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{kpi.value}</p>
            {kpi.hint && <p className="mt-0.5 text-[11px] text-brand-muted">{kpi.hint}</p>}
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <ul className="space-y-1">
          {alerts.map((alert) => (
            <li
              key={alert}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {alert}
            </li>
          ))}
        </ul>
      )}

      {planning && canManage && (
        <PlanningEditor tasks={planningTasks} i18n={i18n} onDone={() => setPlanning(false)} />
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-900">{tt("analysis.chartTitle")}</h3>
        <p className="mb-3 mt-1 text-xs text-brand-muted">{tt("analysis.chartHint")}</p>
        <TimeUsageChart
          series={analysis.series}
          todayIndex={analysis.todayIndex}
          budgetHours={analysis.budgetHours}
          plannedHours={analysis.plannedHours}
        />
      </div>

      {analysis.entryCount === 0 && analysis.plannedHours === 0 ? (
        <p className="text-sm text-brand-muted">{tt("project.noTime")}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <EffortTable
            title={tt("project.byPhase")}
            firstColumn={tt("analysis.phase")}
            rows={analysis.byPhase.map((row) => ({ ...row, key: row.phase }))}
            i18n={i18n}
          />
          <EffortTable
            title={tt("project.byPerson")}
            firstColumn={tt("analysis.person")}
            rows={analysis.byPerson.map((row) => ({ ...row, key: row.userId }))}
            i18n={i18n}
          />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-900">{tt("analysis.revisionsTitle")}</h3>
        {analysis.revisions.count === 0 ? (
          <p className="mt-1 text-sm text-brand-muted">{tt("analysis.noRevisions")}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-700">
              {tt("analysis.revisionsSummary", {
                count: analysis.revisions.count,
                delta: signedHours(i18n, analysis.revisions.totalDeltaHours),
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.revisions.byReason.map((item) => (
                <span
                  key={item.reason}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700"
                >
                  {tt(`reasons.${item.reason}`)} · {item.count} · {signedHours(i18n, item.deltaHours)}
                </span>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-brand-muted">
              {analysis.revisions.recent.map((revision) => (
                <li key={revision.id} className="rounded bg-slate-50 px-2 py-1">
                  <span className="text-slate-400">{i18n.date(revision.changedAt.slice(0, 10))}</span> —{" "}
                  <span className="font-medium text-slate-700">{revision.taskTitle}</span>
                  {i18n.colon}
                  {revision.previousHours !== null ? h(revision.previousHours) : tt("effort.notSet")} →{" "}
                  {revision.newHours !== null ? h(revision.newHours) : tt("effort.notSet")} (
                  {signedHours(i18n, revision.deltaHours)}) · {tt(`reasons.${revision.reason}`)}
                  {revision.reasonText && <> — {revision.reasonText}</>} · {revision.changedByName}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {analysis.byTask.length > 0 && <TaskEffortTable rows={analysis.byTask} i18n={i18n} />}

      {analysis.unplannedTasks > 0 && (
        <p className="text-xs text-brand-muted">{tt("analysis.unplanned", { count: analysis.unplannedTasks })}</p>
      )}
    </section>
  );
}

function signedHours(i18n: TimeI18n, value: number): string {
  if (value === 0) return i18n.hours(0);
  return `${value > 0 ? "+" : "−"}${i18n.hours(Math.abs(value))}`;
}

interface EffortRow {
  key: string;
  label: string;
  plannedHours: number;
  actualHours: number;
  remainingHours: number;
  forecastHours: number;
}

function EffortTable({
  title,
  firstColumn,
  rows,
  i18n,
}: {
  title: string;
  firstColumn: string;
  rows: EffortRow[];
  i18n: TimeI18n;
}) {
  const { tt, hours } = i18n;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">{firstColumn}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.currentPlan")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.actual")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.forecast")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const over = row.plannedHours > 0 && row.forecastHours > row.plannedHours;
              return (
                <tr key={row.key}>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.label}</td>
                  <td className="px-3 py-2 text-right">{hours(row.plannedHours)}</td>
                  <td className="px-3 py-2 text-right">{hours(row.actualHours)}</td>
                  <td className={`px-3 py-2 text-right ${over ? "font-semibold text-amber-700" : ""}`}>
                    {hours(row.forecastHours)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskEffortTable({ rows, i18n }: { rows: TaskEffort[]; i18n: TimeI18n }) {
  const { tt, hours } = i18n;
  return (
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        {tt("project.byTask")} ({rows.length})
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">{tt("analysis.task")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.initialPlan")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.currentPlan")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.actual")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.remaining")}</th>
              <th className="px-3 py-2 text-right font-semibold">{tt("analysis.forecast")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.taskId}>
                <td className="px-3 py-2 text-slate-800">
                  {row.label}
                  {row.revisions > 0 && (
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">
                      ±{row.revisions}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{hours(row.initialHours)}</td>
                <td className="px-3 py-2 text-right">{hours(row.plannedHours)}</td>
                <td className="px-3 py-2 text-right">{hours(row.actualHours)}</td>
                <td className="px-3 py-2 text-right">{hours(row.remainingHours)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.plannedHours > 0 && row.forecastHours > row.plannedHours ? "font-semibold text-amber-700" : ""
                  }`}
                >
                  {hours(row.forecastHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function PlanningEditor({
  tasks,
  i18n,
  onDone,
}: {
  tasks: PlanningTask[];
  i18n: TimeI18n;
  onDone: () => void;
}) {
  const router = useRouter();
  const { tt } = i18n;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tasks.map((task) => [task.taskId, task.estimatedHours?.toString() ?? ""])),
  );
  const [reason, setReason] = useState<EstimateRevisionReason>("unforeseen");
  const [reasonText, setReasonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, PlanningTask[]>();
    for (const task of tasks) map.set(task.phaseLabel, [...(map.get(task.phaseLabel) ?? []), task]);
    return [...map.entries()];
  }, [tasks]);

  const parse = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
  const changed = tasks.filter((task) => parse(values[task.taskId] ?? "") !== task.estimatedHours);
  const needsReason = changed.some((task) => task.estimatedHours !== null || task.initialEstimatedHours !== null);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    let saved = 0;
    for (const task of changed) {
      const hours = parse(values[task.taskId] ?? "");
      if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
        setError(`${task.title} : ${tt("errors.invalidEstimate")}`);
        break;
      }
      try {
        const response = await fetch(`/api/tasks/${task.taskId}/estimate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hours, reason, reasonText }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
          setError(`${task.title} : ${i18n.errorMessage(data)}`);
          break;
        }
        saved += 1;
      } catch {
        setError(tt("errors.network"));
        break;
      }
    }
    setSaving(false);
    if (saved > 0) {
      setMessage(tt("analysis.planningSaved", { count: saved }));
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <p className="text-sm text-slate-700">{tt("analysis.planningHint")}</p>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-brand-muted">{tt("analysis.noTasks")}</p>
      ) : (
        <div className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">{tt("analysis.task")}</th>
                <th className="px-3 py-2 text-right font-semibold">{tt("effort.initial")}</th>
                <th className="w-[140px] px-3 py-2 text-right font-semibold">{tt("common.estimateHours")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([phaseLabel, items]) => (
                <PlanningGroup
                  key={phaseLabel}
                  phaseLabel={phaseLabel}
                  items={items}
                  values={values}
                  onChange={(taskId, value) => setValues((current) => ({ ...current, [taskId]: value }))}
                  i18n={i18n}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {needsReason && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("analysis.reasonForChanges")}</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as EstimateRevisionReason)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {ESTIMATE_REVISION_REASONS.map((item) => (
                <option key={item} value={item}>
                  {tt(`reasons.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("effort.reasonText")}</span>
            <input
              value={reasonText}
              maxLength={500}
              onChange={(e) => setReasonText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        >
          {tt("common.close")}
        </button>
        <button
          type="button"
          disabled={saving || changed.length === 0}
          onClick={() => void save()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {tt("common.save")} {changed.length > 0 ? `(${changed.length})` : ""}
        </button>
      </div>
    </div>
  );
}

function PlanningGroup({
  phaseLabel,
  items,
  values,
  onChange,
  i18n,
}: {
  phaseLabel: string;
  items: PlanningTask[];
  values: Record<string, string>;
  onChange: (taskId: string, value: string) => void;
  i18n: TimeI18n;
}) {
  return (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {phaseLabel}
        </td>
      </tr>
      {items.map((task) => (
        <tr key={task.taskId} className="border-t border-slate-100">
          <td className="px-3 py-1.5 text-slate-800">{task.title}</td>
          <td className="px-3 py-1.5 text-right text-xs text-brand-muted">
            {task.initialEstimatedHours !== null ? i18n.hours(task.initialEstimatedHours) : "—"}
          </td>
          <td className="px-3 py-1.5 text-right">
            <input
              type="number"
              min={0}
              step={0.25}
              value={values[task.taskId] ?? ""}
              onChange={(e) => onChange(task.taskId, e.target.value)}
              className="w-24 rounded border border-slate-200 px-2 py-1 text-right text-sm"
            />
          </td>
        </tr>
      ))}
    </>
  );
}
