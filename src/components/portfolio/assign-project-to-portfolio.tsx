"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2 } from "lucide-react";
import type { Project } from "@/types";

interface AssignProjectToPortfolioProps {
  portfolioId: string;
  availableProjects: Project[];
}

export function AssignProjectToPortfolio({
  portfolioId,
  availableProjects,
}: AssignProjectToPortfolioProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (availableProjects.length === 0) {
    return null;
  }

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Assignation impossible.");
        return;
      }

      setSelectedId("");
      setSuccess("Projet assigné au portfolio.");
      router.refresh();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="gradient-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Link2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">
            Assigner un projet existant
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Rattachez un projet déjà créé à ce portfolio.
          </p>

          <form onSubmit={handleAssign} className="mt-4 flex flex-wrap gap-3">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
            >
              <option value="">— Sélectionner un projet —</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.portfolioId ? " (autre portfolio)" : " (sans portfolio)"}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedId || loading}
              className="gradient-brand rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Assignation..." : "Assigner"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
          {success && (
            <p className="mt-3 text-sm text-emerald-600">{success}</p>
          )}
        </div>
      </div>
    </section>
  );
}
