import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createTimeEntry } from "@/lib/db/store";
import { canLogTimeFor } from "@/lib/time-tracking/access";
import {
  optionalString,
  readJsonObject,
  timeError,
  timeErrorFromException,
} from "@/lib/time-tracking/http";
import { readDurationMinutes, timeTrackingError } from "@/lib/time-tracking/rules";
import {
  getDailyWarning,
  getTaskTimeContext,
  loadTaskTimeScope,
} from "@/lib/time-tracking/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const { id } = await params;
  const scope = await loadTaskTimeScope(id, user);
  if (!scope) return timeError("taskNotFound");

  const context = await getTaskTimeContext(scope, user);
  if (!scope.access.canLogOwn && context.entries.length === 0) {
    return timeError("forbidden");
  }
  return NextResponse.json(context);
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const { id } = await params;
  const scope = await loadTaskTimeScope(id, user);
  if (!scope) return timeError("taskNotFound");

  try {
    const body = await readJsonObject(request);
    const userId = optionalString(body, "userId")?.trim() || user.id;
    if (!canLogTimeFor(scope.access, user, userId)) return timeError("forbidden");

    const durationMinutes = readDurationMinutes(body);
    const date = optionalString(body, "date")?.trim();
    if (durationMinutes === undefined) throw timeTrackingError("invalidDuration");
    if (!date) throw timeTrackingError("invalidDate");

    const entry = await createTimeEntry(
      id,
      { userId, date, durationMinutes, comment: optionalString(body, "comment") },
      { id: user.id, name: user.name },
    );
    const warning = await getDailyWarning(entry.userId, entry.date);
    const context = await getTaskTimeContext(scope, user);
    return NextResponse.json({ entry, warning, context }, { status: 201 });
  } catch (error) {
    return timeErrorFromException(error, "Saisie impossible.");
  }
}
