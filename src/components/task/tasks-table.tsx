"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskAssigneeSelect } from "@/components/task/task-assignee-select";
import { TaskEditDialog } from "@/components/task/task-edit-dialog";
import { TaskScheduleBadge } from "@/components/task/task-schedule-badge";
import { getPhaseLabel } from "@/lib/hermes/phases";
import type { AssigneeOption } from "@/lib/users";
import {
  TASK_STATUS_LABELS,
  type Project,
  type Task,
  type TaskStatus,
} from "@/types";

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
}

export function TasksTable({
  tasks,
  projects,
  users,
  canAssignByProjectId,
}: TasksTableProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700">Tâche</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Projet</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Module</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Phase</th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Planification
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Avancement
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">Assigné</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              const phaseLabel = project
                ? getPhaseLabel(task.phase, project.approach)
                : task.phase;

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
    </>
  );
}
