"use client";

import { useMemo, useState } from "react";
import { BarChart3, List, GitBranch } from "lucide-react";
import { ProjectBaselinesToolbar } from "@/components/project/project-baselines-toolbar";
import { ProjectGanttChart } from "@/components/project/project-gantt-chart";
import { ProjectSchedulePanel } from "@/components/project/project-schedule-panel";
import { ProjectTasksTableView } from "@/components/project/project-tasks-table-view";
import type { AssigneeOption } from "@/lib/users";
import type {
  HermesApproach,
  ProjectBaseline,
  ProjectScheduleSummary,
  Task,
} from "@/types";

type PlanTab = "liste" | "gantt" | "dependances";

interface ProjectPlanViewProps {
  projectId: string;
  tasks: Task[];
  approach: HermesApproach;
  users: AssigneeOption[];
  canEdit: boolean;
  schedule: ProjectScheduleSummary;
  baselines: ProjectBaseline[];
  timeByTask?: Record<string, number>;
  canLogTaskIds?: string[];
}

const tabs: { id: PlanTab; label: string; icon: typeof List }[] = [
  { id: "liste", label: "Vue tâches", icon: List },
  { id: "gantt", label: "Gantt", icon: BarChart3 },
  { id: "dependances", label: "Dépendances", icon: GitBranch },
];

export function ProjectPlanView({
  projectId,
  tasks,
  approach,
  users,
  canEdit,
  schedule,
  baselines,
  timeByTask,
  canLogTaskIds,
}: ProjectPlanViewProps) {
  const [activeTab, setActiveTab] = useState<PlanTab>("gantt");
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(
    baselines[0]?.id ?? null,
  );

  const selectedBaseline = useMemo(
    () => baselines.find((b) => b.id === selectedBaselineId),
    [baselines, selectedBaselineId],
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Plan du projet</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Vues Gantt et tâches, comparaison avec les baselines et suivi des
          écarts planifié / réel.
        </p>
      </div>

      <ProjectBaselinesToolbar
        projectId={projectId}
        baselines={baselines}
        selectedBaselineId={selectedBaselineId}
        onSelectBaseline={setSelectedBaselineId}
        canEdit={canEdit}
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border border-b-white border-slate-200 bg-white text-slate-900"
                  : "text-brand-muted hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "liste" && (
        <ProjectTasksTableView
          tasks={tasks}
          approach={approach}
          users={users}
          canAssign={canEdit}
          schedule={schedule}
          baseline={selectedBaseline}
          timeByTask={timeByTask}
          canLogTaskIds={canLogTaskIds}
        />
      )}

      {activeTab === "gantt" && (
        <ProjectGanttChart
          tasks={tasks}
          schedule={schedule}
          baseline={selectedBaseline}
        />
      )}

      {activeTab === "dependances" && (
        <ProjectSchedulePanel
          projectId={projectId}
          tasks={tasks}
          schedule={schedule}
          canEdit={canEdit}
        />
      )}
    </section>
  );
}
