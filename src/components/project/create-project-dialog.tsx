"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HERMES_APPROACH_DESCRIPTIONS,
  HERMES_APPROACH_LABELS,
} from "@/lib/hermes/phases";
import type { HermesApproach, Portfolio } from "@/types";
import type { AssigneeOption } from "@/lib/users";

interface HermesScenarioOption {
  id: string;
  label: string;
  description: string;
  moduleCount: number;
}

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  defaultChefDeProjetId?: string;
  defaultPortfolioId?: string;
}

export function CreateProjectDialog({
  open,
  onClose,
  defaultChefDeProjetId = "",
  defaultPortfolioId = "",
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [scenarios, setScenarios] = useState<HermesScenarioOption[]>([]);
  const [stakeholders, setStakeholders] = useState<AssigneeOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    scenarioId: "",
    approach: "classic" as HermesApproach,
    portfolioId: defaultPortfolioId,
    mandant: "",
    mandantUserId: "",
    chefDeProjetId: defaultChefDeProjetId,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    budget: "",
    budgetHours: "",
  });

  useEffect(() => {
    if (!open) return;

    setForm((current) => ({
      ...current,
      portfolioId: defaultPortfolioId,
      chefDeProjetId: defaultChefDeProjetId || current.chefDeProjetId,
    }));

    fetch("/api/portfolios")
      .then((res) => res.json())
      .then((data: { portfolios?: Portfolio[] }) => {
        setPortfolios(data.portfolios ?? []);
      })
      .catch(() => setPortfolios([]));

    fetch("/api/hermes/scenarios")
      .then((res) => res.json())
      .then((data: { scenarios?: HermesScenarioOption[] }) => {
        const list = data.scenarios ?? [];
        setScenarios(list);
        if (list.length > 0) {
          setForm((current) => ({
            ...current,
            scenarioId: current.scenarioId || list[0].id,
          }));
        }
      })
      .catch(() => setScenarios([]));

    fetch("/api/users")
      .then((res) => res.json())
      .then((data: { users?: AssigneeOption[] }) => {
        const list = data.users ?? [];
        setStakeholders(list);
        if (list.length > 0) {
          setForm((current) => ({
            ...current,
            chefDeProjetId: current.chefDeProjetId || list[0].id,
          }));
        }
      })
      .catch(() => setStakeholders([]));
  }, [open, defaultPortfolioId, defaultChefDeProjetId]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          scenarioId: form.scenarioId,
          approach: form.approach,
          portfolioId: form.portfolioId || undefined,
          mandant:
            stakeholders.find((s) => s.id === form.mandantUserId)?.name ??
            form.mandant,
          mandantUserId: form.mandantUserId || undefined,
          chefDeProjetId: form.chefDeProjetId,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          budget: form.budget ? Number(form.budget) : undefined,
          budgetHours: form.budgetHours ? Number(form.budgetHours) : undefined,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        project?: { id: string };
      };

      if (!response.ok) {
        setError(data.error ?? "Création impossible.");
        return;
      }

      onClose();
      router.push(`/projets/${data.project!.id}`);
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
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Nouveau projet
            </h2>
            <p className="text-sm text-brand-muted">
              Conforme à la méthode HERMES 5.1
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
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
              Nom du projet *
            </label>
            <input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              placeholder="Ex. Migration infrastructure SI"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1.5 block text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              placeholder="Objectif et contexte du projet..."
            />
          </div>

          {scenarios.length > 0 && (
            <div>
              <label
                htmlFor="scenarioId"
                className="mb-1.5 block text-sm font-medium"
              >
                Scénario HERMES 5.1 *
              </label>
              <select
                id="scenarioId"
                required
                value={form.scenarioId}
                onChange={(e) =>
                  setForm({ ...form, scenarioId: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              {form.scenarioId && (
                <p className="mt-1.5 text-xs text-brand-muted">
                  {
                    scenarios.find((s) => s.id === form.scenarioId)
                      ?.description
                  }
                </p>
              )}
            </div>
          )}

          {portfolios.length > 0 && (
            <div>
              <label
                htmlFor="portfolioId"
                className="mb-1.5 block text-sm font-medium"
              >
                Portfolio
              </label>
              <select
                id="portfolioId"
                value={form.portfolioId}
                onChange={(e) =>
                  setForm({ ...form, portfolioId: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              >
                <option value="">— Aucun portfolio —</option>
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Approche HERMES 5.1 *</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["classic", "agile"] as HermesApproach[]).map((approach) => (
                <button
                  key={approach}
                  type="button"
                  onClick={() => setForm({ ...form, approach })}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all",
                    form.approach === approach
                      ? "border-brand-indigo bg-brand-indigo/5 ring-2 ring-brand-indigo/20"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {HERMES_APPROACH_LABELS[approach]}
                  </p>
                  <p className="mt-1 text-xs text-brand-muted">
                    {HERMES_APPROACH_DESCRIPTIONS[approach]}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="mandantUserId"
                className="mb-1.5 block text-sm font-medium"
              >
                Mandant (utilisateur) *
              </label>
              <select
                id="mandantUserId"
                required
                value={form.mandantUserId}
                onChange={(e) =>
                  setForm({ ...form, mandantUserId: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              >
                <option value="" disabled>
                  Sélectionner le mandant
                </option>
                {stakeholders.map((stakeholder) => (
                  <option key={stakeholder.id} value={stakeholder.id}>
                    {stakeholder.name} ({stakeholder.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-brand-muted">
                Cet utilisateur pourra valider le budget et confirmer les phases.
              </p>
            </div>
            <div>
              <label
                htmlFor="chefDeProjetId"
                className="mb-1.5 block text-sm font-medium"
              >
                Chef de projet *
              </label>
              <select
                id="chefDeProjetId"
                required
                value={form.chefDeProjetId}
                onChange={(e) =>
                  setForm({ ...form, chefDeProjetId: e.target.value })
                }
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
                Seul le chef de projet pourra assigner les tâches du projet.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="mb-1.5 block text-sm font-medium"
              >
                Date de début *
              </label>
              <input
                id="startDate"
                type="date"
                required
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              />
            </div>
            <div>
              <label
                htmlFor="endDate"
                className="mb-1.5 block text-sm font-medium"
              >
                Date de fin prévue
              </label>
              <input
                id="endDate"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="budget" className="mb-1.5 block text-sm font-medium">
                Budget estimé (CHF)
              </label>
              <input
                id="budget"
                type="number"
                min="0"
                step="1000"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                placeholder="Validation mandant requise"
              />
            </div>
            <div>
              <label
                htmlFor="budgetHours"
                className="mb-1.5 block text-sm font-medium"
              >
                Carnet d&apos;heures forfaitaires
              </label>
              <input
                id="budgetHours"
                type="number"
                min="0"
                step="8"
                value={form.budgetHours}
                onChange={(e) =>
                  setForm({ ...form, budgetHours: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                placeholder="Heures forfait"
              />
            </div>
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
              {loading ? "Création..." : "Créer le projet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
