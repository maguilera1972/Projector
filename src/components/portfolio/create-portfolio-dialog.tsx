"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import type { AssigneeOption } from "@/lib/users";

interface CreatePortfolioDialogProps {
  open: boolean;
  onClose: () => void;
  defaultOwnerId?: string;
}

export function CreatePortfolioDialog({
  open,
  onClose,
  defaultOwnerId = "",
}: CreatePortfolioDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stakeholders, setStakeholders] = useState<AssigneeOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    ownerId: defaultOwnerId,
  });

  useEffect(() => {
    if (!open) return;

    setForm((current) => ({
      ...current,
      ownerId: defaultOwnerId || current.ownerId,
    }));

    fetch("/api/users")
      .then((res) => res.json())
      .then((data: { users?: AssigneeOption[] }) => {
        const list = data.users ?? [];
        setStakeholders(list);
        if (list.length > 0) {
          setForm((current) => ({
            ...current,
            ownerId: current.ownerId || list[0].id,
          }));
        }
      })
      .catch(() => setStakeholders([]));
  }, [open, defaultOwnerId]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        error?: string;
        portfolio?: { id: string };
      };

      if (!response.ok) {
        setError(data.error ?? "Création impossible.");
        return;
      }

      onClose();
      router.push(`/portfolios/${data.portfolio!.id}`);
      router.refresh();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fermer"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Nouveau portfolio
            </h2>
            <p className="text-sm text-brand-muted">
              Regroupez plusieurs projets sous une même gouvernance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="portfolio-name" className="mb-1.5 block text-sm font-medium">
              Nom du portfolio *
            </label>
            <input
              id="portfolio-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              placeholder="Ex. Transformation SI 2026"
            />
          </div>

          <div>
            <label htmlFor="portfolio-desc" className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="portfolio-desc"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              placeholder="Objectif stratégique du portfolio..."
            />
          </div>

          <div>
            <label htmlFor="portfolio-owner" className="mb-1.5 block text-sm font-medium">
              Chef de projet du portfolio *
            </label>
            <select
              id="portfolio-owner"
              required
              value={form.ownerId}
              onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
            >
              <option value="" disabled>
                Sélectionner un utilisateur
              </option>
              {stakeholders.map((stakeholder) => (
                <option key={stakeholder.id} value={stakeholder.id}>
                  {stakeholder.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-brand-muted">
              Peut assigner les tâches de tous les projets rattachés au portfolio.
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="gradient-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {loading ? "Création..." : "Créer le portfolio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
