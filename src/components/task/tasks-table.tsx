"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskAssigneeSelect } from "@/components/task/task-assignee-select";
import { TaskEditDialog } from "@/components/task/task-edit-dialog";
import { TaskScheduleBadge } from "@/components/task/task-schedule-badge";
import { QuickTimeDialog } from "@/components/time/quick-time-dialog";
import { TaskTimeCell } from "@/components/time/task-time-cell";
import { useTimeI18n } from "@/components/time/use-time-i18n";
import type { AssigneeOption } from "@/lib/users";
import type { Project, Task, TaskStatus } from "@/types";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";

const taskStatusVariant: Record<
  TaskStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  a_faire: "muted",
  en_cours: "default",
  termine: "success",
  bloque: "warning",
};

interface TasksTableProps {
  tasks: Task[];
  projects: Project[];
  users: AssigneeOption[];
  canAssignByProjectId: Record<string, boolean>;
  /** Minutes saisies par tâche. */
  timeByTask?: Record<string, number>;
  /** Tâches sur lesquelles l'utilisateur peut saisir du temps. */
  canLogTaskIds?: string[];
}

export function TasksTable({
  tasks,
  projects,
  users,
  canAssignByProjectId,
  timeByTask = {},
  canLogTaskIds = [],
}: TasksTableProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [loggingTask, setLoggingTask] = useState<Task | null>(null);
  const { t } = useI18n();
  const { tt } = useTimeI18n();
  const canLog = new Set(canLogTaskIds);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("tasksPage.task")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("tasksPage.project")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("tasksPage.module")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("tasksPage.phase")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                {t("tasksPage.planning")}
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                {t("tasksPage.progress")}
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700" title={tt("common.columnTitle")}>
                {tt("common.column")}
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("tasksPage.assignee")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("tasksPage.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              const phaseLabel = tDynamic(t, `enums.phase.${task.phase}`);

              return (
                <tr key={task.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <button
                      type="button"
                      onClick={() => setEditingTaskId(task.id)}
                      className="group inline-flex items-center gap-2 hover:text-brand-indigo"
                    >
                      {task.title}
                      <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-brand-muted">
                    {project?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="muted">{task.module}</Badge>
                  </td>
                  <td className="px-6 py-4 text-brand-muted">{phaseLabel}</td>
                  <td className="px-6 py-4">
                    <TaskScheduleBadge
                      startDate={task.startDate}
                      dueDate={task.dueDate}
                      startedAt={task.startedAt}
                      status={task.status}
                      compact
                    />
                  </td>
                  <td className="px-6 py-4 text-brand-muted">
                    {task.progress ?? 0}%
                  </td>
                  <td className="px-6 py-4">
                    <TaskTimeCell
                      minutes={timeByTask[task.id] ?? 0}
                      estimatedHours={task.estimatedHours}
                      onLog={canLog.has(task.id) ? () => setLoggingTask(task) : undefined}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <TaskAssigneeSelect
                      taskId={task.id}
                      assigneeId={task.assigneeId}
                      users={users}
                      canAssign={canAssignByProjectId[task.projectId] ?? false}
                      compact
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={taskStatusVariant[task.status]}>
                      {tDynamic(t, `enums.taskStatus.${task.status}`)}
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
