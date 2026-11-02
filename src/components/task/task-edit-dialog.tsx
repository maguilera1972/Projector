"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TaskScheduleBadge } from "@/components/task/task-schedule-badge";
import { TaskTimeSection } from "@/components/time/task-time-section";
import { useTimeI18n } from "@/components/time/use-time-i18n";
import { ManualTaskBadge } from "@/components/task/manual-task-badge";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { getTaskTranslator, taskErrorMessage } from "@/lib/tasks/i18n";
import type { TaskDetailContext } from "@/lib/tasks/access";
import { toDateInputValue } from "@/lib/tasks/dates";
import { formatDate } from "@/lib/utils";
import {
  TASK_STATUS_LABELS,
  type Activity,
  type HermesPhaseId,
  type Task,
  type TaskStatus,
} from "@/types";

interface TaskEditDialogProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusOptions: TaskStatus[] = [
  "a_faire",
  "en_cours",
  "termine",
  "bloque",
];

export function TaskEditDialog({ taskId, open, onClose }: TaskEditDialogProps) {
  const router = useRouter();
  const { tt } = useTimeI18n();
  const { t, locale } = useI18n();
  const tk = getTaskTranslator(locale);
  const [definition, setDefinition] = useState({ title: "", description: "", phase: "", module: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState<TaskDetailContext | null>(null);
  const [taskComments, setTaskComments] = useState("");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("a_faire");
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskDurationDays, setTaskDurationDays] = useState(1);
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityAssigneeId, setNewActivityAssigneeId] = useState("");
  const [newActivityStartDate, setNewActivityStartDate] = useState("");
  const [newActivityDueDate, setNewActivityDueDate] = useState("");
  const [activityDrafts, setActivityDrafts] = useState<
    Record<string, Partial<Activity>>
  >({});

  const loadTask = useCallback(async () => {
    if (!taskId) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      const data = (await response.json()) as TaskDetailContext & {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Impossible de charger la tâche.");
        setContext(null);
        return;
      }

      setContext(data);
      setDefinition({
        title: data.task.title,
        description: data.task.description ?? "",
        phase: data.task.phase,
        module: data.task.module ?? "",
      });
      setTaskComments(data.task.comments ?? "");
      setTaskStatus(data.task.status);
      setTaskProgress(data.task.progress ?? 0);
      setTaskStartDate(toDateInputValue(data.task.startDate));
      setTaskDueDate(toDateInputValue(data.task.dueDate));
      setTaskDurationDays(data.task.durationDays ?? 1);
      setActivityDrafts({});
    } catch {
      setError("Erreur réseau.");
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (open && taskId) {
      void loadTask();
    }
  }, [open, taskId, loadTask]);

  if (!open) return null;

  function updateContext(task: Task, activities: Activity[]) {
    setContext((current) =>
      current ? { ...current, task, activities } : current,
    );
    setTaskStatus(task.status);
    setTaskProgress(task.progress ?? 0);
  }

  function canEditActivityMeta(): boolean {
    if (!context) return false;
    return (
      context.permissions.canManage ||
      context.task.assigneeId === context.currentUserId
    );
  }

  function canEditActivityWork(activity: Activity): boolean {
    if (!context) return false;
    if (context.permissions.canManage) return true;
    if (context.task.assigneeId === context.currentUserId) return true;
    return activity.assigneeId === context.currentUserId;
  }

  function canEditTaskComments(): boolean {
    if (!context) return false;
    return (
      context.permissions.canManage ||
      context.task.assigneeId === context.currentUserId
    );
  }

  async function saveTaskFields() {
    if (!taskId || !context) return;

    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = {};
    if (context.permissions.canEditTaskFields) {
      payload.status = taskStatus;
      payload.progress = taskProgress;
    }
    if (canEditTaskComments()) {
      payload.comments = taskComments;
    }
    if (context.permissions.canEditSchedule) {
      payload.startDate = taskStartDate || null;
      payload.dueDate = taskDueDate || null;
      payload.durationDays = taskDurationDays > 0 ? taskDurationDays : 1;
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
        activities?: Activity[];
      };

      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      if (data.task) {
        updateContext(data.task, data.activities ?? context.activities);
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDefinition() {
    if (!taskId || !context) return;
    setSaving(true);
    setError("");
    const isManual = context.task.source === "manual";
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: definition.title,
          description: definition.description,
          ...(isManual ? { phase: definition.phase, module: definition.module } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        task?: Task;
        activities?: Activity[];
      };
      if (!response.ok) {
        setError(taskErrorMessage(tk, data));
        return;
      }
      if (data.task) updateContext(data.task, data.activities ?? context.activities);
      router.refresh();
    } catch {
      setError(tk("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  async function duplicateCurrentTask() {
    if (!taskId || !context) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", title: `${context.task.title}${tk("copySuffix")}` }),
      });
      const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!response.ok) {
        setError(taskErrorMessage(tk, data));
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(tk("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentTask() {
    if (!taskId || !window.confirm(tk("confirmDelete"))) return;
    setSaving(true);
    setError("");
    try {
      let response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      let data = (await response.json().catch(() => ({}))) as { code?: string; error?: string; count?: number };
      if (response.status === 409 && data.code === "timeEntriesExist") {
        if (!window.confirm(tk("confirmDeleteWithTime", { count: data.count ?? 0 }))) return;
        response = await fetch(`/api/tasks/${taskId}?confirm=1`, { method: "DELETE" });
        data = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
      }
      if (!response.ok) {
        setError(taskErrorMessage(tk, data));
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(tk("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  async function startTaskExecution() {
    if (!taskId) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
        activities?: Activity[];
      };

      if (!response.ok) {
        setError(data.error ?? "Démarrage impossible.");
        return;
      }

      if (data.task) {
        updateContext(data.task, data.activities ?? context?.activities ?? []);
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function startActivityExecution(activityId: string) {
    if (!taskId) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/activities/${activityId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        },
      );

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
        activities?: Activity[];
      };

      if (!response.ok) {
        setError(data.error ?? "Démarrage impossible.");
        return;
      }

      if (data.task && data.activities) {
        updateContext(data.task, data.activities);
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function addActivity() {
    if (!taskId || !newActivityTitle.trim()) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newActivityTitle.trim(),
          assigneeId: newActivityAssigneeId || undefined,
          startDate: newActivityStartDate || undefined,
          dueDate: newActivityDueDate || undefined,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
        activities?: Activity[];
      };

      if (!response.ok) {
        setError(data.error ?? "Création impossible.");
        return;
      }

      if (data.task && data.activities) {
        updateContext(data.task, data.activities);
      }

      setNewActivityTitle("");
      setNewActivityAssigneeId("");
      setNewActivityStartDate("");
      setNewActivityDueDate("");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function saveActivity(activity: Activity) {
    if (!taskId) return;

    const draft = activityDrafts[activity.id] ?? {};
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/activities/${activity.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title,
            assigneeId:
              draft.assigneeId === "" ? null : draft.assigneeId,
            progress: draft.progress,
            status: draft.status,
            comments: draft.comments,
            startDate:
              draft.startDate === "" ? null : draft.startDate,
            dueDate: draft.dueDate === "" ? null : draft.dueDate,
          }),
        },
      );

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
        activities?: Activity[];
      };

      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      if (data.task && data.activities) {
        updateContext(data.task, data.activities);
        setActivityDrafts((current) => {
          const next = { ...current };
          delete next[activity.id];
          return next;
        });
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function removeActivity(activityId: string) {
    if (!taskId) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/activities/${activityId}`,
        { method: "DELETE" },
      );

      const data = (await response.json()) as {
        error?: string;
        task?: Task;
        activities?: Activity[];
      };

      if (!response.ok) {
        setError(data.error ?? "Suppression impossible.");
        return;
      }

      if (data.task && data.activities) {
        updateContext(data.task, data.activities);
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  function getActivityValue<K extends keyof Activity>(
    activity: Activity,
    key: K,
  ): Activity[K] {
    const draft = activityDrafts[activity.id];
    if (draft && key in draft && draft[key] !== undefined) {
      return draft[key] as Activity[K];
    }
    return activity[key];
  }

  function setActivityDraft(activityId: string, patch: Partial<Activity>) {
    setActivityDrafts((current) => ({
      ...current,
      [activityId]: { ...current[activityId], ...patch },
    }));
  }

  const hasActivities = (context?.activities.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fermer"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
              {context?.task.title ?? "Tâche"}
              <ManualTaskBadge source={context?.task.source} />
            </h2>
            {context && (
              <p className="mt-1 text-sm text-brand-muted">
                {context.task.module}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12 text-brand-muted">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Chargement...
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {context && !loading && (
            <div className="space-y-6">
              {(context.permissions.canDuplicateTask || context.permissions.canDeleteTask) && (
                <div className="flex flex-wrap justify-end gap-2">
                  {context.permissions.canDuplicateTask && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void duplicateCurrentTask()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {tk("duplicate")}
                    </button>
                  )}
                  {context.permissions.canDeleteTask && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void deleteCurrentTask()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {tk("delete")}
                    </button>
                  )}
                </div>
              )}

              {context.permissions.canEditDefinition ? (
                <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">{tk("definition")}</h3>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-brand-muted">{tk("title")}</span>
                    <input
                      value={definition.title}
                      maxLength={300}
                      onChange={(e) => setDefinition({ ...definition, title: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-brand-muted">{tk("description")}</span>
                    <textarea
                      rows={2}
                      maxLength={5000}
                      value={definition.description}
                      onChange={(e) => setDefinition({ ...definition, description: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  {context.task.source === "manual" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-brand-muted">{tk("phase")}</span>
                        <select
                          value={definition.phase}
                          onChange={(e) => setDefinition({ ...definition, phase: e.target.value as HermesPhaseId })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {getPhasesForApproach(context.project.approach).map((phase) => (
                            <option key={phase.id} value={phase.id}>
                              {tDynamic(t, `enums.phase.${phase.id}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-brand-muted">{tk("module")}</span>
                        <input
                          value={definition.module}
                          maxLength={120}
                          onChange={(e) => setDefinition({ ...definition, module: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-xs text-brand-muted">{tk("phaseLocked")}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={saving || !definition.title.trim()}
                      onClick={() => void saveDefinition()}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {tk("saveDefinition")}
                    </button>
                  </div>
                </section>
              ) : (
                context.task.description && (
                  <p className="whitespace-pre-line rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                    {context.task.description}
                  </p>
                )
              )}
              <section className="rounded-xl border border-slate-200 p-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{TASK_STATUS_LABELS[context.task.status]}</Badge>
                  <span className="text-sm text-brand-muted">
                    Avancement : {context.task.progress ?? 0}%
                  </span>
                </div>
                <ProgressBar value={context.task.progress ?? 0} showLabel />

                <TaskScheduleBadge
                  startDate={context.task.startDate}
                  dueDate={context.task.dueDate}
                  startedAt={context.task.startedAt}
                  status={context.task.status}
                />

                {context.task.startedAt && (
                  <p className="mt-2 text-xs text-emerald-700">
                    Exécution démarrée le{" "}
                    {formatDate(context.task.startedAt.slice(0, 10))}
                  </p>
                )}

                {context.permissions.canEditSchedule && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        Date de début prévue
                      </label>
                      <input
                        type="date"
                        value={taskStartDate}
                        onChange={(e) => setTaskStartDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        Date limite (échéance)
                      </label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        Durée (j. ouvrés)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={taskDurationDays}
                        onChange={(e) =>
                          setTaskDurationDays(Number(e.target.value))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <p className="sm:col-span-3 text-xs text-brand-muted">
                      Modifier les dates recalcule automatiquement les tâches
                      dépendantes (successeurs).
                    </p>
                  </div>
                )}

                {context.permissions.canStartTask && (
                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void startTaskExecution()}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" />
                      Démarrer la tâche
                    </button>
                  </div>
                )}

                {hasActivities && (
                  <p className="mt-3 text-xs text-brand-muted">
                    L&apos;avancement et le statut de la tâche sont calculés
                    automatiquement à partir des activités.
                  </p>
                )}

                {!hasActivities && context.permissions.canEditTaskFields && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        Statut
                      </label>
                      <select
                        value={taskStatus}
                        onChange={(e) =>
                          setTaskStatus(e.target.value as TaskStatus)
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {TASK_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        Avancement ({taskProgress}%)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={taskProgress}
                        onChange={(e) =>
                          setTaskProgress(Number(e.target.value))
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

                {canEditTaskComments() ? (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium">
                      Commentaires / informations
                    </label>
                    <textarea
                      rows={3}
                      value={taskComments}
                      onChange={(e) => setTaskComments(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Notes, remarques, informations utiles..."
                    />
                  </div>
                ) : (
                  context.task.comments && (
                    <div className="mt-4">
                      <p className="mb-1 text-sm font-medium">Commentaires</p>
                      <p className="text-sm text-brand-muted">
                        {context.task.comments}
                      </p>
                    </div>
                  )
                )}

                {(context.permissions.canEditTaskFields ||
                  canEditTaskComments() ||
                  context.permissions.canEditSchedule) && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveTaskFields()}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Enregistrer la tâche
                    </button>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  {tt("common.title")}
                </h3>
                <TaskTimeSection
                  taskId={context.task.id}
                  onChanged={() => router.refresh()}
                />
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">
                  Activités ({context.activities.length})
                </h3>
                <p className="mt-1 text-xs text-brand-muted">
                  Décomposez la tâche en activités. Chaque personne assignée
                  peut mettre à jour l&apos;avancement, le statut et les
                  commentaires de son activité.
                </p>

                <ul className="mt-4 space-y-4">
                  {context.activities.map((activity) => {
                    const editableMeta = canEditActivityMeta();
                    const editableWork = canEditActivityWork(activity);
                    const canStartActivity =
                      !activity.startedAt &&
                      activity.status !== "termine" &&
                      (context.permissions.canManage ||
                        context.task.assigneeId === context.currentUserId ||
                        activity.assigneeId === context.currentUserId);

                    return (
                      <li
                        key={activity.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          {editableMeta ? (
                            <input
                              value={String(getActivityValue(activity, "title"))}
                              onChange={(e) =>
                                setActivityDraft(activity.id, {
                                  title: e.target.value,
                                })
                              }
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                            />
                          ) : (
                            <p className="flex-1 text-sm font-medium text-slate-900">
                              {activity.title}
                            </p>
                          )}
                          {context.permissions.canDeleteActivities && (
                            <button
                              type="button"
                              onClick={() => void removeActivity(activity.id)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              aria-label="Supprimer l'activité"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <TaskScheduleBadge
                          startDate={activity.startDate}
                          dueDate={activity.dueDate}
                          startedAt={activity.startedAt}
                          status={activity.status}
                        />

                        {editableMeta && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-brand-muted">
                                Début prévu
                              </label>
                              <input
                                type="date"
                                value={toDateInputValue(
                                  String(
                                    getActivityValue(activity, "startDate") ??
                                      "",
                                  ),
                                )}
                                onChange={(e) =>
                                  setActivityDraft(activity.id, {
                                    startDate: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-brand-muted">
                                Échéance
                              </label>
                              <input
                                type="date"
                                value={toDateInputValue(
                                  String(
                                    getActivityValue(activity, "dueDate") ?? "",
                                  ),
                                )}
                                onChange={(e) =>
                                  setActivityDraft(activity.id, {
                                    dueDate: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {canStartActivity && (
                          <div className="mt-3">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void startActivityExecution(activity.id)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Démarrer l&apos;activité
                            </button>
                          </div>
                        )}

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {editableMeta ? (
                            <div>
                              <label className="mb-1 block text-xs font-medium text-brand-muted">
                                Assigné
                              </label>
                              <select
                                value={
                                  String(
                                    getActivityValue(activity, "assigneeId") ??
                                      "",
                                  )
                                }
                                onChange={(e) =>
                                  setActivityDraft(activity.id, {
                                    assigneeId: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                              >
                                <option value="">— Non assigné —</option>
                                {context.users.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <p className="text-xs text-brand-muted">
                              Assigné :{" "}
                              {context.users.find(
                                (user) => user.id === activity.assigneeId,
                              )?.name ?? "—"}
                            </p>
                          )}

                          {editableWork && (
                            <>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-brand-muted">
                                  Statut
                                </label>
                                <select
                                  value={String(
                                    getActivityValue(activity, "status"),
                                  )}
                                  onChange={(e) =>
                                    setActivityDraft(activity.id, {
                                      status: e.target.value as TaskStatus,
                                    })
                                  }
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                >
                                  {statusOptions.map((status) => (
                                    <option key={status} value={status}>
                                      {TASK_STATUS_LABELS[status]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-brand-muted">
                                  Avancement (
                                  {Number(
                                    getActivityValue(activity, "progress"),
                                  )}
                                  %)
                                </label>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={Number(
                                    getActivityValue(activity, "progress"),
                                  )}
                                  onChange={(e) =>
                                    setActivityDraft(activity.id, {
                                      progress: Number(e.target.value),
                                    })
                                  }
                                  className="w-full"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {editableWork && (
                          <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium text-brand-muted">
                              Commentaires
                            </label>
                            <textarea
                              rows={2}
                              value={String(
                                getActivityValue(activity, "comments") ?? "",
                              )}
                              onChange={(e) =>
                                setActivityDraft(activity.id, {
                                  comments: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              placeholder="Informations, blocages, remarques..."
                            />
                          </div>
                        )}

                        {!editableWork && activity.comments && (
                          <p className="mt-3 text-sm text-brand-muted">
                            {activity.comments}
                          </p>
                        )}

                        {editableWork && (
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void saveActivity(activity)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                            >
                              Enregistrer l&apos;activité
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {context.permissions.canAddActivities && (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
                    <p className="text-sm font-medium text-slate-900">
                      Nouvelle activité
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        value={newActivityTitle}
                        onChange={(e) => setNewActivityTitle(e.target.value)}
                        placeholder="Titre de l'activité"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
                      />
                      <select
                        value={newActivityAssigneeId}
                        onChange={(e) =>
                          setNewActivityAssigneeId(e.target.value)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">— Assigné (optionnel) —</option>
                        {context.users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={newActivityStartDate}
                        onChange={(e) =>
                          setNewActivityStartDate(e.target.value)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Début prévu"
                        aria-label="Date de début prévue"
                      />
                      <input
                        type="date"
                        value={newActivityDueDate}
                        onChange={(e) => setNewActivityDueDate(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        aria-label="Date limite"
                      />
                      <button
                        type="button"
                        disabled={saving || !newActivityTitle.trim()}
                        onClick={() => void addActivity()}
                        className="gradient-brand inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
