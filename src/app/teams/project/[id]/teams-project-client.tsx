"use client";

import { useCallback } from "react";
import { TeamsSsoGate } from "@/app/teams/_components/teams-sso-gate";

interface TeamsProjectClientProps {
  locale: string;
  path: string;
}

export function TeamsProjectClient({ locale, path }: TeamsProjectClientProps) {
  const target = useCallback(() => path, [path]);
  return <TeamsSsoGate initialLocale={locale} target={target} fallbackPath={path} />;
}
