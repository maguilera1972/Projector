"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HermesApproach, Portfolio } from "@/types";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import type { AssigneeOption } from "@/lib/users";
import { getIntegrationTranslator } from "@/lib/integrations/i18n";

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
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [scenarios, setScenarios] = useState<HermesScenarioOption[]>([]);
  const [stakeholders, setStakeholders] = useState<AssigneeOption[]>([]);
  const [initialFiles, setInitialFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const it = useMemo(() => getIntegrationTranslator(locale), [locale]);
  const [teamsAvailable, setTeamsAvailable] = useState(false);
  const [createTeams, setCreateTeams] = useState(false);
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
    documentLocale: locale as Locale,
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

    fetch("/api/integrations/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { usable?: { workspaces?: boolean } } | null) => {
        setTeamsAvailable(Boolean(data?.usable?.workspaces));
      })
      .catch(() => setTeamsAvailable(false));
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
          documentLocale: form.documentLocale,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        project?: { id: string };
      };

      if (!response.ok) {
        setError(data.error ?? t("projectForm.failed"));
        return;
      }

      const projectId = data.project!.id;
      for (const [index, file] of initialFiles.entries()) {
        setUploadProgress(
          t("annexes.uploadingInitial", { done: index + 1, total: initialFiles.length }),
        );
        const upload = new FormData();
        upload.set("file", file);
        upload.set("category", "autre");
        await fetch(`/api/projects/${projectId}/annexes`, { method: "POST", body: upload }).catch(
          () => undefined,
        );
      }
      setUploadProgress("");
      setInitialFiles([]);

      if (teamsAvailable && createTeams) {
        setUploadProgress(it("workspace.creating"));
        const teamsResponse = await fetch(`/api/projects/${projectId}/teams/workspace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "team" }),
        }).catch(() => null);
        setUploadProgress("");
        if (!teamsResponse?.ok) {
          const teamsData = (await teamsResponse?.json().catch(() => ({}))) as { error?: string } | undefined;
          window.alert(it("workspace.creationFailed", { error: teamsData?.error ?? t("common.networkError") }));
        }
      }

      onClose();
      router.push(`/projets/${projectId}`);
      router.refresh();
    } catch {
      setError(t("common.networkError"));
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
        aria-label={t("common.close")}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("projectForm.title")}
            </h2>
            <p className="text-sm text-brand-muted">
              {t("projectForm.subtitle")}
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
              {t("projectForm.name")}
            </label>
            <input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              placeholder={t("projectForm.namePlaceholder")}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1.5 block text-sm font-medium"
            >
              {t("projectForm.description")}
            </label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              placeholder={t("projectForm.descriptionPlaceholder")}
            />
          </div>

          {scenarios.length > 0 && (
            <div>
              <label
                htmlFor="scenarioId"
                className="mb-1.5 block text-sm font-medium"
              >
                {t("projectForm.scenario")}
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
                {t("projectForm.portfolio")}
              </label>
              <select
                id="portfolioId"
                value={form.portfolioId}
                onChange={(e) =>
                  setForm({ ...form, portfolioId: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              >
                <option value="">{t("projectForm.noPortfolio")}</option>
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">{t("projectForm.approach")}</p>
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
                    {tDynamic(t, `enums.approach.${approach}`)}
                  </p>
                  <p className="mt-1 text-xs text-brand-muted">
                    {tDynamic(t, `enums.approachDescription.${approach}`)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="documentLocale"
              className="mb-1.5 block text-sm font-medium"
            >
              {t("projects.language")}
            </label>
            <select
              id="documentLocale"
              value={form.documentLocale}
              onChange={(e) =>
                setForm({ ...form, documentLocale: e.target.value as Locale })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_NATIVE_NAMES[code]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-brand-muted">{t("projects.languageHelp")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="mandantUserId"
                className="mb-1.5 block text-sm font-medium"
              >
                {t("projectForm.mandant")}
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
                  {t("projectForm.selectMandant")}
                </option>
                {stakeholders.map((stakeholder) => (
                  <option key={stakeholder.id} value={stakeholder.id}>
                    {stakeholder.name} ({stakeholder.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-brand-muted">
                {t("projectForm.mandantHelp")}
              </p>
            </div>
            <div>
              <label
                htmlFor="chefDeProjetId"
                className="mb-1.5 block text-sm font-medium"
              >
                {t("projectForm.chef")}
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
                  {t("projectForm.selectUser")}
                </option>
                {stakeholders.map((stakeholder) => (
                  <option key={stakeholder.id} value={stakeholder.id}>
                    {stakeholder.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-brand-muted">
                {t("projectForm.chefHelp")}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="mb-1.5 block text-sm font-medium"
              >
                {t("projectForm.startDate")}
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
                {t("projectForm.endDate")}
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
                {t("projectForm.budget")}
              </label>
              <input
                id="budget"
                type="number"
                min="0"
                step="1000"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                placeholder={t("projectForm.budgetPlaceholder")}
              />
            </div>
            <div>
              <label
                htmlFor="budgetHours"
                className="mb-1.5 block text-sm font-medium"
              >
                {t("projectForm.hours")}
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
                placeholder={t("projectForm.hoursPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="initialAnnexes" className="mb-1.5 block text-sm font-medium">
              {t("annexes.initialDocs")}
            </label>
            <input
              id="initialAnnexes"
              type="file"
              multiple
              onChange={(e) => setInitialFiles(Array.from(e.target.files ?? []))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-brand-muted">{t("annexes.initialDocsHelp")}</p>
            {uploadProgress && (
              <p className="mt-1 text-xs font-medium text-brand-indigo">{uploadProgress}</p>
            )}
          </div>

          {teamsAvailable && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={createTeams}
                onChange={(e) => setCreateTeams(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-700">{it("workspace.createAtCreation")}</span>
                <span className="mt-0.5 block text-xs text-brand-muted">{it("workspace.createAtCreationHint")}</span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="gradient-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {loading ? t("projectForm.submitting") : t("projectForm.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
