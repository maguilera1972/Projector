import { FileDown } from "lucide-react";

interface PdfExportBarProps {
  projectId?: string;
  projectName?: string;
  documentCount: number;
  showGlobalExport?: boolean;
  globalDocumentCount?: number;
}

export function PdfExportBar({
  projectId,
  projectName,
  documentCount,
  showGlobalExport = false,
  globalDocumentCount = 0,
}: PdfExportBarProps) {
  if (documentCount === 0 && !showGlobalExport) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
        <FileDown className="h-4 w-4 text-brand-indigo" />
        Export PDF
      </div>

      {projectId && documentCount > 0 && (
        <a
          href={`/api/projects/${projectId}/generated-documents/pdf`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          title={
            projectName
              ? `Télécharger les ${documentCount} documents de ${projectName}`
              : undefined
          }
        >
          <FileDown className="h-3.5 w-3.5" />
          Projet ({documentCount})
        </a>
      )}

      {showGlobalExport && globalDocumentCount > 0 && (
        <a
          href="/api/documents/export/pdf"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title={`Télécharger les ${globalDocumentCount} documents de tous les projets`}
        >
          <FileDown className="h-3.5 w-3.5" />
          Tous les projets ({globalDocumentCount})
        </a>
      )}

      <p className="w-full text-xs text-brand-muted sm:w-auto sm:flex-1">
        {projectId
          ? "Un PDF unique avec page de garde, sommaire et l’ensemble des livrables du projet."
          : "Export consolidé de tous les documents HERMES, regroupés par projet."}
      </p>
    </div>
  );
}

interface DocumentsIndexExportProps {
  projectCount: number;
  documentCount: number;
}

export function DocumentsIndexExport({
  projectCount,
  documentCount,
}: DocumentsIndexExportProps) {
  if (documentCount === 0) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-medium text-slate-900">Export global</p>
        <p className="mt-0.5 text-xs text-brand-muted">
          {documentCount} document{documentCount !== 1 ? "s" : ""} dans{" "}
          {projectCount} projet{projectCount !== 1 ? "s" : ""}
        </p>
      </div>
      <a
        href="/api/documents/export/pdf"
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <FileDown className="h-4 w-4" />
        Exporter tout en PDF
      </a>
    </div>
  );
}
