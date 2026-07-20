import Link from "next/link";
import { Briefcase, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getPortfolioStats } from "@/lib/db/store";
import { formatDate } from "@/lib/utils";
import { PORTFOLIO_STATUS_LABELS, type Portfolio } from "@/types";

interface PortfolioCardProps {
  portfolio: Portfolio;
}

export async function PortfolioCard({ portfolio }: PortfolioCardProps) {
  const stats = await getPortfolioStats(portfolio.id);

  return (
    <Link
      href={`/portfolios/${portfolio.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-brand-indigo/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="gradient-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900 group-hover:text-brand-indigo">
                {portfolio.name}
              </h3>
              <Badge
                variant={portfolio.status === "actif" ? "default" : "muted"}
              >
                {PORTFOLIO_STATUS_LABELS[portfolio.status]}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-brand-muted">
              {portfolio.description || "Aucune description"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-center">
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-brand-muted">
            <FolderKanban className="h-3.5 w-3.5" />
            Projets
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {stats.projectCount}
          </p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-brand-muted">
            <TrendingUp className="h-3.5 w-3.5" />
            Avancement
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {stats.averageProgress}%
          </p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-brand-muted">
            <Wallet className="h-3.5 w-3.5" />
            Budget
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {stats.totalBudget > 0
              ? `${(stats.totalBudget / 1000).toFixed(0)}k`
              : "—"}
          </p>
        </div>
      </div>

      {stats.projectCount > 0 && (
        <div className="mt-4">
          <ProgressBar value={stats.averageProgress} />
        </div>
      )}

      <div className="mt-4 flex justify-between text-xs text-brand-muted">
        <span>Responsable : {portfolio.owner}</span>
        <span>Créé le {formatDate(portfolio.createdAt)}</span>
      </div>
    </Link>
  );
}
