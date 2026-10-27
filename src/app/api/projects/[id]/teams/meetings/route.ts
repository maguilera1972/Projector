import { NextResponse } from "next/server";
import { hasPermission, isUserActive, PERMISSIONS } from "@/lib/auth/permissions";
import {
  getIntegrationSettings,
  getProjectById,
  listAllPhaseValidations,
  listTeamsMeetings,
  listUsers,
  saveTeamsMeeting,
} from "@/lib/db/store";
import { checkFeature } from "@/lib/integrations/capabilities";
import { getDefaultMeetingOrganizer } from "@/lib/integrations/config";
import { graphFailure, jsonError, requireActor, requireProjectManager } from "@/lib/integrations/http";
import { createTeamsMeeting, needsDecisionPrompt } from "@/lib/teams/meetings";
import { decisionMakers, resolveProjectTeam } from "@/lib/teams/project-team";
import type { HermesPhaseId, TeamsMeetingAttendee, TeamsMeetingKind } from "@/types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(_request: Request, { params }: RouteParams) {
  const guard = await requireActor();
  if (!guard.ok) return guard.response;
  const { actor, t, it } = guard.value;
  if (!hasPermission(actor, PERMISSIONS.PROJECTS_READ)) return jsonError(t("common.accessDenied"), 403);
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return jsonError(it("errors.projectNotFound"), 404);

  const [meetings, settings, team] = await Promise.all([
    listTeamsMeetings(id),
    getIntegrationSettings(),
    resolveProjectTeam(project),
  ]);
  const check = await checkFeature("meetings", settings);
  return NextResponse.json({
    meetings,
    decisionPrompts: meetings.filter((meeting) => needsDecisionPrompt(meeting, project)).map((meeting) => meeting.id),
    available: check.ok,
    unavailableReason: check.ok ? undefined : check.message,
    defaultOrganizer: getDefaultMeetingOrganizer() ?? null,
    team: team.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      roles: member.roles,
    })),
    decisionMakerIds: decisionMakers(team).map((member) => member.user.id),
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const guard = await requireProjectManager(id, { allowMandant: true });
  if (!guard.ok) return guard.response;
  const { actor, it, project } = guard.value;

  const settings = await getIntegrationSettings();
  const check = await checkFeature("meetings", settings);
  if (!check.ok) return jsonError(it("meetings.unavailable", { reason: check.message }), 503);

  const body = (await request.json().catch(() => null)) as {
    kind?: TeamsMeetingKind;
    phase?: HermesPhaseId;
    subject?: string;
    start?: string;
    durationMinutes?: number;
    agenda?: string;
    attendeeUserIds?: string[];
    extraEmails?: string[];
    recurrence?: { interval?: number; until?: string } | null;
  } | null;
  if (!body || (body.kind !== "phase_gate" && body.kind !== "status") || !body.start) {
    return jsonError(it("errors.invalidBody"), 400);
  }

  const users = await listUsers();
  const attendees: TeamsMeetingAttendee[] = [];
  const seen = new Set<string>();
  for (const userId of body.attendeeUserIds ?? []) {
    const user = users.find((item) => item.id === userId && isUserActive(item));
    if (!user?.email || seen.has(user.email.toLowerCase())) continue;
    seen.add(user.email.toLowerCase());
    attendees.push({ email: user.email, name: user.name, userId: user.id, type: "required" });
  }
  for (const raw of body.extraEmails ?? []) {
    const email = raw.trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) continue;
    seen.add(email);
    attendees.push({ email, name: email, type: "optional" });
  }

  const phase = body.kind === "phase_gate" ? (body.phase ?? project.currentPhase) : body.phase;
  const validation = (await listAllPhaseValidations()).find(
    (item) => item.projectId === project.id && item.status === "submitted" && item.fromPhase === phase,
  );
  const interval = body.recurrence?.interval === 2 ? 2 : body.recurrence?.interval === 1 ? 1 : undefined;

  try {
    const meeting = await createTeamsMeeting(
      project,
      {
        kind: body.kind,
        phase,
        validationId: validation?.id,
        subject: body.subject,
        start: body.start,
        durationMinutes: Number(body.durationMinutes ?? 60),
        agenda: body.agenda,
        attendees,
        recurrence: body.kind === "status" && interval ? { interval, until: body.recurrence?.until } : undefined,
      },
      actor,
    );
    const saved = await saveTeamsMeeting(meeting, actor);
    return NextResponse.json({ meeting: saved, message: it("meetings.scheduled") });
  } catch (error) {
    return graphFailure(error);
  }
}
