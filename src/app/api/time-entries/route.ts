import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { timeError } from "@/lib/time-tracking/http";
import { isValidIsoDate } from "@/lib/time-tracking/rules";
import { listVisibleTimeEntries } from "@/lib/time-tracking/service";

const MAX_RESULTS = 5000;

/**
 * Saisies de temps visibles par l'utilisateur, filtrables par personne (`userId`, `me`),
 * projet, tâche et période (`from`/`to`, AAAA-MM-JJ inclus).
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const search = new URL(request.url).searchParams;
  const rawUser = search.get("userId")?.trim();
  const from = search.get("from")?.trim() || undefined;
  const to = search.get("to")?.trim() || undefined;
  if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) {
    return timeError("invalidDate");
  }

  const entries = await listVisibleTimeEntries(user, {
    userId: rawUser === "me" ? user.id : rawUser || undefined,
    projectId: search.get("projectId")?.trim() || undefined,
    taskId: search.get("taskId")?.trim() || undefined,
    from,
    to,
  });

  return NextResponse.json({
    entries: entries.slice(0, MAX_RESULTS),
    truncated: entries.length > MAX_RESULTS,
    totalMinutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
  });
}
