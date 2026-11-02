/** Durées de saisie : « 1h30 », « 1h », « 1.5 », « 1,5 », « 90m », « 90 min », « 1:30 », « 2 » (= heures). */

const HOURS_MINUTES =
  /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|heures?|hours?|ore|horas?|std|stunden?)\s*(?:(\d{1,2})\s*(?:m|min|mn)?)?$/i;
const MINUTES_ONLY = /^(\d+(?:[.,]\d+)?)\s*(?:m|min|mn|minutes?|minuti|minutos|minuten)$/i;
const COLON = /^(\d+):([0-5]\d)$/;
const DECIMAL_HOURS = /^(\d+(?:[.,]\d+)?)$/;

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

/** Convertit une saisie libre en minutes (arrondies) ; `null` si le format est invalide. */
export function parseDuration(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 60) : null;
  }
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) return null;

  const colon = COLON.exec(value);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  const minutesOnly = MINUTES_ONLY.exec(value);
  if (minutesOnly) return Math.round(toNumber(minutesOnly[1]));

  const hoursMinutes = HOURS_MINUTES.exec(value);
  if (hoursMinutes) {
    const hours = toNumber(hoursMinutes[1]);
    const minutes = hoursMinutes[2] ? Number(hoursMinutes[2]) : 0;
    if (minutes >= 60) return null;
    return Math.round(hours * 60) + minutes;
  }

  const decimal = DECIMAL_HOURS.exec(value);
  if (decimal) return Math.round(toNumber(decimal[1]) * 60);

  return null;
}

/** Affichage compact : « 1h30 », « 2h », « 45min ». */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

/** Minutes → heures décimales (2 décimales). */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
