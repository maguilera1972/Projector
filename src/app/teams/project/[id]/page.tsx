import { getRequestLocale } from "@/lib/i18n/server";
import { isHermesPhaseId } from "@/lib/teams/tab/phases";
import { TeamsProjectClient } from "./teams-project-client";

interface TeamsProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Onglet configurable (canal, conversation, réunion) : projet, ou dossier d'une phase HERMES. */
export default async function TeamsProjectPage({ params, searchParams }: TeamsProjectPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const locale = await getRequestLocale();
  const projectId = encodeURIComponent(id);
  const phase = isHermesPhaseId(query.phase) ? query.phase : undefined;
  const path = phase ? `/documents/${projectId}?folder=${phase}` : `/projets/${projectId}`;
  return <TeamsProjectClient locale={locale} path={path} />;
}
