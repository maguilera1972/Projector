import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import {
  deleteTimeEntry,
  getPortfolioById,
  getProjectById,
  getTimeEntryById,
  updateTimeEntry,
  type TimeEntryChange,
} from "@/lib/db/store";
import { canModifyTimeEntry, isOwnEntry, isTimeManager } from "@/lib/time-tracking/access";
import {
  optionalString,
  readJsonObject,
  timeError,
  timeErrorFromException,
} from "@/lib/time-tracking/http";
import { readDurationMinutes } from "@/lib/time-tracking/rules";
import { getDailyWarning } from "@/lib/time-tracking/service";
import type { TimeEntry } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadEntryAccess(
  id: string,
  user: SessionUser,
): Promise<{ entry: TimeEntry; canManage: boolean } | null> {
  const entry = await getTimeEntryById(id);
  if (!entry) return null;
  const project = await getProjectById(entry.projectId);
  const portfolio = project?.portfolioId ? await getPortfolioById(project.portfolioId) : undefined;
  return { entry, canManage: Boolean(project && isTimeManager(user, project, portfolio)) };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const { id } = await params;
  const loaded = await loadEntryAccess(id, user);
  if (!loaded) return timeError("entryNotFound");
  if (!loaded.canManage && !isOwnEntry(user, loaded.entry)) return timeError("forbidden");
  return NextResponse.json({ entry: loaded.entry });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const { id } = await params;
  const loaded = await loadEntryAccess(id, user);
  if (!loaded) return timeError("entryNotFound");
  if (!canModifyTimeEntry(user, loaded.entry, loaded.canManage)) return timeError("forbidden");

  try {
    const body = await readJsonObject(request);
    const change: TimeEntryChange = {};
    const userId = optionalString(body, "userId")?.trim();
    if (userId && userId !== loaded.entry.userId) {
      if (!loaded.canManage) return timeError("forbidden");
      change.userId = userId;
    }
    const date = optionalString(body, "date")?.trim();
    if (date) change.date = date;
    const durationMinutes = readDurationMinutes(body);
    if (durationMinutes !== undefined) change.durationMinutes = durationMinutes;
    if ("comment" in body) {
      change.comment = typeof body.comment === "string" ? body.comment : null;
    }

    const entry = await updateTimeEntry(id, change, { id: user.id, name: user.name });
    const warning = await getDailyWarning(entry.userId, entry.date);
    return NextResponse.json({ entry, warning });
  } catch (error) {
    return timeErrorFromException(error, "Correction impossible.");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return timeError("unauthenticated");

  const { id } = await params;
  const loaded = await loadEntryAccess(id, user);
  if (!loaded) return timeError("entryNotFound");
  if (!canModifyTimeEntry(user, loaded.entry, loaded.canManage)) return timeError("forbidden");

  try {
    const entry = await deleteTimeEntry(id, { id: user.id, name: user.name });
    return NextResponse.json({ entry });
  } catch (error) {
    return timeErrorFromException(error, "Suppression impossible.");
  }
}
