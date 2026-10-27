import type { SessionUser, User } from "@/lib/auth/permissions";
import { getPhaseLabel } from "@/lib/hermes/phases";
import { escapeHtml } from "@/lib/mail/layout";
import {
  absoluteUrl,
  getDefaultMeetingOrganizer,
  getMeetingTimeZone,
} from "@/lib/integrations/config";
import { describeError, graphRequest } from "@/lib/integrations/graph";
import type {
  HermesPhaseId,
  Project,
  TeamsMeeting,
  TeamsMeetingAttendee,
  TeamsMeetingKind,
} from "@/types";

/**
 * Lot 1 — Réunions Teams (événement de calendrier en ligne) planifiées depuis PROJECTOR.
 * Permission d'application : Calendars.ReadWrite (idéalement limitée par Exchange RBAC for Applications
 * aux boîtes organisatrices).
 */

export interface ScheduleMeetingInput {
  kind: TeamsMeetingKind;
  phase?: HermesPhaseId;
  validationId?: string;
  subject?: string;
  /** Date/heure locale ISO sans fuseau (ex. 2026-11-03T10:00), dans `timeZone`. */
  start: string;
  durationMinutes: number;
  agenda?: string;
  attendees: TeamsMeetingAttendee[];
  recurrence?: { interval: 1 | 2; until?: string };
}

interface GraphEvent {
  id: string;
  webLink?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toLocalDateTime(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!match) throw new Error("Date de début invalide (format AAAA-MM-JJTHH:MM attendu).");
  return `${match[1]}T${match[2]}:00`;
}

function addMinutes(localDateTime: string, minutes: number): string {
  const date = new Date(`${localDateTime}Z`);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 19);
}

/** Boîte organisatrice : l'utilisateur s'il est lié à Entra, sinon la boîte par défaut. */
export function resolveOrganizer(actor: Pick<User, "entraOid" | "email"> | null): {
  mailbox: string;
  isActor: boolean;
} | null {
  if (actor?.entraOid) return { mailbox: actor.entraOid, isActor: true };
  const fallback = getDefaultMeetingOrganizer();
  return fallback ? { mailbox: fallback, isActor: false } : null;
}

export function defaultMeetingSubject(project: Project, kind: TeamsMeetingKind, phase?: HermesPhaseId): string {
  if (kind === "phase_gate" && phase) {
    return `PROJECTOR · Quality gate ${getPhaseLabel(phase, project.approach)} — ${project.name}`;
  }
  return `PROJECTOR · Point de situation — ${project.name}`;
}

