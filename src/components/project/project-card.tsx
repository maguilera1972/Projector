"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { toIntlLocale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import type { Project, ProjectStatus } from "@/types";

const statusVariant: Record<
  ProjectStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  planifie: "info",
  en_cours: "default",
  en_pause: "warning",
  termine: "success",
};

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t, locale } = useI18n();
  const phaseLabel = tDynamic(t, `enums.phase.${project.currentPhase}`);

  return (
    <Link
      href={`/projets/${project.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-brand-indigo/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-slate-900 group-hover:text-brand-indigo">
              {project.name}
            </h3>
            <Badge variant={statusVariant[project.status]}>
              {tDynamic(t, `enums.projectStatus.${project.status}`)}
            </Badge>
            <Badge variant="muted">
              {tDynamic(t, `enums.approach.${project.approach}`)}
            </Badge>
            {project.documentLocale && project.documentLocale !== locale && (
              <Badge variant="muted">{project.documentLocale.toUpperCase()}</Badge>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-brand-muted">
            {project.description || "—"}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-indigo" />
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-brand-muted">
        <span>
          {t("projects.phase")} : <strong className="text-slate-700">{phaseLabel}</strong>
        </span>
        <span>
          {t("projects.chef")} :{" "}
          <strong className="text-slate-700">{project.chefDeProjet}</strong>
        </span>
        {project.endDate && (
          <span>
            {t("projects.due")} :{" "}
            <strong className="text-slate-700">
              {formatDate(project.endDate, locale)}
            </strong>
          </span>
        )}
      </div>

      <div className="mt-4">
        <ProgressBar value={project.progress} showLabel />
      </div>

      <div className="mt-3 flex justify-between text-xs text-brand-muted">
        <span>
          {t("projects.tasksCount", {
            done: project.tasksCompleted,
            total: project.tasksTotal,
          })}
        </span>
        {project.budget && (
          <span>
            {t("projects.budget")} : {project.budget.toLocaleString(toIntlLocale(locale))} CHF
          </span>
        )}
      </div>
    </Link>
  );
}
