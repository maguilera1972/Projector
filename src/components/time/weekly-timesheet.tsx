"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toIntlLocale } from "@/lib/i18n/config";
import { todayIso } from "@/lib/reports/format";
import { parseDuration } from "@/lib/time-tracking/duration";
import {
  DAILY_WARNING_MINUTES,
  addDaysIso,
  latestAllowedDate,
  startOfWeekIso,
  weekDaysIso,
} from "@/lib/time-tracking/rules";
import type { TimeEntryView, TimesheetTaskRow } from "@/lib/time-tracking/service";
import { QuickTimeDialog } from "./quick-time-dialog";
import { useTimeI18n, type TimeI18n } from "./use-time-i18n";

interface WeeklyTimesheetProps {
  tasks: TimesheetTaskRow[];
  currentUserId: string;
}

interface Row {
  taskId: string;
  title: string;
  projectName: string;
  status: TimesheetTaskRow["status"];
  assigned: boolean;
}

export function WeeklyTimesheet({ tasks, currentUserId }: WeeklyTimesheetProps) {
  const router = useRouter();
  const i18n = useTimeI18n();
  const { tt } = i18n;
  const [weekStart, setWeekStart] = useState(() => startOfWeekIso(todayIso()));
  const [entries, setEntries] = useState<TimeEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [dialogTask, setDialogTask] = useState<Row | null>(null);

  const days = useMemo(() => weekDaysIso(weekStart), [weekStart]);
  const weekEnd = days[6];
  const maxDate = latestAllowedDate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/time-entries?userId=me&from=${weekStart}&to=${weekEnd}`);
      const data = (await response.json()) as { entries?: TimeEntryView[]; code?: string; error?: string };
      if (!response.ok) {
        setError(i18n.errorMessage(data));
        return;
      }
      setEntries((data.entries ?? []).filter((entry) => entry.userId === currentUserId));
    } catch {
      setError(tt("errors.network"));
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, currentUserId, i18n, tt]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const withTime = new Set(entries.map((entry) => entry.taskId));
    const list: Row[] = tasks
      .filter((task) => showCompleted || task.status !== "termine" || withTime.has(task.taskId))
      .map((task) => ({
        taskId: task.taskId,
        title: task.title,
        projectName: task.projectName,
        status: task.status,
        assigned: true,
      }));
    const known = new Set(list.map((row) => row.taskId));
    for (const entry of entries) {
      if (known.has(entry.taskId)) continue;
      known.add(entry.taskId);
      list.push({
        taskId: entry.taskId,
        title: entry.taskTitle,
        projectName: entry.projectName,
        status: "en_cours",
        assigned: tasks.some((task) => task.taskId === entry.taskId),
      });
    }
    return list;
  }, [tasks, entries, showCompleted]);

  const cellEntries = (taskId: string, day: string) =>
    entries.filter((entry) => entry.taskId === taskId && entry.date === day);
  const dayTotal = (day: string) =>
    entries.filter((entry) => entry.date === day).reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const weekTotal = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);

  async function saveCell(row: Row, day: string, value: string): Promise<boolean> {
    const current = cellEntries(row.taskId, day);
    const trimmed = value.trim();
    const minutes = trimmed === "" ? 0 : parseDuration(trimmed);
    if (minutes === null) {
      setError(tt("errors.invalidDuration"));
      return false;
    }
    const existing = current[0];
    if (!existing && minutes === 0) return true;
    if (existing && existing.durationMinutes === minutes) return true;

    setError("");
    const request =
      !existing
        ? fetch(`/api/tasks/${row.taskId}/time-entries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: day, durationMinutes: minutes }),
          })
        : minutes === 0
          ? fetch(`/api/time-entries/${existing.id}`, { method: "DELETE" })
          : fetch(`/api/time-entries/${existing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ durationMinutes: minutes }),
            });
    try {
      const response = await request;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
        setError(i18n.errorMessage(data));
        return false;
      }
      await load();
      router.refresh();
      return true;
    } catch {
      setError(tt("errors.network"));
      return false;
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{tt("timesheet.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-muted">{tt("timesheet.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            aria-label={tt("timesheet.previous")}
            title={tt("timesheet.previous")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[220px] text-center text-sm font-medium text-slate-800">
            {tt("timesheet.week", { from: i18n.date(weekStart), to: i18n.date(weekEnd) })}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            aria-label={tt("timesheet.next")}
            title={tt("timesheet.next")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeekIso(todayIso()))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {tt("timesheet.current")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
        <label className="inline-flex items-center gap-2 text-brand-muted">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          {tt("timesheet.showCompleted")}
        </label>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />}
      </div>

      {error && (
        <p className="mx-6 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {rows.length === 0 ? (
        !loading && (
          <p className="px-6 pb-8 pt-2 text-center text-sm text-brand-muted">{tt("timesheet.noTasks")}</p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">{tt("timesheet.task")}</th>
                {days.map((day) => (
                  <th key={day} className="w-[84px] px-2 py-3 text-center font-semibold">
                    <WeekdayLabel day={day} i18n={i18n} today={todayIso()} />
                  </th>
                ))}
                <th className="w-[80px] px-3 py-3 text-right font-semibold">{tt("timesheet.total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const rowTotal = entries
                  .filter((entry) => entry.taskId === row.taskId)
                  .reduce((sum, entry) => sum + entry.durationMinutes, 0);
                return (
                  <tr key={row.taskId}>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setDialogTask(row)}
                        className="text-left font-medium text-slate-900 hover:text-brand-indigo"
                      >
                        {row.title}
                      </button>
                      <p className="text-xs text-brand-muted">
                        {row.projectName}
                        {!row.assigned && <> · {tt("timesheet.notAssigned")}</>}
                      </p>
                    </td>
                    {days.map((day) => {
                      const cell = cellEntries(row.taskId, day);
                      if (cell.length > 1) {
                        return (
                          <td key={day} className="px-1 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setDialogTask(row)}
                              title={tt("timesheet.multiEntries", { count: cell.length })}
                              className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-1 py-1.5 text-sm font-medium text-indigo-700"
                            >
                              {i18n.duration(cell.reduce((sum, entry) => sum + entry.durationMinutes, 0))}*
                            </button>
                          </td>
                        );
                      }
                      const disabled = day > maxDate || (!row.assigned && cell.length === 0);
                      return (
                        <td key={day} className="px-1 py-2">
                          <TimesheetCell
                            key={`${weekStart}-${row.taskId}-${day}-${cell[0]?.id ?? "new"}-${cell[0]?.durationMinutes ?? 0}`}
                            initial={cell[0] ? i18n.duration(cell[0].durationMinutes) : ""}
                            disabled={disabled}
                            onCommit={(value) => saveCell(row, day, value)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-medium text-slate-900">
                      {rowTotal > 0 ? i18n.duration(rowTotal) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm">
              <tr>
                <td className="px-4 py-3 font-semibold">{tt("timesheet.dayTotal")}</td>
                {days.map((day) => {
                  const total = dayTotal(day);
                  const over = total > DAILY_WARNING_MINUTES;
                  return (
                    <td
                      key={day}
                      className={`px-2 py-3 text-center font-semibold ${over ? "text-amber-700" : "text-slate-800"}`}
                      title={over ? tt("timesheet.overDay") : undefined}
                    >
                      {over && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                      {total > 0 ? i18n.duration(total) : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right font-bold text-slate-900" title={tt("timesheet.weekTotal")}>
                  {i18n.duration(weekTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <QuickTimeDialog
        taskId={dialogTask?.taskId ?? null}
        taskTitle={dialogTask?.title}
        onClose={() => {
          setDialogTask(null);
          void load();
        }}
      />
    </section>
  );
}

function WeekdayLabel({ day, i18n, today }: { day: string; i18n: TimeI18n; today: string }) {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat(toIntlLocale(i18n.locale), { weekday: "short", timeZone: "UTC" }).format(date);
  const short = new Intl.DateTimeFormat(toIntlLocale(i18n.locale), { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(date);
  return (
    <span className={day === today ? "text-brand-indigo" : undefined}>
      {weekday}
      <span className="block font-normal text-slate-400">{short}</span>
    </span>
  );
}

function TimesheetCell({
  initial,
  disabled,
  onCommit,
}: {
  initial: string;
  disabled: boolean;
  onCommit: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function commit(raw: string) {
    if (raw.trim() === initial.trim() || saving) return;
    setValue(raw);
    setSaving(true);
    const ok = await onCommit(raw);
    setSaving(false);
    if (!ok) setValue(initial);
  }

  return (
    <input
      value={value}
      disabled={disabled || saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => void commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit((e.target as HTMLInputElement).value);
        }
        if (e.key === "Escape") setValue(initial);
      }}
      className="w-full rounded-lg border border-slate-200 px-1 py-1.5 text-center text-sm disabled:bg-slate-50 disabled:text-slate-300"
    />
  );
}
