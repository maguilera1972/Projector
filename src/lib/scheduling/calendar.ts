/** Calendrier ouvré simplifié (lun–ven). Les congés par ressource viendront à l'étape ressources avancée. */

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6;
}

export function addWorkingDays(startIso: string, days: number): string {
  if (days === 0) return startIso.slice(0, 10);

  let current = parseIsoDate(startIso);
  let remaining = Math.abs(days);
  const step = days > 0 ? 1 : -1;

  while (remaining > 0) {
    current.setDate(current.getDate() + step);
    if (isWorkingDay(current)) {
      remaining--;
    }
  }

  return toIsoDate(current);
}

export function workingDaysBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso || startIso > endIso) {
    return 1;
  }

  let count = 0;
  const cursor = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);

  while (cursor <= end) {
    if (isWorkingDay(cursor)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.max(count, 1);
}

export function maxIsoDate(...dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => Boolean(d?.trim()));
  if (valid.length === 0) return undefined;
  return valid.reduce((max, current) => (current > max ? current : max));
}
