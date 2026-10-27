import { NextResponse } from "next/server";
import { getTeamsMeetingById, saveTeamsMeeting } from "@/lib/db/store";
import { graphFailure, jsonError, requireProjectManager } from "@/lib/integrations/http";
import { cancelTeamsMeeting } from "@/lib/teams/meetings";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; meetingId: string }>;
}

async function load(params: RouteParams["params"]) {
  const { id, meetingId } = await params;
  const guard = await requireProjectManager(id, { allowMandant: true });
  if (!guard.ok) return guard;
  const meeting = await getTeamsMeetingById(meetingId);
  if (!meeting || meeting.projectId !== id) {
    return { ok: false as const, response: jsonError(guard.value.it("errors.meetingNotFound"), 404) };
  }
  return { ok: true as const, value: { ...guard.value, meeting } };
}

/** Annule la réunion dans Teams / Outlook (les participants sont prévenus). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const guard = await load(params);
  if (!guard.ok) return guard.response;
  const { actor, it, meeting } = guard.value;
  if (meeting.status === "scheduled") {
    try {
      await cancelTeamsMeeting(meeting);
    } catch (error) {
      return graphFailure(error);
    }
  }
  const saved = await saveTeamsMeeting({ ...meeting, status: "cancelled" }, actor);
  return NextResponse.json({ meeting: saved, message: it("meetings.cancelled") });
}

/** Marque la décision de la séance comme consignée (masque l'invite de saisie du PV). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const guard = await load(params);
  if (!guard.ok) return guard.response;
  const { actor, it, meeting } = guard.value;
  const body = (await request.json().catch(() => null)) as { decisionRecorded?: boolean } | null;
  if (body?.decisionRecorded !== true) return jsonError(it("errors.invalidBody"), 400);
  const saved = await saveTeamsMeeting({ ...meeting, decisionRecordedAt: new Date().toISOString() }, actor);
  return NextResponse.json({ meeting: saved });
}
