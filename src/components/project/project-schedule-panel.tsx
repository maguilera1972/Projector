"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEPENDENCY_TYPE_LABELS } from "@/lib/scheduling/engine";
import { formatDate } from "@/lib/utils";
import type {
  DependencyType,
  ProjectScheduleSummary,
  Task,
  TaskDependency,
} from "@/types";

interface ProjectSchedulePanelProps {
  projectId: string;
  tasks: Task[];
  schedule: ProjectScheduleSummary;
  canEdit: boolean;
}

const dependencyTypes: DependencyType[] = ["FS", "SS", "FF", "SF"];

export function ProjectSchedulePanel({
  projectId,
  tasks,
  schedule,
  canEdit,
}: ProjectSchedulePanelProps) {
  const router = useRouter();
  const [predecessorId, setPredecessorId] = useState("");
  const [successorId, setSuccessorId] = useState("");
  const [depType, setDepType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const criticalSet = new Set(schedule.criticalTaskIds);

  async function addDependency() {
    if (!predecessorId || !successorId) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          predecessorId,
          successorId,
          type: depType,
          lagDays,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Création impossible.");
        return;
      }

      setPredecessorId("");
      setSuccessorId("");
      setLagDays(0);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDependency(id: string) {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/task-dependencies/${id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Suppression impossible.");
        return;
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  function renderDependencyLabel(dep: TaskDependency): string {
    const pred = taskById.get(dep.predecessorId);
    const succ = taskById.get(dep.successorId);
    const lag =
      dep.lagDays > 0 ? ` (+${dep.lagDays} j. ouvrés)` : "";
    return `${pred?.title ?? "?" } → ${succ?.title ?? "?"} (${DEPENDENCY_TYPE_LABELS[dep.type]}${lag})`;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <GitBranch className="h-5 w-5 text-brand-indigo" />
            Planification
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Dépendances entre tâches, recalcul automatique des dates et chemin
            critique (jours ouvrés lun–ven).
          </p>
        </div>
        {schedule.projectEnd && (
          <Badge variant="info">
            Fin planifiée : {formatDate(schedule.projectEnd)}
          </Badge>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {schedule.dependencies.length > 0 ? (
        <ul className="mb-6 space-y-2">
          {schedule.dependencies.map((dep) => (
            <li
              key={dep.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-2 text-sm"
            >
              <span className="text-slate-800">{renderDependencyLabel(dep)}</span>
              {canEdit && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeDependency(dep.id)}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                  aria-label="Supprimer la dépendance"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-brand-muted">
          Aucune dépendance définie. Ajoutez des liens entre tâches pour activer
          le recalcul automatique.
        </p>
      )}

      {canEdit && tasks.length >= 2 && (
        <div className="mb-6 rounded-xl border border-dashed border-slate-300 p-4">
          <p className="text-sm font-medium text-slate-900">
            Nouvelle dépendance
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <select
              value={predecessorId}
              onChange={(e) => setPredecessorId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Tâche prédécesseur —</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
            <select
              value={successorId}
              onChange={(e) => setSuccessorId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Tâche successeur —</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
            <select
              value={depType}
              onChange={(e) => setDepType(e.target.value as DependencyType)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {dependencyTypes.map((type) => (
                <option key={type} value={type}>
                  {DEPENDENCY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-sm text-brand-muted">Décalage (j.)</label>
              <input
                type="number"
                min={0}
                value={lagDays}
                onChange={(e) => setLagDays(Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={saving || !predecessorId || !successorId}
                onClick={() => void addDependency()}
                className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Ajouter"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {schedule.criticalTaskIds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Chemin critique ({schedule.criticalTaskIds.length} tâches)
          </h3>
          <p className="mt-1 text-xs text-brand-muted">
            Tâches sans marge : tout retard les impacte directement la date de
            fin du projet.
          </p>
          <ul className="mt-3 space-y-2">
            {schedule.criticalTaskIds.map((taskId) => {
              const task = taskById.get(taskId);
              const node = schedule.nodes.find((n) => n.taskId === taskId);
              if (!task) return null;

              return (
                <li
                  key={taskId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm"
                >
                  <span className="font-medium text-amber-950">{task.title}</span>
                  <span className="text-xs text-amber-800">
                    {node?.earlyStart && node?.earlyFinish
                      ? `${formatDate(node.earlyStart)} → ${formatDate(node.earlyFinish)}`
                      : "—"}
                    {node?.slackDays !== undefined && (
                      <> · marge {node.slackDays} j.</>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tasks.some((task) => criticalSet.has(task.id)) === false &&
        schedule.dependencies.length > 0 && (
          <p className="mt-4 text-xs text-brand-muted">
            Planifiez des dates de début sur les tâches racines pour affiner le
            chemin critique.
          </p>
        )}
    </section>
  );
}
