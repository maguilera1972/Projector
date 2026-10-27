"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { useI18n } from "@/lib/i18n/client";
import { toIntlLocale } from "@/lib/i18n/config";
import { tDynamic, type Translator } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/utils";
import {
  ANNEX_CATEGORIES,
  type AnnexCategory,
  type AnnexDocument,
  type HermesPhaseId,
  type PhaseFolderStatus,
  type Project,
  type ProjectFolder,
} from "@/types";

export interface HermesDocumentItem {
  id: string;
  title: string;
  phase: HermesPhaseId;
  version: number;
  generatedAt: string;
  hasDocx: boolean;
}

interface ProjectDocumentsExplorerProps {
  project: Pick<Project, "id" | "approach" | "currentPhase" | "status">;
  folders: ProjectFolder[];
  annexes: AnnexDocument[];
  hermesDocuments: HermesDocumentItem[];
  canWrite: boolean;
  canManage: boolean;
  currentUserId: string;
  maxUploadMb: number;
  acceptExtensions: string[];
  showProjectLink?: boolean;
}

const ALL = "__all__";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo";

function formatSize(bytes: number, locale: string): string {
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

function folderLabel(folder: ProjectFolder, t: Translator): string {
  if (folder.kind === "general") return t("annexes.folderGeneral");
  if (folder.kind === "phase" && folder.phase) return tDynamic(t, `enums.phase.${folder.phase}`);
  return folder.name ?? "—";
}

function latestVersion(document: AnnexDocument) {
  return document.versions.reduce((latest, item) =>
    item.version > latest.version ? item : latest,
  );
}

export function ProjectDocumentsExplorer({
  project,
  folders,
  annexes,
  hermesDocuments,
  canWrite,
  canManage,
  currentUserId,
  maxUploadMb,
  acceptExtensions,
  showProjectLink = false,
}: ProjectDocumentsExplorerProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const intl = toIntlLocale(locale);
  const phases = getPhasesForApproach(project.approach);
  const currentOrder = phases.find((phase) => phase.id === project.currentPhase)?.order ?? 1;
  const currentFolderId =
    folders.find((folder) => folder.kind === "phase" && folder.phase === project.currentPhase)
      ?.id ?? folders[0]?.id ?? ALL;

  const [selected, setSelected] = useState<string>(currentFolderId);
  const [category, setCategory] = useState<AnnexCategory | "">("");
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [newFolderFor, setNewFolderFor] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const versionInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const topFolders = folders.filter((folder) => folder.kind !== "custom");
  const childrenOf = (id: string) => folders.filter((folder) => folder.parentId === id);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  function phaseStatus(phase?: HermesPhaseId): PhaseFolderStatus | null {
    if (!phase) return null;
    const order = phases.find((item) => item.id === phase)?.order;
    if (order === undefined) return null;
    if (project.status === "termine" || order < currentOrder) return "completed";
    return order === currentOrder ? "current" : "upcoming";
  }

  const selectedFolder = selected === ALL ? null : folderById.get(selected) ?? null;
  const visibleAnnexes = annexes.filter(
    (doc) =>
      (selected === ALL || doc.folderId === selected) &&
      (!category || doc.category === category),
  );
  const visibleHermes =
    selected === ALL
      ? hermesDocuments
      : selectedFolder?.kind === "phase"
        ? hermesDocuments.filter((doc) => doc.phase === selectedFolder.phase)
        : [];
  const countIn = (folderId: string) =>
    annexes.filter((doc) => doc.folderId === folderId).length +
    (folderById.get(folderId)?.kind === "phase"
      ? hermesDocuments.filter((doc) => doc.phase === folderById.get(folderId)?.phase).length
      : 0);

  async function call(url: string, init: RequestInit, success?: string): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, init);
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setFeedback({ ok: false, text: data.error ?? t("common.unknownError") });
        return false;
      }
      if (success) setFeedback({ ok: true, text: success });
      router.refresh();
      return true;
    } catch {
      setFeedback({ ok: false, text: t("common.networkError") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const phasesChecked = form.getAll("phase").map(String);
    form.delete("phase");
    form.set("phases", JSON.stringify(phasesChecked));
    const ok = await call(
      `/api/projects/${project.id}/annexes`,
      { method: "POST", body: form },
      t("annexes.uploaded"),
    );
    if (ok) {
      setShowUpload(false);
      formElement.reset();
    }
  }

  async function handleNewVersion(document: AnnexDocument, file: File) {
    const comment = window.prompt(t("annexes.versionComment")) ?? "";
    const form = new FormData();
    form.set("file", file);
    form.set("comment", comment);
    await call(
      `/api/annexes/${document.id}/versions`,
      { method: "POST", body: form },
      t("annexes.versionUploaded"),
    );
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>, document: AnnexDocument) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await call(
      `/api/annexes/${document.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          category: form.get("category"),
          folderId: form.get("folderId"),
          phases: form.getAll("phase").map(String),
        }),
      },
      t("entra.saved"),
    );
    if (ok) setEditingId(null);
  }

  async function handleDelete(document: AnnexDocument) {
    if (!window.confirm(t("annexes.deleteConfirm", { title: document.title }))) return;
    await call(`/api/annexes/${document.id}`, { method: "DELETE" });
  }

  async function createFolder(parentId: string) {
    const ok = await call(`/api/projects/${project.id}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name: newFolderName }),
    });
    if (ok) {
      setNewFolderFor(null);
      setNewFolderName("");
    }
  }

  async function renameFolder(folder: ProjectFolder) {
    const name = window.prompt(t("annexes.renameFolder"), folder.name ?? "");
    if (!name || name === folder.name) return;
    await call(`/api/projects/${project.id}/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function deleteFolder(folder: ProjectFolder) {
    if (!window.confirm(t("annexes.deleteFolderConfirm", { name: folder.name ?? "" }))) return;
    const ok = await call(`/api/projects/${project.id}/folders/${folder.id}`, { method: "DELETE" });
    if (ok && selected === folder.id) setSelected(folder.parentId ?? ALL);
  }

  function statusBadge(status: PhaseFolderStatus | null) {
    if (!status) return null;
    const Icon = status === "completed" ? CheckCircle2 : status === "current" ? CircleDot : Clock;
    const color =
      status === "completed"
        ? "text-emerald-600"
        : status === "current"
          ? "text-brand-indigo"
          : "text-slate-400";
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        {tDynamic(t, `annexes.status_${status}`)}
      </span>
    );
  }

  function phaseCheckboxes(selectedPhases: HermesPhaseId[]) {
    return (
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium text-slate-700">{t("annexes.phases")}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {phases.map((phase) => (
            <label key={phase.id} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                name="phase"
                value={phase.id}
                defaultChecked={selectedPhases.includes(phase.id)}
              />
              {tDynamic(t, `enums.phase.${phase.id}`)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  function folderOptions() {
    return topFolders.flatMap((folder) => [
      <option key={folder.id} value={folder.id}>
        {folderLabel(folder, t)}
      </option>,
      ...childrenOf(folder.id).map((child) => (
        <option key={child.id} value={child.id}>
          {`  └ ${folderLabel(child, t)}`}
        </option>
      )),
    ]);
  }

  function folderButton(folder: ProjectFolder, depth: number) {
    const status = folder.kind === "phase" ? phaseStatus(folder.phase) : null;
    const active = selected === folder.id;
    const Icon = active ? FolderOpen : Folder;
    return (
      <div key={folder.id}>
        <div
          className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${
            active ? "bg-brand-indigo/10" : "hover:bg-slate-50"
          } ${status === "current" ? "ring-1 ring-brand-indigo/30" : ""}`}
          style={{ marginLeft: depth * 16 }}
        >
          <button
            type="button"
            onClick={() => setSelected(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${
                status === "current" ? "text-brand-indigo" : "text-slate-400"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate ${active ? "font-semibold text-slate-900" : "text-slate-700"}`}
              >
                {folderLabel(folder, t)}
              </span>
              {statusBadge(status)}
            </span>
            <span className="text-xs text-slate-400">{countIn(folder.id)}</span>
          </button>
          {canWrite && folder.kind !== "custom" && (
            <button
              type="button"
              onClick={() => {
                setNewFolderFor(folder.id);
                setNewFolderName("");
              }}
              className="rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-slate-700 group-hover:opacity-100"
              title={t("annexes.addSubfolder")}
              aria-label={t("annexes.addSubfolder")}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
          {canWrite && folder.kind === "custom" && (
            <>
              <button
                type="button"
                onClick={() => void renameFolder(folder)}
                className="rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-slate-700 group-hover:opacity-100"
                title={t("annexes.renameFolder")}
                aria-label={t("annexes.renameFolder")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void deleteFolder(folder)}
                className="rounded p-1 text-red-400 opacity-0 hover:bg-white hover:text-red-600 group-hover:opacity-100"
                title={t("annexes.deleteFolder")}
                aria-label={t("annexes.deleteFolder")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {newFolderFor === folder.id && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createFolder(folder.id);
            }}
            className="mt-1 flex gap-1"
            style={{ marginLeft: (depth + 1) * 16 }}
          >
            <input
              autoFocus
              required
              maxLength={80}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("annexes.subfolderName")}
              className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {t("annexes.createSubfolder")}
            </button>
            <button
              type="button"
              onClick={() => setNewFolderFor(null)}
              className="rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label={t("common.cancel")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        )}
        {childrenOf(folder.id).map((child) => folderButton(child, depth + 1))}
      </div>
    );
  }

  const uploadDefaultFolder = selectedFolder?.id ?? currentFolderId;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("annexes.sectionTitle")}</h2>
          <p className="mt-1 text-sm text-brand-muted">{t("annexes.sectionHelp")}</p>
        </div>
        <div className="flex items-center gap-2">
          {!canWrite && <Badge variant="muted">{t("annexes.readOnly")}</Badge>}
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowUpload((value) => !value)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              {t("annexes.upload")}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <p
          className={`mx-6 mt-4 rounded-lg px-3 py-2 text-sm ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {showUpload && canWrite && (
        <form
          onSubmit={(event) => void handleUpload(event)}
          className="mx-6 mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2"
        >
          <h3 className="text-sm font-semibold text-slate-900 sm:col-span-2">
            {t("annexes.uploadTitle")}
          </h3>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">{t("annexes.file")}</span>
            <input
              type="file"
              name="file"
              required
              accept={acceptExtensions.map((ext) => `.${ext}`).join(",")}
              className={`mt-1 ${inputClass} bg-white`}
            />
            <span className="mt-1 block text-xs text-brand-muted">
              {t("annexes.maxSize", { max: maxUploadMb })}
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("annexes.title")}</span>
            <input
              name="title"
              maxLength={200}
              placeholder={t("annexes.titlePlaceholder")}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("annexes.folder")}</span>
            <select
              name="folderId"
              defaultValue={uploadDefaultFolder}
              key={uploadDefaultFolder}
              className={`mt-1 ${inputClass}`}
            >
              {folderOptions()}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("annexes.category")}</span>
            <select name="category" defaultValue="autre" className={`mt-1 ${inputClass}`}>
              {ANNEX_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {tDynamic(t, `annexes.cat_${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("annexes.description")}</span>
            <input name="description" maxLength={2000} className={`mt-1 ${inputClass}`} />
          </label>
          {phaseCheckboxes(
            selectedFolder?.phase ? [selectedFolder.phase] : [],
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? t("annexes.uploading") : t("annexes.submitUpload")}
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-[17rem_1fr]">
        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => setSelected(ALL)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
              selected === ALL ? "bg-brand-indigo/10 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="flex-1">{t("annexes.allDocuments")}</span>
            <span className="text-xs text-slate-400">{annexes.length + hermesDocuments.length}</span>
          </button>
          {topFolders.map((folder) => folderButton(folder, 0))}
        </nav>

        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <FolderOpen className="h-5 w-5 text-brand-indigo" />
              {selectedFolder ? folderLabel(selectedFolder, t) : t("annexes.allDocuments")}
              {selectedFolder?.kind === "phase" && statusBadge(phaseStatus(selectedFolder.phase))}
            </h3>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AnnexCategory | "")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              aria-label={t("annexes.category")}
            >
              <option value="">{t("annexes.allCategories")}</option>
              {ANNEX_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {tDynamic(t, `annexes.cat_${value}`)}
                </option>
              ))}
            </select>
          </div>

          {(selected === ALL || selectedFolder?.kind === "phase") && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("annexes.hermesDeliverables")}
              </h4>
              {visibleHermes.length === 0 ? (
                <p className="text-sm text-brand-muted">{t("annexes.noHermes")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-indigo-100 bg-indigo-50/30">
                  {visibleHermes.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                      <Badge variant="info">{t("annexes.hermesBadge")}</Badge>
                      <Link
                        href={`/documents/${project.id}`}
                        className="min-w-0 flex-1 truncate font-medium text-slate-900 hover:text-brand-indigo"
                      >
                        {doc.title}
                      </Link>
                      <span className="text-xs text-brand-muted">
                        {tDynamic(t, `enums.phase.${doc.phase}`)} · v{doc.version} ·{" "}
                        {formatDate(doc.generatedAt, locale)}
                      </span>
                      {doc.hasDocx && (
                        <a
                          href={`/api/generated-documents/${doc.id}/docx`}
                          className="rounded p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
                          title={t("annexes.download")}
                          aria-label={t("annexes.download")}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("annexes.annexesTitle")}
            </h4>
            {visibleAnnexes.length === 0 ? (
              <p className="text-sm text-brand-muted">{t("annexes.noAnnexes")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {visibleAnnexes.map((doc) => {
                  const latest = latestVersion(doc);
                  const editable = canManage || (canWrite && doc.createdBy === currentUserId);
                  const folder = folderById.get(doc.folderId);
                  return (
                    <li key={doc.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <Badge variant="muted">{t("annexes.annexBadge")}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{doc.title}</p>
                          {doc.description && (
                            <p className="mt-0.5 text-xs text-brand-muted">{doc.description}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brand-muted">
                            <Badge variant="default">{tDynamic(t, `annexes.cat_${doc.category}`)}</Badge>
                            {selected === ALL && folder && (
                              <span className="inline-flex items-center gap-1">
                                <Folder className="h-3 w-3" />
                                {folderLabel(folder, t)}
                              </span>
                            )}
                            <span>
                              {doc.phases.length === 0
                                ? t("annexes.allPhases")
                                : doc.phases.map((p) => tDynamic(t, `enums.phase.${p}`)).join(", ")}
                            </span>
                            <span>
                              v{latest.version} · {formatSize(latest.size, intl)} · {latest.originalName}
                            </span>
                            <span>
                              {t("annexes.uploadedBy", {
                                name: latest.uploadedByName,
                                date: formatDate(latest.uploadedAt, locale),
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={`/api/annexes/${doc.id}/download`}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title={t("annexes.download")}
                            aria-label={t("annexes.download")}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setHistoryId(historyId === doc.id ? null : doc.id)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title={t("annexes.versions")}
                            aria-label={t("annexes.versions")}
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {canWrite && (
                            <>
                              <input
                                type="file"
                                className="hidden"
                                accept={acceptExtensions.map((ext) => `.${ext}`).join(",")}
                                ref={(el) => {
                                  versionInputs.current[doc.id] = el;
                                }}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";
                                  if (file) void handleNewVersion(doc, file);
                                }}
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => versionInputs.current[doc.id]?.click()}
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                                title={t("annexes.newVersion")}
                                aria-label={t("annexes.newVersion")}
                              >
                                <Upload className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {editable && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingId(editingId === doc.id ? null : doc.id)}
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                title={t("common.edit")}
                                aria-label={t("common.edit")}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDelete(doc)}
                                className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                                title={t("common.delete")}
                                aria-label={t("common.delete")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {historyId === doc.id && (
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
                            {historyId === doc.id ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {t("annexes.versions")}
                          </p>
                          <ul className="space-y-1 text-xs text-slate-600">
                            {[...doc.versions].reverse().map((version) => (
                              <li key={version.version} className="flex flex-wrap items-center gap-2">
                                <a
                                  href={`/api/annexes/${doc.id}/download?version=${version.version}`}
                                  className="font-medium text-brand-indigo hover:underline"
                                >
                                  v{version.version} — {version.originalName}
                                </a>
                                <span>{formatSize(version.size, intl)}</span>
                                <span>
                                  {t("annexes.uploadedBy", {
                                    name: version.uploadedByName,
                                    date: formatDate(version.uploadedAt, locale),
                                  })}
                                </span>
                                {version.comment && <span className="italic">« {version.comment} »</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {editingId === doc.id && editable && (
                        <form
                          onSubmit={(event) => void handleEdit(event, doc)}
                          className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2"
                        >
                          <label className="block text-sm">
                            <span className="font-medium text-slate-700">{t("annexes.title")}</span>
                            <input
                              name="title"
                              required
                              maxLength={200}
                              defaultValue={doc.title}
                              className={`mt-1 ${inputClass}`}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="font-medium text-slate-700">{t("annexes.folder")}</span>
                            <select name="folderId" defaultValue={doc.folderId} className={`mt-1 ${inputClass}`}>
                              {folderOptions()}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="font-medium text-slate-700">{t("annexes.category")}</span>
                            <select name="category" defaultValue={doc.category} className={`mt-1 ${inputClass}`}>
                              {ANNEX_CATEGORIES.map((value) => (
                                <option key={value} value={value}>
                                  {tDynamic(t, `annexes.cat_${value}`)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="font-medium text-slate-700">{t("annexes.description")}</span>
                            <input
                              name="description"
                              maxLength={2000}
                              defaultValue={doc.description ?? ""}
                              className={`mt-1 ${inputClass}`}
                            />
                          </label>
                          {phaseCheckboxes(doc.phases)}
                          <div className="flex gap-2 sm:col-span-2">
                            <button
                              type="submit"
                              disabled={busy}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {t("common.save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {showProjectLink && (
            <Link
              href={`/documents/${project.id}`}
              className="inline-block text-sm font-medium text-brand-indigo hover:underline"
            >
              {t("annexes.openProjectDocs")} →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
