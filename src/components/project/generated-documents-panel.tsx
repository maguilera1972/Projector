"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALE_NATIVE_NAMES } from "@/lib/i18n/config";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Save,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  buildDocumentMarkdown,
  parseDocumentMarkdown,
} from "@/lib/documents/document-editor";
import { resolveWordTemplateFile } from "@/lib/documents/templates";
import { getPhaseLabel } from "@/lib/hermes/phases";
import { formatDate } from "@/lib/utils";
import type { GeneratedDocument, Project } from "@/types";

interface GeneratedDocumentCardProps {
  document: GeneratedDocument;
  project: Project;
  canEdit?: boolean;
}

interface WordPreviewDraft {
  contexte?: string;
  description?: string;
}

function WordDocumentPreview({
  documentId,
  draft,
  refreshKey = 0,
  uploadedOnly = false,
}: {
  documentId: string;
  draft?: WordPreviewDraft;
  refreshKey?: number;
  uploadedOnly?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const hasDraft =
      !uploadedOnly &&
      draft &&
      (draft.contexte !== undefined || draft.description !== undefined);

    const request = hasDraft
      ? fetch(`/api/generated-documents/${documentId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        })
      : fetch(`/api/generated-documents/${documentId}/preview`);

    request
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Aperçu Word indisponible.");
        }
        return response.text();
      })
      .then((html) => {
        if (cancelled || !html) return;
        const frame = globalThis.document.getElementById(
          `word-preview-${documentId}`,
        ) as HTMLIFrameElement | null;
        if (frame?.contentDocument) {
          frame.contentDocument.open();
          frame.contentDocument.write(html);
          frame.contentDocument.close();
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, draft?.contexte, draft?.description, refreshKey, uploadedOnly]);

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {loading && !error && (
        <p className="absolute inset-x-0 top-3 z-10 text-center text-xs text-brand-muted">
          {draft ? "Actualisation de l'aperçu…" : "Chargement de l'aperçu Word…"}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
      <iframe
        id={`word-preview-${documentId}`}
        title="Aperçu du document Word"
        className="h-[min(720px,70vh)] w-full bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

function DocumentWordEditor({
  documentId,
  title,
  onTitleChange,
  fields,
  onFieldsChange,
  uploadedOnly = false,
}: {
  documentId: string;
  title: string;
  onTitleChange: (value: string) => void;
  fields: ReturnType<typeof parseDocumentMarkdown>;
  onFieldsChange: (fields: ReturnType<typeof parseDocumentMarkdown>) => void;
  uploadedOnly?: boolean;
}) {
  const [previewKey, setPreviewKey] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setPreviewKey((value) => value + 1);
    }, 600);
    return () => globalThis.clearTimeout(timer);
  }, [fields.contexte, fields.description, title]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <p className="text-xs text-brand-muted">
          Modifiez les sections injectées dans le gabarit Word HERMES. L&apos;aperçu
          à droite se met à jour automatiquement.
          {uploadedOnly && (
            <>
              {" "}
              Un fichier Word importé est actif : l&apos;aperçu affiche ce fichier
              jusqu&apos;à un nouveau remplacement ou une régénération depuis le
              gabarit.
            </>
          )}
        </p>

        <label className="block">
          <span className="text-xs font-medium text-brand-muted">
            Titre du livrable
          </span>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-brand-muted">
            Contexte
          </span>
          <span className="ml-1 text-[11px] text-brand-muted">
            (section « Contexte » du modèle Word)
          </span>
          <textarea
            value={fields.contexte}
            onChange={(e) =>
              onFieldsChange({ ...fields, contexte: e.target.value })
            }
            rows={6}
            placeholder="Contexte du projet, historique, situation actuelle…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-brand-muted">
            Description
          </span>
          <span className="ml-1 text-[11px] text-brand-muted">
            (section « Description » du modèle Word)
          </span>
          <textarea
            value={fields.description}
            onChange={(e) =>
              onFieldsChange({ ...fields, description: e.target.value })
            }
            rows={6}
            placeholder="Objectif du document, contenu attendu, décisions…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800"
          />
        </label>

        <details
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced(e.currentTarget.open)}
          className="rounded-lg border border-slate-200 bg-slate-50"
        >
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">
            Données projet (lecture seule)
          </summary>
          <pre className="max-h-48 overflow-auto border-t border-slate-200 px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-600">
            {fields.preamble}
          </pre>
        </details>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-brand-muted">
          Aperçu Word en direct
        </p>
        <WordDocumentPreview
          documentId={documentId}
          draft={
            uploadedOnly
              ? undefined
              : {
                  contexte: fields.contexte,
                  description: fields.description,
                }
          }
          refreshKey={previewKey}
          uploadedOnly={uploadedOnly}
        />
      </div>
    </div>
  );
}

export function GeneratedDocumentCard({
  document,
  project,
  canEdit = false,
}: GeneratedDocumentCardProps) {
  const router = useRouter();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const wordTemplateFile = resolveWordTemplateFile(document);
  const isUploaded = document.docxSource === "uploaded";
  const hasWordFile =
    Boolean(wordTemplateFile) || document.hasDocx || isUploaded;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(document.title);
  const [editorFields, setEditorFields] = useState(() =>
    parseDocumentMarkdown(document.contentMarkdown),
  );
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [error, setError] = useState("");

  function startEditing() {
    setTitle(document.title);
    setEditorFields(parseDocumentMarkdown(document.contentMarkdown));
    setError("");
    setEditing(true);
    setExpanded(true);
  }

  function cancelEditing() {
    setTitle(document.title);
    setEditorFields(parseDocumentMarkdown(document.contentMarkdown));
    setError("");
    setEditing(false);
  }

  async function saveDocument() {
    const contentMarkdown = buildDocumentMarkdown(editorFields);
    if (!title.trim() || (!editorFields.contexte.trim() && !editorFields.description.trim())) {
      setError("Le titre et au moins une section (Contexte ou Description) sont requis.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/generated-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          contentMarkdown: contentMarkdown.trim(),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      setEditing(false);
      setPreviewRefreshKey((value) => value + 1);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function replaceWordFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("Seuls les fichiers .docx sont acceptés.");
      return;
    }

    setReplacing(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/generated-documents/${document.id}/docx`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Remplacement impossible.");
        return;
      }

      setExpanded(true);
      setPreviewRefreshKey((value) => value + 1);
      router.refresh();
    } catch {
      setError("Erreur réseau lors de l'import du fichier Word.");
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) {
        replaceInputRef.current.value = "";
      }
    }
  }

  function onReplaceInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void replaceWordFile(file);
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing && !wordTemplateFile ? (
            <label className="block">
              <span className="text-xs font-medium text-brand-muted">Titre</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
          ) : (
            <p className="font-medium text-slate-900">
              {editing ? title : document.title}
            </p>
          )}
          <p className="mt-1 text-xs text-brand-muted">
            Phase {getPhaseLabel(document.phase, project.approach)} · v
            {document.version} · {document.locale.toUpperCase()} ·{" "}
            {formatDate(document.generatedAt.slice(0, 10))}
            {document.updatedAt && (
              <>
                {" "}
                · modifié le {formatDate(document.updatedAt.slice(0, 10))}
                {document.updatedByName ? ` par ${document.updatedByName}` : ""}
              </>
            )}
          </p>
          {document.milestone && !editing && (
            <p className="mt-1 text-xs text-brand-muted">
              Jalon : {document.milestone}
            </p>
          )}
          {wordTemplateFile && !editing && (
            <p className="mt-1 text-xs text-brand-muted">
              Modèle Word HERMES :{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
                {wordTemplateFile}
              </code>
            </p>
          )}
          {document.uploadedFileName && !editing && (
            <p className="mt-1 text-xs text-brand-muted">
              Fichier importé :{" "}
              <span className="font-medium text-slate-800">
                {document.uploadedFileName}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <>
              <Badge variant="muted">{document.outcomeKey}</Badge>
              {isUploaded && (
                <Badge variant="info">Word importé</Badge>
              )}
            </>
          )}

          {editing ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDocument()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelEditing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Annuler
              </button>
            </>
          ) : (
            <>
              {hasWordFile && (
                <a
                  href={`/api/generated-documents/${document.id}/docx`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-indigo px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Word
                </a>
              )}
              <a
                href={`/api/generated-documents/${document.id}/pdf`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Télécharger ce document en PDF"
              >
                <Download className="h-3.5 w-3.5" />
                PDF
              </a>
              {canEdit && (
                <>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={onReplaceInputChange}
                  />
                  <button
                    type="button"
                    disabled={replacing}
                    onClick={() => replaceInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    title="Importer un fichier Word (.docx) pour remplacer la version actuelle"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {replacing ? "Import…" : "Remplacer"}
                  </button>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Modifier
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Masquer
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Aperçu
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {document.signatureText && !editing && (
        <p className="mt-2 text-xs text-brand-muted">
          Signature validation :{" "}
          <span className="font-medium text-slate-800">
            {document.signatureText}
          </span>
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {expanded && (
        <div className="mt-4">
          {editing && wordTemplateFile ? (
            <DocumentWordEditor
              documentId={document.id}
              title={title}
              onTitleChange={setTitle}
              fields={editorFields}
              onFieldsChange={setEditorFields}
              uploadedOnly={isUploaded}
            />
          ) : editing ? (
            <label className="block">
              <span className="text-xs font-medium text-brand-muted">
                Contenu du document
              </span>
              <textarea
                value={buildDocumentMarkdown(editorFields)}
                onChange={(e) =>
                  setEditorFields(parseDocumentMarkdown(e.target.value))
                }
                rows={16}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800"
              />
            </label>
          ) : hasWordFile ? (
            <WordDocumentPreview
              documentId={document.id}
              refreshKey={previewRefreshKey}
              uploadedOnly={isUploaded}
            />
          ) : (
            <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
              {document.contentMarkdown}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

interface GeneratedDocumentsPanelProps {
  project: Project;
  documents: GeneratedDocument[];
  canEdit?: boolean;
}

export function GeneratedDocumentsPanel({
  project,
  documents,
  canEdit = false,
}: GeneratedDocumentsPanelProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FileText className="h-5 w-5 text-brand-indigo" />
            Documents HERMES générés
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Gabarits HERMES 5.1 officiels (Word) depuis{" "}
            <code className="text-xs">reference-data/hermes/word-templates/</code>
            . Langue du projet :{" "}
            <strong>{LOCALE_NATIVE_NAMES[project.documentLocale ?? "fr"]}</strong>
            {canEdit && (
              <>
                {" "}
                · le chef de projet complète les sections Contexte et Description ;
                le fichier Word est régénéré à l&apos;enregistrement.
              </>
            )}
          </p>
        </div>
        <Badge variant="info">{documents.length} document(s)</Badge>
      </div>

      {documents.length > 0 && (
        <div className="mb-4 flex justify-end">
          <a
            href={`/api/projects/${project.id}/generated-documents/pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title={`Exporter les ${documents.length} documents du projet en PDF`}
          >
            <Download className="h-3.5 w-3.5" />
            Exporter le projet en PDF ({documents.length})
          </a>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-brand-muted">
          Aucun document généré pour l&apos;instant. Les résultats HERMES requis
          seront créés automatiquement lors de la prochaine validation de phase.
        </p>
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <GeneratedDocumentCard
              key={document.id}
              document={document}
              project={project}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-brand-muted">
        L&apos;aperçu reprend la mise en page du gabarit HERMES Word (titres,
        tableaux, en-tête). En mode <strong>Modifier</strong>, les champs Contexte
        et Description alimentent directement les sections homologues du modèle.
        Pour une révision complète, ouvrez le .docx dans Word.
      </p>
    </section>
  );
}

interface ProjectGeneratedDocumentsListProps {
  project: Project;
  documents: GeneratedDocument[];
  canEdit?: boolean;
}

export function ProjectGeneratedDocumentsList({
  project,
  documents,
  canEdit = false,
}: ProjectGeneratedDocumentsListProps) {
  if (documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-brand-muted">
        Aucun document HERMES pour ce projet. Validez une phase pour générer
        automatiquement les livrables requis.
      </p>
    );
  }

  return (
    <>
      {canEdit && (
        <p className="mb-4 text-sm text-brand-muted">
          Les livrables sont générés à partir des modèles Word HERMES 5.
          Utilisez <strong>Modifier</strong> pour compléter les sections,{" "}
          <strong>Remplacer</strong> pour importer votre propre fichier .docx,
          ou téléchargez le Word pour éditer dans Microsoft Word.
        </p>
      )}
      <ul className="space-y-3">
        {documents.map((document) => (
          <GeneratedDocumentCard
            key={document.id}
            document={document}
            project={project}
            canEdit={canEdit}
          />
        ))}
      </ul>
    </>
  );
}
