import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { mockProjects, mockTasks } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { HERMES_PHASES, TASK_STATUS_LABELS, type TaskStatus } from "@/types";

const taskStatusVariant: Record<
  TaskStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  a_faire: "muted",
  en_cours: "default",
  termine: "success",
  bloque: "warning",
};

export default function TachesPage() {
  return (
    <>
      <Header
        title="Tâches"
        subtitle="Suivi des tâches par module et phase HERMES5"
      />

      <main className="p-8">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Tâche</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Projet</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Module</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Phase</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Assigné</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Échéance</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockTasks.map((task) => {
                const project = mockProjects.find((p) => p.id === task.projectId);
                const phase = HERMES_PHASES.find((p) => p.id === task.phase);

                return (
                  <tr key={task.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {task.title}
                    </td>
                    <td className="px-6 py-4 text-brand-muted">
                      {project?.name}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="muted">{task.module}</Badge>
                    </td>
                    <td className="px-6 py-4 text-brand-muted">
                      {phase?.label}
                    </td>
                    <td className="px-6 py-4 text-brand-muted">
                      {task.assignee}
                    </td>
                    <td className="px-6 py-4 text-brand-muted">
                      {task.dueDate ? formatDate(task.dueDate) : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={taskStatusVariant[task.status]}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
