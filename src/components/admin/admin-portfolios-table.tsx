"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PORTFOLIO_STATUS_LABELS, type Portfolio } from "@/types";

interface AdminPortfoliosTableProps {
  portfolios: Portfolio[];
  projectCounts: Record<string, number>;
}

export function AdminPortfoliosTable({
  portfolios,
  projectCounts,
}: AdminPortfoliosTableProps) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rows = useMemo(
    () => portfolios.filter((portfolio) => !hiddenIds.has(portfolio.id)),
    [portfolios, hiddenIds],
  );

  async function handleDelete(portfolio: Portfolio) {
    const count = projectCounts[portfolio.id] ?? 0;
    const projectWarning =
      count > 0
        ? `\n\n${count} projet${count > 1 ? "s" : ""} associé${count > 1 ? "s" : ""} sera${count > 1 ? "ont" : ""} également supprimé${count > 1 ? "s" : ""} (tâches incluses).`
        : "";

    const confirmed = window.confirm(
      `Supprimer définitivement le portfolio « ${portfolio.name} » ?${projectWarning}\n\nCette action est irréversible.`,
    );

    if (!confirmed) return;

    setError("");
    setDeletingId(portfolio.id);

    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(portfolio.id);
      return next;
    });

    try {
      const response = await fetch(`/api/portfolios/${portfolio.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? ((await response.json()) as { error?: string })
        : { error: `Réponse inattendue (${response.status}).` };

      if (!response.ok && response.status !== 404) {
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(portfolio.id);
          return next;
        });
        setError(data.error ?? "Suppression impossible.");
        return;
      }

      router.refresh();
    } catch {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(portfolio.id);
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
        Aucun portfolio enregistré.
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
              <th className="px-6 py-4 font-semibold text-slate-700">
                Portfolio
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Statut
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Responsable
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                Projets
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
            {rows.map((portfolio) => (
              <tr key={portfolio.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-medium text-slate-900">
                  {portfolio.name}
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant={portfolio.status === "actif" ? "default" : "muted"}
                  >
                    {PORTFOLIO_STATUS_LABELS[portfolio.status]}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {portfolio.owner}
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {projectCounts[portfolio.id] ?? 0}
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {formatDate(portfolio.createdAt)}
                </td>
                <td className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => void handleDelete(portfolio)}
                    disabled={deletingId === portfolio.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === portfolio.id ? "Suppression..." : "Supprimer"}
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
