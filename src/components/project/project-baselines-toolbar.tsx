"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ProjectBaseline } from "@/types";

interface ProjectBaselinesToolbarProps {
  projectId: string;
  baselines: ProjectBaseline[];
  selectedBaselineId: string | null;
  onSelectBaseline: (id: string | null) => void;
  canEdit: boolean;
}

export function ProjectBaselinesToolbar({
  projectId,
  baselines,
  selectedBaselineId,
  onSelectBaseline,
  canEdit,
}: ProjectBaselinesToolbarProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function captureBaseline() {
    const trimmed = name.trim() || `Baseline ${baselines.length + 1}`;
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = (await response.json()) as {
        error?: string;
        baseline?: ProjectBaseline;
      };

      if (!response.ok) {
        setError(data.error ?? "Capture impossible.");
        return;
      }

      setName("");
      if (data.baseline) {
        onSelectBaseline(data.baseline.id);
      }
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function removeBaseline(id: string) {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/project-baselines/${id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Suppression impossible.");
        return;
      }

      if (selectedBaselineId === id) {
        onSelectBaseline(null);
      }
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-brand-muted">
            Baseline de référence
          </label>
          <select
            value={selectedBaselineId ?? ""}
            onChange={(e) =>
              onSelectBaseline(e.target.value ? e.target.value : null)
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">— Aucune comparaison —</option>
            {baselines.map((baseline) => (
              <option key={baseline.id} value={baseline.id}>
                {baseline.name} ({formatDate(baseline.createdAt.slice(0, 10))})
              </option>
            ))}
          </select>
        </div>

        {canEdit && (
          <>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-brand-muted">
                Nom (optionnel)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Baseline ${baselines.length + 1}`}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void captureBaseline()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Capturer l&apos;état actuel
            </button>
          </>
        )}

        {canEdit && selectedBaselineId && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void removeBaseline(selectedBaselineId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      <p className="mt-2 text-xs text-brand-muted">
        Une baseline fige les dates et l&apos;avancement planifiés. Comparez le
        plan actuel pour mesurer les écarts (planifié vs réel).
      </p>
    </div>
  );
}
