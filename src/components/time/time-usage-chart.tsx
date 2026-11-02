"use client";

import { toIntlLocale, type Locale } from "@/lib/i18n/config";
import { niceAxisMax } from "@/lib/reports/format";
import type { TimeSeriesPoint } from "@/lib/time-tracking/summary";
import { useTimeI18n } from "./use-time-i18n";

interface TimeUsageChartProps {
  series: TimeSeriesPoint[];
  todayIndex?: number;
  budgetHours?: number;
  plannedHours: number;
}

const W = 760;
const H = 260;
const PAD = { left: 48, right: 16, top: 16, bottom: 34 };

const COLORS = {
  planned: "#818cf8",
  initial: "#94a3b8",
  actual: "#10b981",
  budget: "#ef4444",
  today: "#f59e0b",
};

/** Courbe en S (burn-up) : prévu cumulé, prévu initial cumulé, réalisé cumulé, budget heures. */
export function TimeUsageChart({ series, todayIndex, budgetHours, plannedHours }: TimeUsageChartProps) {
  const i18n = useTimeI18n();
  const { tt } = i18n;
  if (series.length === 0) return null;

  const maxValue = Math.max(
    1,
    budgetHours ?? 0,
    plannedHours,
    ...series.map((point) => Math.max(point.plannedCumHours, point.initialCumHours, point.actualCumHours ?? 0)),
  );
  const yMax = niceAxisMax(maxValue * 1.05);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / yMax) * innerH;

  const path = (values: (number | null)[]) =>
    values
      .map((value, index) => (value === null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`))
      .filter(Boolean)
      .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
      .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => yMax * ratio);
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const showInitial = series.some((point) => Math.abs(point.initialCumHours - point.plannedCumHours) > 0.01);

  const legend = [
    { color: COLORS.planned, label: tt("analysis.seriesPlanned"), dashed: true },
    ...(showInitial ? [{ color: COLORS.initial, label: tt("analysis.seriesInitial"), dashed: true }] : []),
    { color: COLORS.actual, label: tt("analysis.seriesActual"), dashed: false },
    ...(budgetHours ? [{ color: COLORS.budget, label: tt("analysis.seriesBudget"), dashed: true }] : []),
    ...(todayIndex !== undefined ? [{ color: COLORS.today, label: tt("analysis.today"), dashed: false }] : []),
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="22"
                y2="4"
                stroke={item.color}
                strokeWidth="2.5"
                strokeDasharray={item.dashed ? "4 3" : undefined}
              />
            </svg>
            {item.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tt("analysis.chartTitle")}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="#64748b">
              {Number(tick.toFixed(1))} h
            </text>
          </g>
        ))}
        {series.map((point, index) =>
          index % labelEvery === 0 || index === series.length - 1 ? (
            <text
              key={point.start}
              x={x(index)}
              y={H - PAD.bottom + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
            >
              {shortDate(point.start, i18n.locale)}
            </text>
          ) : null,
        )}
        {budgetHours !== undefined && budgetHours > 0 && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(budgetHours)}
            y2={y(budgetHours)}
            stroke={COLORS.budget}
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
        )}
        {todayIndex !== undefined && (
          <line
            x1={x(todayIndex)}
            x2={x(todayIndex)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke={COLORS.today}
            strokeWidth="1.5"
          />
        )}
        {showInitial && (
          <path
            d={path(series.map((point) => point.initialCumHours))}
            fill="none"
            stroke={COLORS.initial}
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}
        <path
          d={path(series.map((point) => point.plannedCumHours))}
          fill="none"
          stroke={COLORS.planned}
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />
        <path
          d={path(series.map((point) => point.actualCumHours))}
          fill="none"
          stroke={COLORS.actual}
          strokeWidth="2.5"
        />
        {series.map((point, index) =>
          point.actualCumHours !== null ? (
            <circle key={point.start} cx={x(index)} cy={y(point.actualCumHours)} r="2.2" fill={COLORS.actual}>
              <title>
                {`${shortDate(point.start, i18n.locale)} — ${tt("analysis.seriesActual")}: ${i18n.hours(point.actualCumHours)} · ${tt("analysis.seriesPlanned")}: ${i18n.hours(point.plannedCumHours)}`}
              </title>
            </circle>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function shortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), { day: "2-digit", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}
