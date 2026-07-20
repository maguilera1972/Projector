"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TaskEditDialog } from "@/components/task/task-edit-dialog";
import { formatDate } from "@/lib/utils";
import type { UserOverdueItem } from "@/lib/data/dashboard";
import { TASK_STATUS_LABELS } from "@/types";

interface OverdueTasksPanelProps {
  items: UserOverdueItem[];
}

export function OverdueTasksPanel({ items }: OverdueTasksPanelProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Mes tâches en retard
        </h2>
        <p className="mt-2 text-sm text-brand-muted">
          Aucune tâche ou activité assignée en retard. Bon travail !
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm">
        <div className="flex items-center gap-2 border-b border-amber-200/80 px-6 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-900">
            Mes tâches en retard ({items.length})
          </h2>
        </div>
        <ul className="divide-y divide-amber-100">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() => setEditingTaskId(item.taskId)}
                className="flex w-full flex-col gap-2 px-6 py-4 text-left transition-colors hover:bg-amber-100/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {item.title}
                    </p>
                    {item.kind === "activity" && item.parentTaskTitle && (
                      <p className="mt-0.5 text-xs text-brand-muted">
                        Activité · {item.parentTaskTitle}
                      </p>
                    )}
                  </div>
                  <Badge variant="warning">
                    {item.daysOverdue} j. de retard
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-muted">
                  <Link
                    href={`/projets/${item.projectId}`}
                    onClick={(event) => event.stopPropagation()}
                    className="font-medium text-brand-indigo hover:underline"
                  >
                    {item.projectName}
                  </Link>
                  <span>Échéance {formatDate(item.dueDate)}</span>
                  <span>{TASK_STATUS_LABELS[item.status]}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <TaskEditDialog
        taskId={editingTaskId}
        open={editingTaskId !== null}
        onClose={() => setEditingTaskId(null)}
      />
    </>
  );
}
