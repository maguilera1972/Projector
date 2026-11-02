"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, History, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { parseDuration } from "@/lib/time-tracking/duration";
import { latestAllowedDate } from "@/lib/time-tracking/rules";
import { todayIso } from "@/lib/reports/format";
import type { DailyWarning, TaskTimeContext, TimeEntryView } from "@/lib/time-tracking/service";
import { ESTIMATE_REVISION_REASONS, type EstimateRevisionReason } from "@/types";
import { useTimeI18n, type TimeI18n } from "./use-time-i18n";

interface TaskTimeSectionProps {
  taskId: string;
  /** Appelé après chaque modification (rafraîchissement des tableaux). */
  onChanged?: () => void;
  /** Affiche le formulaire de saisie en premier (action rapide). */
  quick?: boolean;
}

interface EntryDraft {
  date: string;
  duration: string;
  comment: string;
  userId: string;
}

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

function emptyDraft(userId: string): EntryDraft {
  return { date: todayIso(), duration: "", comment: "", userId };
}

export function TaskTimeSection({ taskId, onChanged, quick = false }: TaskTimeSectionProps) {
  const i18n = useTimeI18n();
  const { tt } = i18n;
  const [context, setContext] = useState<TaskTimeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<(DailyWarning & { person: string }) | null>(null);
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft(""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EntryDraft>(emptyDraft(""));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/time-entries`);
      const data = (await response.json()) as TaskTimeContext & { code?: string; error?: string };
      if (!response.ok) {
        setError(i18n.errorMessage(data));
        setContext(null);
        return;
      }
      setContext(data);
      setDraft((current) => ({ ...current, userId: current.userId || data.currentUserId }));
    } catch {
      setError(tt("errors.network"));
    } finally {
      setLoading(false);
    }
  }, [taskId, i18n, tt]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) setError(i18n.errorMessage(data as { code?: string; error?: string }));
      return { ok: response.ok, data };
    } catch {
      setError(tt("errors.network"));
      return { ok: false, data: {} };
    } finally {
      setBusy(false);
    }
  }

  function withPerson(raw: unknown, entry?: TimeEntryView) {
    const daily = raw as DailyWarning | null | undefined;
    return daily ? { ...daily, person: entry?.userName ?? tt("common.unknown") } : null;
  }

  async function addEntry() {
    if (!context) return;
    if (parseDuration(draft.duration) === null) {
      setError(tt("errors.invalidDuration"));
      return;
    }
    const { ok, data } = await send(`/api/tasks/${taskId}/time-entries`, "POST", {
      date: draft.date,
      duration: draft.duration,
      comment: draft.comment,
      userId: draft.userId || context.currentUserId,
    });
    if (!ok) return;
    const next = data.context as TaskTimeContext;
    setWarning(withPerson(data.warning, next.entries.find((entry) => entry.id === (data.entry as { id: string }).id)));
    setContext(next);
    setDraft({ ...emptyDraft(draft.userId), date: draft.date });
    onChanged?.();
  }

  function startEdit(entry: TimeEntryView) {
    setEditingId(entry.id);
    setEditDraft({
      date: entry.date,
      duration: i18n.duration(entry.durationMinutes),
      comment: entry.comment ?? "",
      userId: entry.userId,
    });
  }

  async function saveEdit(entry: TimeEntryView) {
    if (parseDuration(editDraft.duration) === null) {
      setError(tt("errors.invalidDuration"));
      return;
    }
    const { ok, data } = await send(`/api/time-entries/${entry.id}`, "PATCH", {
      date: editDraft.date,
      duration: editDraft.duration,
      comment: editDraft.comment,
      ...(context?.permissions.canManage ? { userId: editDraft.userId } : {}),
    });
    if (!ok) return;
    setWarning(withPerson(data.warning, entry));
    setEditingId(null);
    await load();
    onChanged?.();
  }

  async function removeEntry(entry: TimeEntryView) {
    if (!window.confirm(tt("common.confirmDelete"))) return;
    const { ok } = await send(`/api/time-entries/${entry.id}`, "DELETE");
    if (!ok) return;
    await load();
    onChanged?.();
  }

  async function saveEstimate(hours: number | null, reason: EstimateRevisionReason, reasonText: string) {
    const { ok, data } = await send(`/api/tasks/${taskId}/estimate`, "PUT", { hours, reason, reasonText });
    if (!ok) return false;
    setContext(data.context as TaskTimeContext);
    onChanged?.();
    return true;
  }

  if (loading && !context) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-brand-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tt("common.loading")}
      </div>
    );
  }

  if (!context) {
    return error ? (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    ) : null;
  }

  const { permissions } = context;
  const maxDate = latestAllowedDate();

  const entryForm = permissions.canLogOwn && (
    <div className="rounded-xl border border-dashed border-slate-300 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
        <Clock className="h-4 w-4 text-brand-indigo" />
        {tt("common.logTime")}
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        {permissions.canManage && context.members.length > 0 && (
          <label className="sm:col-span-4">
            <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("common.forPerson")}</span>
            <select
              value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
              className={inputClass}
            >
              {context.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("common.date")}</span>
          <input
            type="date"
            value={draft.date}
            max={maxDate}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("common.duration")}</span>
          <input
            value={draft.duration}
            onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addEntry();
              }
            }}
            placeholder={tt("common.durationPlaceholder")}
            autoFocus={quick}
            className={inputClass}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("common.comment")}</span>
          <input
            value={draft.comment}
            maxLength={500}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            placeholder={tt("common.commentPlaceholder")}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-muted">{tt("common.durationHelp")}</p>
        <button
          type="button"
          disabled={busy || !draft.duration.trim()}
          onClick={() => void addEntry()}
          className="gradient-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {tt("common.add")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {warning && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {tt("common.dailyWarning", {
            total: i18n.duration(warning.totalMinutes),
            date: i18n.date(warning.date),
            person: warning.person,
          })}
        </p>
      )}

      {quick && entryForm}

      <EffortSummary context={context} i18n={i18n} busy={busy} onSave={saveEstimate} />

      {!quick && entryForm}

      {!permissions.canLogOwn && (
        <p className="text-xs text-brand-muted">{tt("common.readOnly")}</p>
      )}

      {context.entries.length === 0 ? (
        <p className="text-sm text-brand-muted">{tt("common.noEntries")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">{tt("common.date")}</th>
                <th className="px-3 py-2 font-semibold">{tt("common.person")}</th>
                <th className="px-3 py-2 text-right font-semibold">{tt("common.duration")}</th>
                <th className="px-3 py-2 font-semibold">{tt("common.comment")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {context.entries.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id} className="bg-indigo-50/40">
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        value={editDraft.date}
                        max={maxDate}
                        onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      {permissions.canManage && context.members.length > 0 ? (
                        <select
                          value={editDraft.userId}
                          onChange={(e) => setEditDraft({ ...editDraft, userId: e.target.value })}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          {!context.members.some((member) => member.id === editDraft.userId) && (
                            <option value={editDraft.userId}>{entry.userName}</option>
                          )}
                          {context.members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        entry.userName
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={editDraft.duration}
                        onChange={(e) => setEditDraft({ ...editDraft, duration: e.target.value })}
                        className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={editDraft.comment}
                        maxLength={500}
                        onChange={(e) => setEditDraft({ ...editDraft, comment: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(entry)}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {tt("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="ml-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                      >
                        {tt("common.cancel")}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{i18n.date(entry.date)}</td>
                    <td className="px-3 py-2 text-slate-700">{entry.userName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">
                      {i18n.duration(entry.durationMinutes)}
                    </td>
                    <td className="px-3 py-2 text-brand-muted">
                      {entry.comment}
                      {entry.updatedAt !== entry.createdAt && (
                        <span className="ml-1 text-[11px] italic text-slate-400">
                          ({tt("common.edited", { name: entry.updatedByName })})
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {entry.canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                            aria-label={tt("common.edit")}
                            title={tt("common.edit")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeEntry(entry)}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                            aria-label={tt("common.delete")}
                            title={tt("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm">
              <tr>
                <td className="px-3 py-2 font-semibold" colSpan={2}>
                  {tt("common.total")}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{i18n.duration(context.totalMinutes)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-brand-muted">{tt("common.correctionsAlways")}</p>

      {context.history.length > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 text-xs">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
            <History className="h-3.5 w-3.5" />
            {tt("common.history")} ({context.history.length})
          </summary>
          <ul className="mt-2 space-y-1 text-brand-muted">
            {context.history.map((item) => {
              const describe = (value?: { date: string; durationMinutes: number }) =>
                value ? `${i18n.date(value.date)} · ${i18n.duration(value.durationMinutes)}` : "—";
              const values = {
                actor: item.actorName,
                person: item.userName ?? "—",
                duration: item.after ? i18n.duration(item.after.durationMinutes) : "—",
                date: item.after ? i18n.date(item.after.date) : "—",
                before: describe(item.before),
                after: describe(item.after),
              };
              const text =
                item.action === "created"
                  ? tt("common.historyCreated", values)
                  : item.action === "updated"
                    ? tt("common.historyUpdated", values)
                    : tt("common.historyDeleted", values);
              return (
                <li key={item.id} className="rounded bg-slate-50 px-2 py-1">
                  <span className="text-slate-400">{i18n.dateTime(item.createdAt)}</span> —{" "}
                  {text}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function EffortSummary({
  context,
  i18n,
  busy,
  onSave,
}: {
  context: TaskTimeContext;
  i18n: TimeI18n;
  busy: boolean;
  onSave: (hours: number | null, reason: EstimateRevisionReason, reasonText: string) => Promise<boolean>;
}) {
  const { tt } = i18n;
  const [hours, setHours] = useState(context.estimatedHours !== null ? String(context.estimatedHours) : "");
  const [reason, setReason] = useState<EstimateRevisionReason>("unforeseen");
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    setHours(context.estimatedHours !== null ? String(context.estimatedHours) : "");
  }, [context.estimatedHours]);

  const spentHours = context.totalMinutes / 60;
  const estimate = context.estimatedHours;
  const percent = estimate ? Math.round((spentHours / estimate) * 100) : 0;
  const over = estimate !== null && spentHours > estimate;
  const parsed = hours.trim() === "" ? null : Number(hours.replace(",", "."));
  const changed = parsed !== estimate && !(parsed !== null && !Number.isFinite(parsed));
  const isFirst = estimate === null && context.initialEstimatedHours === null;

  async function save() {
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    if (await onSave(parsed, reason, reasonText)) setReasonText("");
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-900">
          {estimate
            ? tt("common.spentOfEstimate", {
                spent: i18n.duration(context.totalMinutes),
                estimate: i18n.hours(estimate),
              })
            : tt("common.spentNoEstimate", { spent: i18n.duration(context.totalMinutes) })}
        </span>
        {estimate !== null && !over && (
          <span className="text-xs text-brand-muted">
            {tt("common.remaining", { value: i18n.hours(Math.max(0, estimate - spentHours)) })}
          </span>
        )}
      </div>
      {estimate !== null && (
        <div className="mt-2">
          <ProgressBar value={Math.min(100, percent)} />
        </div>
      )}
      {over && estimate !== null && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {tt("common.overEstimate", { value: i18n.hours(Math.round((spentHours - estimate) * 100) / 100) })}
        </p>
      )}
      {context.initialEstimatedHours !== null && context.initialEstimatedHours !== estimate && (
        <p className="mt-1 text-xs text-brand-muted">
          {tt("effort.initial")}
          {i18n.colon}
          {i18n.hours(context.initialEstimatedHours)} · {tt("effort.current")}
          {i18n.colon}
          {estimate !== null ? i18n.hours(estimate) : tt("effort.notSet")}
        </p>
      )}

      {context.permissions.canEditEstimate ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("common.estimateHours")}</span>
            <input
              type="number"
              min={0}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className={inputClass}
            />
          </label>
          {!isFirst && changed && (
            <>
              <label>
                <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("effort.reason")}</span>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as EstimateRevisionReason)}
                  className={inputClass}
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
                  className={inputClass}
                />
              </label>
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
            <p className="text-xs text-brand-muted">
              {isFirst ? tt("effort.firstValue") : tt("effort.help")}
            </p>
            <button
              type="button"
              disabled={busy || !changed}
              onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {tt("common.saveEstimate")}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-brand-muted">{tt("effort.managerOnly")}</p>
      )}

      {context.estimateRevisions.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium text-slate-700">
            {tt("effort.history")} ({context.estimateRevisions.length})
          </summary>
          <ul className="mt-2 space-y-1 text-brand-muted">
            {context.estimateRevisions.map((revision) => (
              <li key={revision.id} className="rounded bg-slate-50 px-2 py-1">
                <span className="text-slate-400">{i18n.date(revision.changedAt.slice(0, 10))}</span> —{" "}
                {tt("effort.change", {
                  name: revision.changedByName,
                  before: revision.previousHours !== null ? i18n.hours(revision.previousHours) : tt("effort.notSet"),
                  after: revision.newHours !== null ? i18n.hours(revision.newHours) : tt("effort.notSet"),
                })}{" "}
                · <span className="font-medium">{tt(`reasons.${revision.reason}`)}</span>
                {revision.reasonText && <> — {revision.reasonText}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
