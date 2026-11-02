import { todayIso } from "@/lib/reports/format";
import type { TimeEntry } from "@/types";
import { parseDuration } from "./duration";

/** Une saisie ne peut dépasser une journée complète. */
export const MAX_ENTRY_MINUTES = 24 * 60;
/** Au-delà de ce total quotidien, un avertissement (non bloquant) est affiché. */
export const DAILY_WARNING_MINUTES = 10 * 60;
/** Tolérance (jours) pour une date future (fuseaux horaires, saisie anticipée de la veille). */
export const FUTURE_TOLERANCE_DAYS = 1;
export const MIN_ENTRY_DATE = "2000-01-01";
export const MAX_COMMENT_LENGTH = 500;

export type TimeTrackingErrorCode =
  | "invalidDuration"
  | "durationTooLong"
  | "invalidDate"
  | "dateInFuture"
  | "commentTooLong"
  | "invalidUser"
  | "invalidEstimate"
  | "invalidPeriod"
  | "taskNotFound"
  | "entryNotFound"
  | "entryDeleted"
  | "forbidden"
  | "unauthenticated"
  | "invalidRequest";

export class TimeTrackingError extends Error {
  constructor(
    readonly code: TimeTrackingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TimeTrackingError";
  }
}

const ERROR_MESSAGES: Record<TimeTrackingErrorCode, string> = {
  invalidDuration: "Durée invalide (formats acceptés : 1h30, 1.5, 90m, 1:30).",
  durationTooLong: "Une saisie ne peut pas dépasser 24 heures.",
  invalidDate: "Date invalide.",
  dateInFuture: "La date ne peut pas être dans le futur.",
  commentTooLong: `Le commentaire ne peut pas dépasser ${MAX_COMMENT_LENGTH} caractères.`,
  invalidUser: "Utilisateur introuvable ou inactif.",
  invalidEstimate: "Charge prévue invalide.",
  invalidPeriod: "La date de fin doit être postérieure ou égale à la date de début.",
  taskNotFound: "Tâche introuvable.",
  entryNotFound: "Saisie de temps introuvable.",
  entryDeleted: "Cette saisie a été supprimée.",
  forbidden: "Accès refusé.",
  unauthenticated: "Non authentifié.",
  invalidRequest: "Requête invalide.",
};

export function timeTrackingError(code: TimeTrackingErrorCode): TimeTrackingError {
  return new TimeTrackingError(code, ERROR_MESSAGES[code]);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant la date (semaine ISO). */
export function startOfWeekIso(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -offset);
}

export function weekDaysIso(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
}

export function latestAllowedDate(today = todayIso()): string {
  return addDaysIso(today, FUTURE_TOLERANCE_DAYS);
}

export interface TimeEntryFields {
  date: string;
  durationMinutes: number;
  comment?: string;
}

/** Vérifie une saisie complète ; lève une TimeTrackingError avec un code stable. */
export function assertValidTimeEntry(fields: TimeEntryFields, today = todayIso()): void {
  if (!isValidIsoDate(fields.date) || fields.date < MIN_ENTRY_DATE) {
    throw timeTrackingError("invalidDate");
  }
  if (fields.date > latestAllowedDate(today)) {
    throw timeTrackingError("dateInFuture");
  }
  if (!Number.isInteger(fields.durationMinutes) || fields.durationMinutes <= 0) {
    throw timeTrackingError("invalidDuration");
  }
  if (fields.durationMinutes > MAX_ENTRY_MINUTES) {
    throw timeTrackingError("durationTooLong");
  }
  if ((fields.comment ?? "").length > MAX_COMMENT_LENGTH) {
    throw timeTrackingError("commentTooLong");
  }
}

/** Durée reçue d'une API : nombre de minutes ou texte libre (« 1h30 »). */
export function readDurationMinutes(body: Record<string, unknown>): number | undefined {
  if (typeof body.durationMinutes === "number") return Math.round(body.durationMinutes);
  if (typeof body.duration === "string" || typeof body.duration === "number") {
    const parsed = parseDuration(body.duration);
    if (parsed === null) throw timeTrackingError("invalidDuration");
    return parsed;
  }
  if (typeof body.hours === "number") return Math.round(body.hours * 60);
  return undefined;
}

export function activeEntries(entries: TimeEntry[]): TimeEntry[] {
  return entries.filter((entry) => !entry.deletedAt);
}

export function sumMinutes(entries: Pick<TimeEntry, "durationMinutes">[]): number {
  return entries.reduce((total, entry) => total + entry.durationMinutes, 0);
}

/** Total quotidien d'une personne (saisies actives), en excluant éventuellement une saisie. */
export function dailyTotalMinutes(
  entries: TimeEntry[],
  userId: string,
  date: string,
  excludeId?: string,
): number {
  return sumMinutes(
    entries.filter(
      (entry) =>
        !entry.deletedAt && entry.userId === userId && entry.date === date && entry.id !== excludeId,
    ),
  );
}
