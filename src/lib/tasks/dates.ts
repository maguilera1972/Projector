import type { TaskStatus } from "@/types";

export function validateScheduleDates(
  startDate?: string | null,
  dueDate?: string | null,
): void {
  const start = startDate?.trim();
  const due = dueDate?.trim();

  if (start && due && start > due) {
    throw new Error(
      "La date de début ne peut pas être postérieure à la date limite.",
    );
  }
}

export function isOverdue(
  dueDate?: string,
  status?: TaskStatus,
): boolean {
  if (!dueDate?.trim() || status === "termine") {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export function formatScheduleLabel(
  startDate?: string,
  dueDate?: string,
  startedAt?: string,
): string {
  const parts: string[] = [];

  if (startDate) {
    parts.push(`Début prévu : ${startDate}`);
  }

  if (dueDate) {
    parts.push(`Échéance : ${dueDate}`);
  }

  if (startedAt) {
    parts.push(
      `Démarrée le ${new Date(startedAt).toLocaleDateString("fr-CH")}`,
    );
  }

  return parts.join(" · ");
}

export function getDaysOverdue(dueDate: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const due = dueDate.slice(0, 10);
  if (due >= today) return 0;

  const diffMs =
    new Date(today).getTime() - new Date(due).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function toDateInputValue(value?: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}
