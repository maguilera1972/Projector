import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { setTaskEstimate } from "@/lib/db/store";
import { readJsonObject, timeError, timeErrorFromException } from "@/lib/time-tracking/http";
import { timeTrackingError } from "@/lib/time-tracking/rules";
import { getTaskTimeContext, loadTaskTimeScope } from "@/lib/time-tracking/service";
import { ESTIMATE_REVISION_REASONS, type EstimateRevisionReason } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function readHours(value: unknown): number | null {
  if (value === null || value === "" || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) throw timeTrackingError("invalidEstimate");
  return parsed;
}

/**
 * Fixe / modifie la charge prévue (heures) d'une tâche — chef de projet ou administrateur.
 * Corps : `{ hours: number | null, reason?: "unforeseen" | "scope_change" | "estimation_error" | "other", reasonText?: string }`.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const { id } = await params;
  const scope = await loadTaskTimeScope(id, user);
  if (!scope) return timeError("taskNotFound");
  if (!scope.access.canManage) return timeError("forbidden");

  try {
    const body = await readJsonObject(request);
    const hours = readHours(body.hours);
    const reason = ESTIMATE_REVISION_REASONS.includes(body.reason as EstimateRevisionReason)
      ? (body.reason as EstimateRevisionReason)
      : undefined;
    const reasonText = typeof body.reasonText === "string" ? body.reasonText : undefined;

    const { task, revision } = await setTaskEstimate(
      id,
      { hours, reason, reasonText },
      { id: user.id, name: user.name },
    );
    const context = await getTaskTimeContext({ ...scope, task }, user);
    return NextResponse.json({ task, revision, context });
  } catch (error) {
    return timeErrorFromException(error, "Mise à jour de la charge impossible.");
  }
}
