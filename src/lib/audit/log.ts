import type { AuditLogEntry } from "@/types";

export type AuditAction =
  | "budget.approved"
  | "budget.revision_requested"
  | "budget.revision_approved"
  | "phase.submitted"
  | "phase.approved"
  | "phase.rejected"
  | "project.initialized"
  | "report.sent";

export function createAuditEntry(
  input: Omit<AuditLogEntry, "id" | "createdAt">,
): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
}
