import { getPhasesForApproach } from "@/lib/hermes/phases";
import { checkFeature } from "@/lib/integrations/capabilities";
import type { IntegrationSettings, Project } from "@/types";

/**
 * Synchronisation des dossiers de phase vers la bibliothèque SharePoint de l'équipe (Sites.Selected).
 * Conception : un dossier par phase HERMES dans « Documents partagés » du site de l'équipe ; seuls les
 * livrables validés y sont publiés (PROJECTOR reste la source de vérité). Sites.Selected impose une
 * autorisation explicite par site (`POST /sites/{siteId}/permissions`, rôle write) avant toute écriture.
 */

export interface SharePointSyncPlan {
  ok: boolean;
  message: string;
  folders: string[];
}

export async function planSharePointSync(
  project: Project,
  settings: IntegrationSettings,
): Promise<SharePointSyncPlan> {
  const folders = getPhasesForApproach(project.approach).map((phase) => `${phase.order}. ${phase.id}`);
  const check = await checkFeature("sharepoint", settings);
  if (!check.ok) {
    return { ok: false, message: check.message, folders };
  }
  if (!project.teams) {
    return { ok: false, message: "Aucun espace Teams lié à ce projet.", folders };
  }
  return {
    ok: false,
    message:
      "Permission Sites.Selected présente : accordez l'accès en écriture au site de l'équipe (POST /sites/{id}/permissions), puis activez la synchronisation (prévue en phase 2).",
    folders,
  };
}
