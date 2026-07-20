import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatDate } from "@/lib/utils";
import {
  getPhaseLabel,
  HERMES_APPROACH_LABELS,
} from "@/lib/hermes/phases";
import {
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from "@/types";

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
  const phaseLabel = getPhaseLabel(project.currentPhase, project.approach);

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
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <Badge variant="muted">
              {HERMES_APPROACH_LABELS[project.approach]}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-brand-muted">
            {project.description || "—"}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-indigo" />
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-brand-muted">
        <span>
          Phase : <strong className="text-slate-700">{phaseLabel}</strong>
        </span>
        <span>
          Chef de projet :{" "}
          <strong className="text-slate-700">{project.chefDeProjet}</strong>
        </span>
        {project.endDate && (
          <span>
            Échéance :{" "}
            <strong className="text-slate-700">
              {formatDate(project.endDate)}
            </strong>
          </span>
        )}
      </div>

      <div className="mt-4">
        <ProgressBar value={project.progress} showLabel />
      </div>

      <div className="mt-3 flex justify-between text-xs text-brand-muted">
        <span>
          {project.tasksCompleted} / {project.tasksTotal} tâches
        </span>
        {project.budget && (
          <span>Budget : {project.budget.toLocaleString("fr-CH")} CHF</span>
        )}
      </div>
    </Link>
  );
}
