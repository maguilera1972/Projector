"use client";

import { useCallback } from "react";
import { TeamsSsoGate } from "@/app/teams/_components/teams-sso-gate";
import { safeRedirectPath } from "@/lib/teams/tab/sso";
import type { TeamsContext } from "@/lib/teams/tab/sdk";

interface TeamsTabClientProps {
  locale: string;
  fallbackPath: string;
}

/** Le subEntityId d'un lien profond (chemin PROJECTOR) prime sur la vue par défaut de l'onglet. */
export function TeamsTabClient({ locale, fallbackPath }: TeamsTabClientProps) {
  const target = useCallback(
    (context: TeamsContext) => safeRedirectPath(context.page.subPageId) ?? fallbackPath,
    [fallbackPath],
  );
  return <TeamsSsoGate initialLocale={locale} target={target} fallbackPath={fallbackPath} />;
}
