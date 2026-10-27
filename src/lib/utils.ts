import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toIntlLocale, type Locale } from "@/lib/i18n/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DISPLAY_TIME_ZONE = "Europe/Zurich";

export function formatDate(date: string | Date, locale: Locale = "fr"): string {
  const parsed =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00.000Z`)
      : typeof date === "string"
        ? new Date(date)
        : date;

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(parsed);
}

export function getPhaseProgress(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
