"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { getTaskTranslator, taskErrorMessage } from "@/lib/tasks/i18n";
import type { AssigneeOption } from "@/lib/users";
import { formatDate } from "@/lib/utils";
import type { HermesApproach, HermesPhaseId, TaskStatus } from "@/types";

export interface CreateTaskProject {
  id: string;
  name: string;
  approach: HermesApproach;
  currentPhase: HermesPhaseId;
  startDate?: string;
  endDate?: string;
}

export interface CreateTaskCandidate {
  id: string;
  title: string;
  projectId: string;
  module?: string;
  moduleId?: string;
}

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projects: CreateTaskProject[];
  defaultProjectId?: string;
  users: AssigneeOption[];
  tasks: CreateTaskCandidate[];
}

interface Draft {
  projectId: string;
  title: string;
  description: string;
  phase: HermesPhaseId | "";
  module: string;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  durationDays: string;
  estimatedHours: string;
  status: TaskStatus;
  predecessorIds: string[];
}

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

function emptyDraft(project?: CreateTaskProject): Draft {
  return {
    projectId: project?.id ?? "",
    title: "",
    description: "",
    phase: project?.currentPhase ?? "",
    module: "",
    assigneeId: "",
    startDate: "",
    dueDate: "",
    durationDays: "",
    estimatedHours: "",
    status: "a_faire",
    predecessorIds: [],
  };
}

