"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskAssigneeSelect } from "@/components/task/task-assignee-select";
import { TaskEditDialog } from "@/components/task/task-edit-dialog";
import { TaskScheduleBadge } from "@/components/task/task-schedule-badge";
import { formatDate } from "@/lib/utils";
import { groupTasksByPhaseAndModule } from "@/lib/hermes/project-tasks";
import type { AssigneeOption } from "@/lib/users";
import {
  TASK_STATUS_LABELS,
  type HermesApproach,
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

interface ProjectTasksPanelProps {
  tasks: Task[];
  approach: HermesApproach;
  users: AssigneeOption[];
  canAssign: boolean;
  criticalTaskIds?: string[];
}

export function ProjectTasksPanel({
  tasks,
  approach,
  users,
  canAssign,
  criticalTaskIds = [],
}: ProjectTasksPanelProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const phaseGroups = groupTasksByPhaseAndModule(tasks, approach);
  const criticalSet = new Set(criticalTaskIds);

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Tâches HERMES ({tasks.length})
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Instanciées depuis le scénario selon l&apos;approche{" "}
            {approach === "agile" ? "agile" : "classique"}.
            {canAssign && users.length > 0 && (
              <> Assignez chaque tâche à une partie prenante.</>
            )}
            {!canAssign && users.length > 0 && (
              <>
                {" "}
                Seul le chef de projet du projet ou du portfolio peut assigner
                les tâches. Cliquez sur une tâche pour la modifier si vous y
                êtes assigné.
              </>
            )}
          </p>
        </div>

        {tasks.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-brand-muted">
            Aucune tâche pour ce projet. Les projets créés avant l&apos;étape 3
            n&apos;ont pas de tâches instanciées.
          </p>
        ) : users.length === 0 ? (
          <p className="border-b border-slate-100 bg-amber-50 px-6 py-3 text-sm text-amber-700">
            Aucun utilisateur actif disponible pour l&apos;assignation. Créez ou
            validez des comptes dans l&apos;administration.
          </p>
        ) : null}

        {tasks.length > 0 && (
          <div className="divide-y divide-slate-100">
            {phaseGroups.map((phase) => (
              <div key={phase.phaseId}>
                <div className="bg-slate-50 px-6 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {phase.phaseLabel}
                  </h3>
                </div>
                {phase.modules.map((moduleGroup) => (
                  <div key={`${phase.phaseId}-${moduleGroup.module}`}>
                    <p className="px-6 pt-4 text-xs font-medium uppercase tracking-wide text-brand-muted">
                      {moduleGroup.module}
                    </p>
                    <ul className="divide-y divide-slate-50">
                      {moduleGroup.tasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
                        >
                          <button
                            type="button"
                            onClick={() => setEditingTaskId(task.id)}
                            className="group flex min-w-0 flex-1 flex-col gap-1 text-left"
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-sm text-slate-900 group-hover:text-brand-indigo">
                                {task.title}
                              </span>
                              {criticalSet.has(task.id) && (
                                <Badge variant="warning">Critique</Badge>
                              )}
                              <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                            </span>
                            <TaskScheduleBadge
                              startDate={task.startDate}
                              dueDate={task.dueDate}
                              startedAt={task.startedAt}
                              status={task.status}
                              compact
                            />
                          </button>
                          <div className="flex shrink-0 flex-wrap items-center gap-3">
                            <span className="text-xs text-brand-muted">
                              {task.progress ?? 0}%
                            </span>
                            <TaskAssigneeSelect
                              taskId={task.id}
                              assigneeId={task.assigneeId}
                              users={users}
                              canAssign={canAssign}
                            />
                            {task.dueDate && (
                              <span className="text-xs text-brand-muted">
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                            <Badge variant={taskStatusVariant[task.status]}>
                              {TASK_STATUS_LABELS[task.status]}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <TaskEditDialog
        taskId={editingTaskId}
        open={editingTaskId !== null}
        onClose={() => setEditingTaskId(null)}
      />
    </>
  );
}
