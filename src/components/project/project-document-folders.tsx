import Link from "next/link";
import { FolderOpen, FileText, ChevronRight, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPhaseLabel, HERMES_APPROACH_LABELS } from "@/lib/hermes/phases";
import { formatDate } from "@/lib/utils";
import type { HermesApproach, HermesPhaseId } from "@/types";

export interface ProjectDocumentFolderSummary {
  projectId: string;
  projectName: string;
  documentCount: number;
  lastGeneratedAt?: string;
  currentPhase: HermesPhaseId;
  approach: HermesApproach;
}

interface ProjectDocumentFoldersProps {
  projects: ProjectDocumentFolderSummary[];
}

export function ProjectDocumentFolders({ projects }: ProjectDocumentFoldersProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <FolderOpen className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm font-medium text-slate-900">
          Aucun document HERMES généré
        </p>
        <p className="mt-1 text-sm text-brand-muted">
          Validez une phase de projet pour créer automatiquement les livrables
          requis. Ils apparaîtront ici regroupés par projet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <div
          key={project.projectId}
          className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-brand-indigo/40 hover:shadow-md"
        >
          <Link
            href={`/documents/${project.projectId}`}
            className="group flex flex-1 items-start gap-4 p-5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-brand-indigo transition-colors group-hover:bg-indigo-100">
              <FolderOpen className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="truncate font-semibold text-slate-900 group-hover:text-brand-indigo">
                  {project.projectName}
                </h2>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-indigo" />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="info">
                  {getPhaseLabel(project.currentPhase, project.approach)}
                </Badge>
                <Badge variant="muted">
                  {HERMES_APPROACH_LABELS[project.approach]}
                </Badge>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-sm text-brand-muted">
                <FileText className="h-4 w-4 shrink-0" />
                <span>
                  {project.documentCount} document
                  {project.documentCount !== 1 ? "s" : ""}
                </span>
                {project.lastGeneratedAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Dernier :{" "}
                      {formatDate(project.lastGeneratedAt.slice(0, 10))}
                    </span>
                  </>
                )}
              </div>
            </div>
          </Link>

          <div className="border-t border-slate-100 px-5 py-3">
            <a
              href={`/api/projects/${project.projectId}/generated-documents/pdf`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-indigo hover:underline"
              title={`Exporter les ${project.documentCount} documents en PDF`}
            >
              <FileDown className="h-3.5 w-3.5" />
              Exporter en PDF
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
