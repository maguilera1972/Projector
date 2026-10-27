import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@/lib/integrations/config";
import { runIntegrationJobs } from "@/lib/integrations/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Déclencheur des tâches planifiées (timer systemd) — protégé par PROJECTOR_CRON_SECRET. */
export async function POST(request: Request) {
  const expected = getCronSecret();
  if (!expected || !secretMatches(request.headers.get("x-projector-cron-secret"), expected)) {
    return NextResponse.json({ error: "Secret de tâche planifiée invalide ou non configuré." }, { status: 401 });
  }
  const forceWeekly = new URL(request.url).searchParams.get("weekly") === "1";
  const report = await runIntegrationJobs({ forceWeekly });
  return NextResponse.json({ report });
}
