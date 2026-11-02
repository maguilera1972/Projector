"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskAssigneeSelect } from "@/components/task/task-assignee-select";
import { TaskEditDialog } from "@/components/task/task-edit-dialog";
import { ManualTaskBadge } from "@/components/task/manual-task-badge";
import { TaskScheduleBadge } from "@/components/task/task-schedule-badge";
import { QuickTimeDialog } from "@/components/time/quick-time-dialog";
import { TaskTimeCell } from "@/components/time/task-time-cell";
import { useTimeI18n } from "@/components/time/use-time-i18n";
import { formatVarianceDays } from "@/lib/scheduling/gantt";
import { getPhaseLabel } from "@/lib/hermes/phases";
import { formatDate } from "@/lib/utils";
import type { AssigneeOption } from "@/lib/users";
import type {
  GanttTaskRow,
  HermesApproach,
  ProjectBaseline,
  ProjectScheduleSummary,
  Task,
  TaskStatus,
} from "@/types";
import {
  TASK_STATUS_LABELS,
} from "@/types";
import {
  buildGanttRows,
  computeGanttTimeline,
} from "@/lib/scheduling/gantt";

const taskStatusVariant: Record<
  TaskStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  a_faire: "muted",
  en_cours: "default",
  termine: "success",
  bloque: "warning",
};

interface ProjectTasksTableViewProps {
  tasks: Task[];
  approach: HermesApproach;
  users: AssigneeOption[];
  canAssign: boolean;
  schedule: ProjectScheduleSummary;
  baseline?: ProjectBaseline;
  timeByTask?: Record<string, number>;
  canLogTaskIds?: string[];
}

export function ProjectTasksTableView({
  tasks,
  approach,
  users,
  canAssign,
  schedule,
  baseline,
  timeByTask = {},
  canLogTaskIds = [],
}: ProjectTasksTableViewProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [loggingTask, setLoggingTask] = useState<Task | null>(null);
  const { tt } = useTimeI18n();
  const canLog = new Set(canLogTaskIds);
  const criticalSet = new Set(schedule.criticalTaskIds);

  const timeline = computeGanttTimeline(tasks, baseline?.snapshots);
  const rows: GanttTaskRow[] = timeline
    ? buildGanttRows(tasks, timeline, {
        criticalTaskIds: schedule.criticalTaskIds,
        baseline,
        dependencies: schedule.dependencies,
      })
    : tasks.map((task) => ({
        task,
        progress: task.progress ?? 0,
        isCritical: criticalSet.has(task.id),
      }));

  const rowByTaskId = new Map(rows.map((row) => [row.task.id, row]));

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">Tâche</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Phase</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Module</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Début</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Échéance</th>
              {baseline && (
                <>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Écart début
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Écart fin
                  </th>
                </>
              )}
              <th className="px-4 py-3 font-semibold text-slate-700">
                Avancement
              </th>
              <th className="px-4 py-3 font-semibold text-slate-700" title={tt("common.columnTitle")}>
                {tt("common.column")}
              </th>
              <th className="px-4 py-3 font-semibold text-slate-700">Assigné</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const row = rowByTaskId.get(task.id);
              const phaseLabel = getPhaseLabel(task.phase, approach);

              return (
                <tr key={task.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <button
                      type="button"
                      onClick={() => setEditingTaskId(task.id)}
                      className="group inline-flex items-center gap-2 text-left hover:text-brand-indigo"
                    >
                      {task.title}
                      <ManualTaskBadge source={task.source} />
                      {criticalSet.has(task.id) && (
                        <Badge variant="warning">Critique</Badge>
                      )}
                      <Pencil className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-brand-muted">{phaseLabel}</td>
                  <td className="px-4 py-3">
                    {task.module ? <Badge variant="muted">{task.module}</Badge> : "—"}
                  </td>
                  <td className="px-4 py-3 text-brand-muted">
                    {task.startDate ? formatDate(task.startDate) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <TaskScheduleBadge
                      startDate={task.startDate}
                      dueDate={task.dueDate}
                      startedAt={task.startedAt}
                      status={task.status}
                      compact
                    />
                  </td>
                  {baseline && (
                    <>
                      <td className="px-4 py-3">
                        <VarianceBadge days={row?.startVarianceDays} />
                      </td>
                      <td className="px-4 py-3">
                        <VarianceBadge days={row?.finishVarianceDays} />
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex min-w-[120px] items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="gradient-brand h-full rounded-full"
                          style={{ width: `${task.progress ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-brand-muted">
                        {task.progress ?? 0}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TaskTimeCell
                      minutes={timeByTask[task.id] ?? 0}
                      estimatedHours={task.estimatedHours}
                      onLog={canLog.has(task.id) ? () => setLoggingTask(task) : undefined}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <TaskAssigneeSelect
                      taskId={task.id}
                      assigneeId={task.assigneeId}
                      users={users}
                      canAssign={canAssign}
                      compact
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={taskStatusVariant[task.status]}>
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TaskEditDialog
        taskId={editingTaskId}
        open={editingTaskId !== null}
        onClose={() => setEditingTaskId(null)}
      />

      <QuickTimeDialog
        taskId={loggingTask?.id ?? null}
        taskTitle={loggingTask?.title}
        onClose={() => setLoggingTask(null)}
      />
    </>
  );
}

function VarianceBadge({ days }: { days?: number }) {
  if (days === undefined) {
    return <span className="text-brand-muted">—</span>;
  }

  if (days === 0) {
    return <Badge variant="success">0 j.</Badge>;
  }

  if (days > 0) {
    return <Badge variant="warning">{formatVarianceDays(days)}</Badge>;
  }

  return <Badge variant="info">{formatVarianceDays(days)}</Badge>;
}
