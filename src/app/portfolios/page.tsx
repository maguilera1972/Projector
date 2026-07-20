import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { PortfolioCard } from "@/components/portfolio/portfolio-card";
import { CreatePortfolioButton } from "@/components/portfolio/create-portfolio-button";
import { EmptyState } from "@/components/ui/empty-state";
import { listPortfolios } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";

export default async function PortfoliosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const portfolios = await listPortfolios();

  return (
    <>
      <Header
        title="Portfolios"
        subtitle="Regroupez et pilotez vos projets HERMES 5.1"
        user={user}
      />

      <main className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-brand-muted">
            {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""}{" "}
            actif{portfolios.length !== 1 ? "s" : ""}
          </p>
          <CreatePortfolioButton user={user} />
        </div>

        {portfolios.length === 0 ? (
          <EmptyState
            title="Aucun portfolio"
            description="Créez un portfolio pour regrouper vos projets et obtenir une vue consolidée de leur avancement, budget et charge."
            actionLabel="Créer un portfolio"
            user={user}
            entity="portfolio"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {portfolios.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
