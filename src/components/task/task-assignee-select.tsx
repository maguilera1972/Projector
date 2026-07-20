"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AssigneeOption } from "@/lib/users";

interface TaskAssigneeSelectProps {
  taskId: string;
  assigneeId?: string;
  users: AssigneeOption[];
  canAssign: boolean;
  compact?: boolean;
}

export function TaskAssigneeSelect({
  taskId,
  assigneeId,
  users,
  canAssign,
  compact = false,
}: TaskAssigneeSelectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const assigneeName = users.find((user) => user.id === assigneeId)?.name;

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: value === "" ? null : value,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Assignation impossible.");
        return;
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  if (!canAssign) {
    return (
      <span
        className={cn(
          "text-brand-muted",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {assigneeName ?? "—"}
      </span>
    );
  }

  return (
    <div className="relative">
      <select
        value={assigneeId ?? ""}
        onChange={handleChange}
        disabled={loading}
        aria-label="Assigner la tâche"
        className={cn(
          "rounded-lg border border-slate-200 bg-white text-slate-700 outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20 disabled:opacity-50",
          compact ? "max-w-[10rem] px-2 py-1 text-xs" : "min-w-[11rem] px-2.5 py-1.5 text-sm",
        )}
      >
        <option value="">— Non assigné —</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
