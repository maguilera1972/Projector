"use client";

import { useI18n } from "@/lib/i18n/client";
import { getTaskTranslator } from "@/lib/tasks/i18n";
import type { TaskSource } from "@/types";

/** Pastille signalant une tâche créée manuellement (hors scénario HERMES). */
export function ManualTaskBadge({ source }: { source?: TaskSource }) {
  const { locale } = useI18n();
  if (source !== "manual") return null;
  const tk = getTaskTranslator(locale);
  return (
    <span
      title={tk("manualHint")}
      className="inline-flex shrink-0 items-center rounded-full border border-purple-300/60 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700"
    >
      {tk("manualBadge")}
    </span>
  );
}
