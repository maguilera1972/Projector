"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssigneeOption } from "@/lib/users";
import type { Project } from "@/types";

interface ProjectMandantAssignmentTableProps {
  projects: Project[];
  users: AssigneeOption[];
  portfolioNames: Record<string, string>;
  canEdit: boolean;
}

export function ProjectMandantAssignmentTable({
  projects,
  users,
  portfolioNames,
  canEdit,
}: ProjectMandantAssignmentTableProps) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      projects.map((project) => [project.id, project.mandantUserId ?? ""]),
    ),
  );
  const [error, setError] = useState("");

  async function saveMandant(project: Project) {
    const mandantUserId = drafts[project.id] ?? "";

    setSavingId(project.id);
    setError("");

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mandantUserId: mandantUserId || null,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSavingId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="px-6 py-8 text-center text-sm text-brand-muted">
        Aucun projet disponible pour l&apos;assignation du mandant.
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
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700">Projet</th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Portfolio
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Chef de projet
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Mandant (libellé)
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Utilisateur mandant
              </th>
              {canEdit && (
                <th className="px-6 py-4 font-semibold text-slate-700">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((project) => {
              const selectedUser = users.find(
                (user) => user.id === (drafts[project.id] ?? ""),
              );
              const isLinked = Boolean(project.mandantUserId);
              const isDirty =
                (drafts[project.id] ?? "") !== (project.mandantUserId ?? "");

              return (
                <tr key={project.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {project.name}
                  </td>
                  <td className="px-6 py-4 text-brand-muted">
                    {project.portfolioId
                      ? portfolioNames[project.portfolioId] ?? "—"
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-brand-muted">
                    {project.chefDeProjet}
                  </td>
                  <td className="px-6 py-4 text-brand-muted">
                    {project.mandant}
                  </td>
                  <td className="px-6 py-4">
                    {canEdit ? (
                      <select
                        value={drafts[project.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((current) => ({
                            ...current,
                            [project.id]: e.target.value,
                          }))
                        }
                        className="w-full min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">— Sélectionner un utilisateur —</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-brand-muted">
                        {selectedUser?.name ?? project.mandant}
                      </span>
                    )}
                    <div className="mt-1.5">
                      {isLinked || selectedUser ? (
                        <Badge variant="success">
                          <UserCheck className="mr-1 inline h-3 w-3" />
                          Compte lié
                        </Badge>
                      ) : (
                        <Badge variant="warning">Non lié — validations bloquées</Badge>
                      )}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        disabled={
                          savingId === project.id ||
                          !drafts[project.id] ||
                          !isDirty
                        }
                        onClick={() => void saveMandant(project)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {savingId === project.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Enregistrer
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
