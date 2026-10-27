import { getRequestLocale } from "@/lib/i18n/server";
import { TeamsConfigClient } from "./teams-config-client";

/** Page de configuration de l'onglet PROJECTOR (canal d'équipe, conversation, réunion). */
export default async function TeamsConfigPage() {
  const locale = await getRequestLocale();
  return <TeamsConfigClient locale={locale} />;
}
