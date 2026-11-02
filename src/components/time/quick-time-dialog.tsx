"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { TaskTimeSection } from "./task-time-section";
import { useTimeI18n } from "./use-time-i18n";

interface QuickTimeDialogProps {
  taskId: string | null;
  taskTitle?: string;
  onClose: () => void;
}

/** Action rapide « Saisir du temps » depuis les tableaux de tâches. */
export function QuickTimeDialog({ taskId, taskTitle, onClose }: QuickTimeDialogProps) {
  const router = useRouter();
  const { tt } = useTimeI18n();
  if (!taskId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label={tt("common.close")}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{tt("common.quickTitle")}</h2>
            {taskTitle && <p className="mt-1 text-sm text-brand-muted">{taskTitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={tt("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <TaskTimeSection taskId={taskId} quick onChanged={() => router.refresh()} />
        </div>
      </div>
    </div>
  );
}
