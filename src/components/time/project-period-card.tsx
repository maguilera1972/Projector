"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Pencil } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ProjectPeriod } from "@/lib/time-tracking/summary";
import { useTimeI18n } from "./use-time-i18n";

interface ProjectPeriodCardProps {
  projectId: string;
  period: ProjectPeriod;
  canEdit: boolean;
}

/** Période du projet (début / fin prévue), temps écoulé et modification par le chef de projet. */
export function ProjectPeriodCard({ projectId, period, canEdit }: ProjectPeriodCardProps) {
  const router = useRouter();
  const i18n = useTimeI18n();
  const { tt } = i18n;
  const [editing, setEditing] = useState(false);
  const [startDate, setStartDate] = useState(period.startDate);
  const [endDate, setEndDate] = useState(period.endDefined ? period.endDate : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const notStarted = period.elapsedDays === 0;

  async function save() {
    setError("");
    if (!startDate || !endDate) {
      setError(tt("errors.endDateRequired"));
      return;
    }
    if (endDate < startDate) {
      setError(tt("errors.invalidPeriod"));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!response.ok) {
        setError(i18n.errorMessage(data));
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError(tt("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarRange className="h-5 w-5 text-brand-indigo" />
          {tt("period.title")}
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            title={tt("period.edit")}
            aria-label={tt("period.edit")}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("period.start")}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-brand-muted">{tt("period.end")}</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5"
            >
              {tt("common.cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {tt("common.save")}
            </button>
          </div>
        </div>
      ) : (
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">{tt("period.start")}</dt>
            <dd className="font-medium text-slate-900">{i18n.date(period.startDate)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">{tt("period.end")}</dt>
            <dd className={`font-medium ${period.endDefined ? "text-slate-900" : "text-amber-700"}`}>
              {period.endDefined ? i18n.date(period.endDate) : tt("period.toDefine")}
            </dd>
          </div>
          {!period.endDefined && (
            <p className="text-xs text-amber-700">
              {tt("period.derivedHint", { date: i18n.date(period.endDate) })}
            </p>
          )}
          <p className="text-xs text-brand-muted">{tt("period.duration", { days: period.totalDays })}</p>
          <div>
            <ProgressBar value={period.elapsedPercent} />
            <p className="mt-1.5 text-xs text-brand-muted">
              {notStarted
                ? tt("period.notStarted")
                : `${tt("period.elapsed", { pct: period.elapsedPercent })} · ${
                    period.remainingDays >= 0
                      ? tt("period.remaining", { days: period.remainingDays })
                      : tt("period.overdue", { days: -period.remainingDays })
                  }`}
            </p>
          </div>
        </dl>
      )}
    </section>
  );
}
