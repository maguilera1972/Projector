"use client";

import { Clock } from "lucide-react";
import { useTimeI18n } from "./use-time-i18n";

interface TaskTimeCellProps {
  minutes: number;
  estimatedHours?: number;
  onLog?: () => void;
}

/** Colonne « Temps » : temps passé / charge prévue + action rapide de saisie. */
export function TaskTimeCell({ minutes, estimatedHours, onLog }: TaskTimeCellProps) {
  const i18n = useTimeI18n();
  const over = estimatedHours !== undefined && minutes / 60 > estimatedHours;
  const percent = estimatedHours ? Math.min(100, Math.round((minutes / 60 / estimatedHours) * 100)) : 0;

  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className={`whitespace-nowrap text-xs ${over ? "font-semibold text-amber-700" : "text-slate-700"}`}>
          {minutes > 0 ? i18n.duration(minutes) : "0h"}
          {estimatedHours !== undefined && (
            <span className="text-brand-muted"> / {i18n.hours(estimatedHours)}</span>
          )}
        </p>
        {estimatedHours !== undefined && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className={over ? "h-full bg-amber-500" : "gradient-brand h-full"}
              style={{ width: `${over ? 100 : percent}%` }}
            />
          </div>
        )}
      </div>
      {onLog && (
        <button
          type="button"
          onClick={onLog}
          className="rounded-lg border border-slate-200 p-1.5 text-brand-indigo hover:bg-indigo-50"
          title={i18n.tt("common.logTime")}
          aria-label={i18n.tt("common.logTime")}
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
