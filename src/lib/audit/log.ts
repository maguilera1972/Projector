import type { AuditLogEntry } from "@/types";

export type AuditAction =
  | "budget.approved"
  | "budget.revision_requested"
  | "budget.revision_approved"
  | "phase.submitted"
  | "phase.approved"
  | "phase.rejected"
  | "project.initialized"
  | "report.sent"
  | "time.created"
  | "time.updated"
  | "time.deleted"
  | "task.estimate_changed"
  | "project.dates_changed";

/** Actions du suivi du temps et des charges : volumineuses, exclues des extraits d'audit de phase. */
export function isTimeAuditAction(action: string): boolean {
  return action.startsWith("time.") || action === "task.estimate_changed";
}

export function createAuditEntry(
  input: Omit<AuditLogEntry, "id" | "createdAt">,
): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
}
