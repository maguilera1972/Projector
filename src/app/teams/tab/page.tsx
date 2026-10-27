import { getRequestLocale } from "@/lib/i18n/server";
import { DEFAULT_TAB_PATH, isTeamsTabView, viewPath } from "@/lib/teams/tab/sso";
import { TeamsTabClient } from "./teams-tab-client";

interface TeamsTabPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Onglet personnel « Mes tâches » (et cible des liens profonds du flux d'activité). */
export default async function TeamsTabPage({ searchParams }: TeamsTabPageProps) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const view = params.view;
  const fallbackPath = isTeamsTabView(view) ? viewPath(view) : DEFAULT_TAB_PATH;
  return <TeamsTabClient locale={locale} fallbackPath={fallbackPath} />;
}
