"use client";

import { useMemo } from "react";
import {
  buildDependencyLines,
  buildGanttRows,
  buildWeekMarkers,
  computeGanttTimeline,
} from "@/lib/scheduling/gantt";
import { formatDate } from "@/lib/utils";
import type {
  ProjectBaseline,
  ProjectScheduleSummary,
  Task,
} from "@/types";

interface ProjectGanttChartProps {
  tasks: Task[];
  schedule: ProjectScheduleSummary;
  baseline?: ProjectBaseline;
}

const ROW_HEIGHT = 40;

export function ProjectGanttChart({
  tasks,
  schedule,
  baseline,
}: ProjectGanttChartProps) {
  const scheduledTasks = tasks.filter(
    (task) => task.startDate || task.dueDate,
  );

  const timeline = useMemo(
    () =>
      computeGanttTimeline(
        scheduledTasks,
        baseline?.snapshots,
      ),
    [scheduledTasks, baseline],
  );

  const rows = useMemo(() => {
    if (!timeline) return [];
    return buildGanttRows(scheduledTasks, timeline, {
      criticalTaskIds: schedule.criticalTaskIds,
      baseline,
      dependencies: schedule.dependencies,
    });
  }, [scheduledTasks, timeline, schedule, baseline]);

  const weekMarkers = useMemo(
    () => (timeline ? buildWeekMarkers(timeline) : []),
    [timeline],
  );

  const dependencyLines = useMemo(() => {
    if (!timeline) return [];
    return buildDependencyLines(rows, schedule.dependencies);
  }, [rows, schedule.dependencies, timeline]);

  if (scheduledTasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-brand-muted">
        Planifiez des dates de début et d&apos;échéance sur les tâches pour
        afficher le diagramme de Gantt.
      </div>
    );
  }

  if (!timeline) {
    return null;
  }

  const chartHeight = rows.length * ROW_HEIGHT;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-brand-muted">
        <span>
          {formatDate(timeline.startDate)} → {formatDate(timeline.endDate)}
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-6 rounded bg-brand-indigo/80" />
            Plan actuel
          </span>
          {baseline && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-6 rounded border border-dashed border-slate-400 bg-slate-200/60" />
              {baseline.name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-6 rounded bg-amber-400" />
            Chemin critique
          </span>
        </div>
      </div>

      <div className="flex overflow-x-auto">
        <div
          className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-white"
          style={{ width: 260 }}
        >
          <div className="flex h-10 items-center border-b border-slate-100 px-4 text-xs font-semibold uppercase tracking-wide text-brand-muted">
            Tâche
          </div>
          {rows.map((row) => (
            <div
              key={row.task.id}
              className="flex items-center border-b border-slate-50 px-4 text-sm"
              style={{ height: ROW_HEIGHT }}
              title={row.task.title}
            >
              <span className="truncate text-slate-800">{row.task.title}</span>
            </div>
          ))}
        </div>

        <div className="relative min-w-[640px] flex-1">
          <div className="relative h-10 border-b border-slate-100 bg-slate-50">
            {weekMarkers.map((marker) => (
              <span
                key={`${marker.label}-${marker.leftPercent}`}
                className="absolute top-0 flex h-full items-center border-l border-slate-200/80 pl-1 text-[10px] text-brand-muted"
                style={{ left: `${marker.leftPercent}%` }}
              >
                {marker.label}
              </span>
            ))}
          </div>

          <div className="relative" style={{ height: chartHeight }}>
            {weekMarkers.map((marker) => (
              <div
                key={`grid-${marker.leftPercent}`}
                className="pointer-events-none absolute top-0 bottom-0 border-l border-slate-100"
                style={{ left: `${marker.leftPercent}%` }}
              />
            ))}

            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              {dependencyLines.map((line) => {
                const midX = (line.x1Percent + line.x2Percent) / 2;
                return (
                  <path
                    key={line.id}
                    d={`M ${line.x1Percent} ${line.y1Percent} H ${midX} V ${line.y2Percent} H ${line.x2Percent}`}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="0.35"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {rows.map((row, index) => (
              <div
                key={row.task.id}
                className="absolute right-0 left-0 border-b border-slate-50"
                style={{
                  top: index * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                }}
              >
                {row.baselineBar && (
                  <div
                    className="absolute top-[22px] h-2 rounded-sm border border-dashed border-slate-400 bg-slate-200/50"
                    style={{
                      left: `${row.baselineBar.leftPercent}%`,
                      width: `${row.baselineBar.widthPercent}%`,
                    }}
                  />
                )}

                {row.bar ? (
                  <div
                    className={`absolute top-2 h-5 overflow-hidden rounded-md shadow-sm ${
                      row.isCritical ? "bg-amber-400" : "bg-brand-indigo/75"
                    }`}
                    style={{
                      left: `${row.bar.leftPercent}%`,
                      width: `${row.bar.widthPercent}%`,
                    }}
                  >
                    <div
                      className="h-full bg-emerald-500/70"
                      style={{ width: `${row.progress}%` }}
                    />
                  </div>
                ) : null}

                {row.bar && (
                  <span
                    className="absolute top-2.5 text-[10px] font-medium text-white mix-blend-difference"
                    style={{
                      left: `calc(${row.bar.leftPercent}% + 4px)`,
                      maxWidth: `${row.bar.widthPercent}%`,
                    }}
                  >
                    {row.progress}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
