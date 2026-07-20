import { FolderKanban, Briefcase } from "lucide-react";
import { CreateProjectButton } from "@/components/project/create-project-button";
import { CreatePortfolioButton } from "@/components/portfolio/create-portfolio-button";
import type { SessionUser } from "@/lib/auth/permissions";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  user?: SessionUser | null;
  entity?: "project" | "portfolio";
  defaultPortfolioId?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  user,
  entity = "project",
  defaultPortfolioId,
}: EmptyStateProps) {
  const Icon = entity === "portfolio" ? Briefcase : FolderKanban;

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-7 w-7 text-brand-muted" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-brand-muted">
        {description}
      </p>
      {actionLabel && user && entity === "portfolio" && (
        <CreatePortfolioButton
          user={user}
          variant="empty"
          label={actionLabel}
        />
      )}
      {actionLabel && user && entity === "project" && (
        <CreateProjectButton
          user={user}
          variant="empty"
          label={actionLabel}
          defaultPortfolioId={defaultPortfolioId}
        />
      )}
    </div>
  );
}