/** Création manuelle d'une tâche (hors scénario HERMES) avec sa charge prévue. */
export function CreateTaskDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  users,
  tasks,
}: CreateTaskDialogProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const tk = useMemo(() => getTaskTranslator(locale), [locale]);
  const initialProject = projects.find((project) => project.id === defaultProjectId) ?? projects[0];
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialProject));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; warning?: string } | null>(null);
  const [filter, setFilter] = useState("");

  const project = projects.find((item) => item.id === draft.projectId);
  const phases = project ? getPhasesForApproach(project.approach) : [];
  const projectTasks = tasks.filter((task) => task.projectId === draft.projectId);
  const modules = [...new Set(projectTasks.map((task) => task.module).filter(Boolean))].sort();
  const candidates = projectTasks.filter((task) =>
    task.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const outsidePeriod =
    project &&
    [draft.startDate, draft.dueDate].some(
      (date) =>
        date &&
        ((project.startDate && date < project.startDate.slice(0, 10)) ||
          (project.endDate && date > project.endDate.slice(0, 10))),
    );

  if (!open) return null;

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function selectProject(projectId: string) {
    const next = projects.find((item) => item.id === projectId);
    setDraft({ ...emptyDraft(next), title: draft.title, description: draft.description });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!project) return;
    setError("");
    setNotice(null);
    if (!draft.title.trim()) {
      setError(tk("errors.titleRequired"));
      return;
    }
    if (draft.startDate && draft.dueDate && draft.startDate > draft.dueDate) {
      setError(tk("errors.invalidDates"));
      return;
    }
    setSaving(true);
    try {
      const moduleTask = projectTasks.find((task) => task.module === draft.module.trim() && task.moduleId);
      const response = await fetch(`/api/projects/${project.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          phase: draft.phase || project.currentPhase,
          module: draft.module,
          moduleId: moduleTask?.moduleId,
          assigneeId: draft.assigneeId || null,
          startDate: draft.startDate || null,
          dueDate: draft.dueDate || null,
          durationDays: draft.durationDays ? Number(draft.durationDays) : null,
          estimatedHours: draft.estimatedHours ? draft.estimatedHours : null,
          status: draft.status,
          predecessorIds: draft.predecessorIds,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        warnings?: string[];
      };
      if (!response.ok) {
        setError(taskErrorMessage(tk, data));
        return;
      }
      router.refresh();
      const warning = data.warnings?.includes("outsidePeriod")
        ? tk("outsidePeriod", {
            from: project.startDate ? formatDate(project.startDate.slice(0, 10), locale) : "—",
            to: project.endDate ? formatDate(project.endDate.slice(0, 10), locale) : "—",
          })
        : undefined;
      if (!warning) {
        setDraft(emptyDraft(project));
        onClose();
        return;
      }
      setNotice({ text: tk("created"), warning });
      setDraft(emptyDraft(project));
    } catch {
      setError(tk("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label={tk("close")}
      />
      <form
        onSubmit={(event) => void submit(event)}
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{tk("createTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={tk("close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
          {projects.length === 0 && <p className="text-brand-muted">{tk("noProjects")}</p>}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>
          )}
          {notice && (
            <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              <p>{notice.text}</p>
              {notice.warning && (
                <p className="flex items-start gap-2 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {notice.warning}
                </p>
              )}
            </div>
          )}

          {projects.length > 1 && (
            <label className="block">
              <span className="mb-1 block font-medium">{tk("project")}</span>
              <select value={draft.projectId} onChange={(e) => selectProject(e.target.value)} className={inputClass}>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {project && (project.startDate || project.endDate) && (
            <p className="text-xs text-brand-muted">
              {tk("projectPeriod", {
                from: project.startDate ? formatDate(project.startDate.slice(0, 10), locale) : "—",
                to: project.endDate ? formatDate(project.endDate.slice(0, 10), locale) : "—",
              })}
            </p>
          )}

          <label className="block">
            <span className="mb-1 block font-medium">{tk("title")} *</span>
            <input
              value={draft.title}
              maxLength={300}
              required
              autoFocus
              onChange={(e) => update({ title: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">{tk("description")}</span>
            <textarea
              rows={3}
              value={draft.description}
              maxLength={5000}
              onChange={(e) => update({ description: e.target.value })}
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium">{tk("phase")} *</span>
              <select
                value={draft.phase}
                onChange={(e) => update({ phase: e.target.value as HermesPhaseId })}
                className={inputClass}
              >
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {tDynamic(t, `enums.phase.${phase.id}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("module")}</span>
              <input
                value={draft.module}
                list="create-task-modules"
                maxLength={120}
                onChange={(e) => update({ module: e.target.value })}
                className={inputClass}
                title={tk("moduleHint")}
              />
              <datalist id="create-task-modules">
                {modules.map((module) => (
                  <option key={module} value={module} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("assignee")}</span>
              <select
                value={draft.assigneeId}
                onChange={(e) => update({ assigneeId: e.target.value })}
                className={inputClass}
              >
                <option value="">{tk("unassigned")}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("status")}</span>
              <select
                value={draft.status}
                onChange={(e) => update({ status: e.target.value as TaskStatus })}
                className={inputClass}
              >
                {(["a_faire", "en_cours", "bloque"] as TaskStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {tDynamic(t, `enums.taskStatus.${status}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("startDate")}</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("dueDate")}</span>
              <input
                type="date"
                value={draft.dueDate}
                min={draft.startDate || undefined}
                onChange={(e) => update({ dueDate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("durationDays")}</span>
              <input
                type="number"
                min={1}
                value={draft.durationDays}
                onChange={(e) => update({ durationDays: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{tk("plannedEffort")}</span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={draft.estimatedHours}
                onChange={(e) => update({ estimatedHours: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <p className="text-xs text-brand-muted">{tk("plannedEffortHint")}</p>
          {outsidePeriod && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {tk("outsidePeriod", {
                from: project?.startDate ? formatDate(project.startDate.slice(0, 10), locale) : "—",
                to: project?.endDate ? formatDate(project.endDate.slice(0, 10), locale) : "—",
              })}
            </p>
          )}

          {projectTasks.length > 0 && (
            <div>
              <p className="mb-1 font-medium">{tk("predecessors")}</p>
              <p className="mb-2 text-xs text-brand-muted">{tk("predecessorsHint")}</p>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={tk("searchTasks")}
                className={`${inputClass} mb-2`}
              />
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {candidates.map((task) => (
                  <label key={task.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.predecessorIds.includes(task.id)}
                      onChange={(e) =>
                        update({
                          predecessorIds: e.target.checked
                            ? [...draft.predecessorIds, task.id]
                            : draft.predecessorIds.filter((id) => id !== task.id),
                        })
                      }
                    />
                    {task.title}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
            {tk("cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || !project}
            className="gradient-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? tk("creating") : tk("create")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Bouton « Nouvelle tâche » ouvrant le formulaire de création. */
export function NewTaskButton(props: Omit<CreateTaskDialogProps, "open" | "onClose">) {
  const { locale } = useI18n();
  const tk = useMemo(() => getTaskTranslator(locale), [locale]);
  const [open, setOpen] = useState(false);
  if (props.projects.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="gradient-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" />
        {tk("newTask")}
      </button>
      {open && <CreateTaskDialog {...props} open onClose={() => setOpen(false)} />}
    </>
  );
}
