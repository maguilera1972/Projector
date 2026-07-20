import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ProjectCard } from "@/components/project/project-card";
import { CreateProjectButton } from "@/components/project/create-project-button";
import { EmptyState } from "@/components/ui/empty-state";
import { AssignProjectToPortfolio } from "@/components/portfolio/assign-project-to-portfolio";
import { SharedResourcesPanel } from "@/components/portfolio/shared-resources-panel";
import {
  getPortfolioById,
  getPortfolioStats,
  listProjects,
  listUsers,
} from "@/lib/db/store";
import { toAssigneeOptions } from "@/lib/users";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils";
import { PORTFOLIO_STATUS_LABELS } from "@/types";

interface PortfolioDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PortfolioDetailPage({
  params,
}: PortfolioDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const portfolio = await getPortfolioById(id);

  if (!portfolio) {
    notFound();
  }

  const stats = await getPortfolioStats(id);
  const projects = await listProjects(id);
  const allProjects = await listProjects();
  const canAssign = hasPermission(user, PERMISSIONS.PROJECTS_WRITE);
  const canManagePortfolio = hasPermission(user, PERMISSIONS.PORTFOLIOS_WRITE);
  const availableProjects = allProjects.filter((p) => p.portfolioId !== id);
  const assigneeOptions = toAssigneeOptions(await listUsers());

  return (
    <>
      <Header
        title={portfolio.name}
        subtitle={`Responsable : ${portfolio.owner}`}
        user={user}
      />

      <main className="p-8">
        <Link
          href="/portfolios"
          className="mb-6 inline-flex items-center gap-2 text-sm text-brand-muted hover:text-brand-indigo"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux portfolios
        </Link>

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={portfolio.status === "actif" ? "default" : "muted"}
              >
                {PORTFOLIO_STATUS_LABELS[portfolio.status]}
              </Badge>
            </div>
            {portfolio.description && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-muted">
                {portfolio.description}
              </p>
            )}
            <p className="mt-2 text-xs text-brand-muted">
              Créé le {formatDate(portfolio.createdAt)}
            </p>
          </div>
          {portfolio.status === "actif" && (
            <CreateProjectButton
              user={user}
              defaultPortfolioId={portfolio.id}
            />
          )}
        </div>

        <div className="mb-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="flex items-center gap-2 text-sm text-brand-muted">
              <FolderKanban className="h-4 w-4" />
              Projets
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {stats.projectCount}
            </p>
            <p className="mt-1 text-xs text-brand-muted">
              {stats.activeProjects} actif{stats.activeProjects !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="flex items-center gap-2 text-sm text-brand-muted">
              <TrendingUp className="h-4 w-4" />
              Avancement moyen
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {stats.averageProgress}%
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="flex items-center gap-2 text-sm text-brand-muted">
              <Wallet className="h-4 w-4" />
              Budget total
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {stats.totalBudget > 0
                ? `${stats.totalBudget.toLocaleString("fr-CH")} CHF`
                : "—"}
            </p>
          </div>
        </div>

        {portfolio.status === "actif" && canAssign && (
          <AssignProjectToPortfolio
            portfolioId={portfolio.id}
            availableProjects={availableProjects}
          />
        )}

        {portfolio.status === "actif" && (
          <SharedResourcesPanel
            portfolioId={portfolio.id}
            users={assigneeOptions}
            initialSharedIds={portfolio.sharedResourceIds ?? []}
            canEdit={canManagePortfolio}
          />
        )}

        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Projets du portfolio
          </h2>
          {projects.length === 0 ? (
            <EmptyState
              title="Aucun projet dans ce portfolio"
              description="Ajoutez un projet HERMES 5.1 à ce portfolio pour commencer le pilotage consolidé."
              actionLabel="Créer un projet"
              user={user}
              defaultPortfolioId={portfolio.id}
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
