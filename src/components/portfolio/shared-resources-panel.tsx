"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AssigneeOption } from "@/lib/users";

interface SharedResourcesPanelProps {
  portfolioId: string;
  users: AssigneeOption[];
  initialSharedIds: string[];
  canEdit: boolean;
}

export function SharedResourcesPanel({
  portfolioId,
  users,
  initialSharedIds,
  canEdit,
}: SharedResourcesPanelProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSharedIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function toggleUser(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
    setSaved(false);
  }

  async function handleSave() {
    setLoading(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/shared-resources`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: selectedIds }),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        Ressources partagées
      </h2>
      <p className="mt-1 text-sm text-brand-muted">
        Personnes mobilisables sur plusieurs projets de ce portfolio (F-07).
      </p>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {saved && (
        <p className="mt-3 text-sm text-emerald-700">Enregistré.</p>
      )}

      {users.length === 0 ? (
        <p className="mt-4 text-sm text-brand-muted">
          Aucun utilisateur actif disponible.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {users.map((user) => (
            <li key={user.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.id)}
                  disabled={!canEdit || loading}
                  onChange={() => toggleUser(user.id)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-900">{user.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {canEdit && users.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSave()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Enregistrer les ressources"}
          </button>
        </div>
      )}
    </section>
  );
}
