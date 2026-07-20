"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from "@/types";

const statusVariant: Record<
  ProjectStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  planifie: "info",
  en_cours: "default",
  en_pause: "warning",
  termine: "success",
};

interface AdminProjectsTableProps {
  projects: Project[];
  portfolioNames: Record<string, string>;
}

export function AdminProjectsTable({
  projects,
  portfolioNames,
}: AdminProjectsTableProps) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rows = useMemo(
    () => projects.filter((project) => !hiddenIds.has(project.id)),
    [projects, hiddenIds],
  );

  async function handleDelete(project: Project) {
    const confirmed = window.confirm(
      `Supprimer définitivement le projet « ${project.name} » ?\n\nCette action est irréversible et supprimera aussi les tâches et documents associés (y compris les fichiers Word sur le serveur).`,
    );

    if (!confirmed) return;

    setError("");
    setDeletingId(project.id);

    // Masquage immédiat — ne pas attendre le refresh serveur
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(project.id);
      return next;
    });

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? ((await response.json()) as { error?: string })
        : { error: `Réponse inattendue (${response.status}).` };

      if (!response.ok && response.status !== 404) {
        // Annule le masquage si la suppression a réellement échoué
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(project.id);
          return next;
        });
        setError(data.error ?? "Suppression impossible.");
        return;
      }

      router.refresh();
    } catch {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="px-6 py-8 text-center text-sm text-brand-muted">
        Aucun projet enregistré.
      </p>
    );
  }

  return (
    <>
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700">Projet</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Statut</th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Portfolio
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Chef de projet
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Créé le
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((project) => (
              <tr key={project.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-medium text-slate-900">
                  {project.name}
                </td>
                <td className="px-6 py-4">
                  <Badge variant={statusVariant[project.status]}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {project.portfolioId
                    ? (portfolioNames[project.portfolioId] ?? "—")
                    : "—"}
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {project.chefDeProjet}
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {formatDate(project.createdAt)}
                </td>
                <td className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => void handleDelete(project)}
                    disabled={deletingId === project.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === project.id ? "Suppression..." : "Supprimer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