function buildAgendaHtml(project: Project, input: ScheduleMeetingInput): string {
  const projectUrl = absoluteUrl(`/projets/${project.id}`);
  const folderUrl = absoluteUrl(`/documents/${project.id}`);
  const phaseLine = input.phase
    ? `<p><strong>Phase :</strong> ${escapeHtml(getPhaseLabel(input.phase, project.approach))}</p>`
    : "";
  const agenda = input.agenda?.trim()
    ? `<p><strong>Ordre du jour</strong></p><p>${escapeHtml(input.agenda.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  return [
    `<p><strong>Projet :</strong> ${escapeHtml(project.name)}</p>`,
    phaseLine,
    agenda,
    `<p><a href="${projectUrl}">Ouvrir le projet dans PROJECTOR</a> · <a href="${folderUrl}">Dossier documentaire de la phase</a></p>`,
    input.kind === "phase_gate"
      ? "<p>Après la séance, consignez la décision et le PV dans le panneau Quality gate du projet.</p>"
      : "",
  ].join("");
}

/** Crée l'événement Teams dans le calendrier de l'organisateur et renvoie la réunion à enregistrer. */
export async function createTeamsMeeting(
  project: Project,
  input: ScheduleMeetingInput,
  actor: SessionUser & Pick<User, "entraOid">,
): Promise<TeamsMeeting> {
  const organizer = resolveOrganizer(actor);
  if (!organizer) {
    throw new Error("Aucune boîte organisatrice : liez votre compte à Microsoft ou définissez TEAMS_MEETING_ORGANIZER.");
  }
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480) {
    throw new Error("Durée invalide (15 à 480 minutes).");
  }
  const timeZone = getMeetingTimeZone();
  const start = toLocalDateTime(input.start);
  const end = addMinutes(start, input.durationMinutes);
  const id = crypto.randomUUID();
  const subject = input.subject?.trim() || defaultMeetingSubject(project, input.kind, input.phase);

  const recurrence = input.recurrence
    ? {
        pattern: {
          type: "weekly",
          interval: input.recurrence.interval,
          daysOfWeek: [DAY_NAMES[new Date(`${start}Z`).getUTCDay()]],
        },
        range: input.recurrence.until
          ? { type: "endDate", startDate: start.slice(0, 10), endDate: input.recurrence.until.slice(0, 10) }
          : { type: "noEnd", startDate: start.slice(0, 10) },
      }
    : undefined;

  const { data: created } = await graphRequest<GraphEvent>(
    "POST",
    `/users/${encodeURIComponent(organizer.mailbox)}/events`,
    {
      body: {
        subject,
        body: { contentType: "HTML", content: buildAgendaHtml(project, input) },
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
        attendees: input.attendees.map((attendee) => ({
          emailAddress: { address: attendee.email, name: attendee.name },
          type: attendee.type,
        })),
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
        allowNewTimeProposals: true,
        transactionId: id,
        ...(recurrence ? { recurrence } : {}),
      },
      headers: { Prefer: `outlook.timezone="${timeZone}"` },
    },
  );

  let joinUrl = created.onlineMeeting?.joinUrl ?? undefined;
  if (!joinUrl) {
    try {
      const { data } = await graphRequest<GraphEvent>(
        "GET",
        `/users/${encodeURIComponent(organizer.mailbox)}/events/${encodeURIComponent(created.id)}?$select=onlineMeeting,webLink`,
      );
      joinUrl = data.onlineMeeting?.joinUrl ?? undefined;
    } catch {
      /* lien de participation disponible plus tard dans Outlook */
    }
  }

  return {
    id,
    projectId: project.id,
    kind: input.kind,
    phase: input.phase,
    validationId: input.validationId,
    eventId: created.id,
    organizerUpn: organizer.mailbox,
    subject,
    start,
    end,
    timeZone,
    joinUrl,
    webLink: created.webLink,
    attendees: input.attendees,
    recurrence: input.recurrence
      ? { interval: input.recurrence.interval, dayOfWeek: recurrence!.pattern.daysOfWeek[0], until: input.recurrence.until }
      : undefined,
    status: "scheduled",
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    createdByName: actor.name,
  };
}

/** Annule l'événement (message d'annulation aux participants) ; repli sur la suppression. */
export async function cancelTeamsMeeting(meeting: TeamsMeeting, comment?: string): Promise<void> {
  const base = `/users/${encodeURIComponent(meeting.organizerUpn)}/events/${encodeURIComponent(meeting.eventId)}`;
  try {
    if (meeting.attendees.length > 0) {
      await graphRequest("POST", `${base}/cancel`, {
        body: { comment: comment?.trim() || "Réunion annulée depuis PROJECTOR." },
      });
      return;
    }
  } catch (error) {
    console.warn(`[teams] Annulation impossible, suppression de l'événement : ${describeError(error)}`);
  }
  await graphRequest("DELETE", base);
}

/** Réunion de quality gate terminée sans décision consignée (invite à saisir le PV). */
export function needsDecisionPrompt(meeting: TeamsMeeting, project: Project, now = new Date()): boolean {
  if (meeting.kind !== "phase_gate" || meeting.status !== "scheduled" || meeting.decisionRecordedAt) {
    return false;
  }
  const endUtc = new Date(`${meeting.end}Z`).getTime() + 2 * 3600_000;
  return endUtc < now.getTime() && meeting.phase === project.currentPhase;
}
