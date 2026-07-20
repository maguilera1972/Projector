import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { isOverdue } from "@/lib/tasks/dates";
import type { TaskStatus } from "@/types";

interface TaskScheduleBadgeProps {
  startDate?: string;
  dueDate?: string;
  startedAt?: string;
  status: TaskStatus;
  compact?: boolean;
}

export function TaskScheduleBadge({
  startDate,
  dueDate,
  startedAt,
  status,
  compact = false,
}: TaskScheduleBadgeProps) {
  const overdue = isOverdue(dueDate, status);

  if (!startDate && !dueDate && !startedAt) {
    return compact ? (
      <span className="text-xs text-brand-muted">—</span>
    ) : null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-1"}`}>
      {startDate && (
        <span className="text-xs text-brand-muted">
          Début {formatDate(startDate)}
        </span>
      )}
      {dueDate && (
        <span className={`text-xs ${overdue ? "font-medium text-red-600" : "text-brand-muted"}`}>
          Échéance {formatDate(dueDate)}
        </span>
      )}
      {startedAt && (
        <span className="text-xs text-emerald-700">
          Démarrée {formatDate(startedAt.slice(0, 10))}
        </span>
      )}
      {overdue && (
        <Badge variant="warning" className="text-[10px]">
          En retard
        </Badge>
      )}
    </div>
  );
}
