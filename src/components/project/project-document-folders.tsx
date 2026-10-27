"use client";

import Link from "next/link";
import { Paperclip } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";
import { FolderOpen, FileText, ChevronRight, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { HermesApproach, HermesPhaseId } from "@/types";

export interface ProjectDocumentFolderSummary {
  projectId: string;
  projectName: string;
  documentCount: number;
  lastGeneratedAt?: string;
  currentPhase: HermesPhaseId;
  approach: HermesApproach;
  annexCount: number;
}

interface ProjectDocumentFoldersProps {
  projects: ProjectDocumentFolderSummary[];
}

export function ProjectDocumentFolders({ projects }: ProjectDocumentFoldersProps) {
  const { t, locale } = useI18n();
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <FolderOpen className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm font-medium text-slate-900">
          {t("projects.noProjects")}
        </p>
        <p className="mt-1 text-sm text-brand-muted">{t("annexes.sectionHelp")}</p>
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
                  {tDynamic(t, `enums.phase.${project.currentPhase}`)}
                </Badge>
                <Badge variant="muted">
                  {tDynamic(t, `enums.approach.${project.approach}`)}
                </Badge>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-sm text-brand-muted">
                <FileText className="h-4 w-4 shrink-0" />
                <span>
                  {t("annexes.hermesBadge")} : {project.documentCount}
                </span>
                <span aria-hidden="true">·</span>
                <Paperclip className="h-4 w-4 shrink-0" />
                <span>{t("annexes.annexCount", { count: project.annexCount })}</span>
                {project.lastGeneratedAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(project.lastGeneratedAt.slice(0, 10), locale)}</span>
                  </>
                )}
              </div>
            </div>
          </Link>

          {project.documentCount > 0 && (
          <div className="border-t border-slate-100 px-5 py-3">
            <a
              href={`/api/projects/${project.projectId}/generated-documents/pdf`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-indigo hover:underline"
              title={`Exporter les ${project.documentCount} documents en PDF`}
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </a>
          </div>
          )}
        </div>
      ))}
    </div>
  );
}
