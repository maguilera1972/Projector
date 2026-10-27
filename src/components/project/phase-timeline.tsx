"use client";

import { getPhasesForApproach, getPhaseLabel } from "@/lib/hermes/phases";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";
import type { HermesApproach, HermesPhaseId } from "@/types";
import { cn } from "@/lib/utils";

interface PhaseTimelineProps {
  currentPhase: HermesPhaseId;
  approach: HermesApproach;
  className?: string;
}

export function PhaseTimeline({
  currentPhase,
  approach,
  className,
}: PhaseTimelineProps) {
  const { t } = useI18n();
  const phases = getPhasesForApproach(approach);
  const currentOrder =
    phases.find((p) => p.id === currentPhase)?.order ?? 1;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {phases.map((phase, index) => {
          const isCompleted = phase.order < currentOrder;
          const isCurrent = phase.id === currentPhase;
          const isUpcoming = phase.order > currentOrder;

          return (
            <div key={phase.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all",
                    isCompleted && "gradient-brand text-white",
                    isCurrent &&
                      "gradient-brand text-white ring-4 ring-brand-indigo/30",
                    isUpcoming &&
                      "border-2 border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {phase.order}
                </div>
                <p
                  className={cn(
                    "mt-2 max-w-[80px] text-center text-xs font-medium",
                    isCurrent ? "gradient-brand-text" : "text-brand-muted",
                  )}
                >
                  {tDynamic(t, `enums.phase.${phase.id}`)}
                </p>
              </div>
              {index < phases.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1",
                    phase.order < currentOrder
                      ? "gradient-brand"
                      : "bg-slate-200",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { getPhaseLabel };
