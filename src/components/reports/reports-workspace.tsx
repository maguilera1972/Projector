"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Briefcase,
  FileDown,
  Gavel,
  Loader2,
  Mail,
  RefreshCw,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";
import { getReportTranslator, rtDynamic } from "@/lib/reports/i18n";
import {
  PROJECT_ONLY_REPORTS,
  REPORT_TYPES,
  type ReportDocument,
  type ReportType,
} from "@/lib/reports/types";
import { cn } from "@/lib/utils";
import { ReportPreview } from "./report-preview";
import { SendReportDialog } from "./send-report-dialog";

type ScopeKind = "project" | "portfolio" | "all";
type PeriodPreset = "all" | "30" | "90" | "year" | "custom";

export interface ReportsWorkspaceProps {
  uiLocale: Locale;
  projects: { id: string; name: string; portfolioId?: string }[];
  portfolios: { id: string; name: string }[];
  mailConfigured: boolean;
  initial: {
    type?: ReportType;
    scope?: ScopeKind;
    projectId?: string;
    portfolioId?: string;
    from?: string;
    to?: string;
    locale?: Locale;
  };
}

const ICONS: Record<ReportType, LucideIcon> = {
  status: Activity,
  budget: Wallet,
  decisions: Gavel,
  portfolio: Briefcase,
  resources: Users,
};

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: PeriodPreset): { from?: string; to?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (preset === "30") return { from: isoDaysAgo(30), to: today };
  if (preset === "90") return { from: isoDaysAgo(90), to: today };
  if (preset === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return {};
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20";

export function ReportsWorkspace({
  uiLocale,
  projects,
  portfolios,
  mailConfigured,
  initial,
}: ReportsWorkspaceProps) {
  const t = useMemo(() => getReportTranslator(uiLocale), [uiLocale]);
  const [type, setType] = useState<ReportType>(initial.type ?? "status");
  const [scope, setScope] = useState<ScopeKind>(initial.scope ?? "project");
  const [projectId, setProjectId] = useState(initial.projectId ?? projects[0]?.id ?? "");
  const [portfolioId, setPortfolioId] = useState(initial.portfolioId ?? portfolios[0]?.id ?? "");
  const [preset, setPreset] = useState<PeriodPreset>(initial.from || initial.to ? "custom" : "all");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [reportLocale, setReportLocale] = useState<Locale>(initial.locale ?? uiLocale);
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);

  const projectOnly = PROJECT_ONLY_REPORTS.includes(type);
  const effectiveScope: ScopeKind = projectOnly ? "project" : scope;

  const search = useMemo(() => {
    const params = new URLSearchParams({ type, scope: effectiveScope, locale: reportLocale });
    if (effectiveScope === "project" && projectId) params.set("projectId", projectId);
    if (effectiveScope === "portfolio" && portfolioId) params.set("portfolioId", portfolioId);
    const range = preset === "custom" ? { from: from || undefined, to: to || undefined } : presetRange(preset);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    return params;
  }, [type, effectiveScope, projectId, portfolioId, preset, from, to, reportLocale]);
  const searchKey = search.toString();

  const ready =
    (effectiveScope === "project" && Boolean(projectId)) ||
    (effectiveScope === "portfolio" && Boolean(portfolioId)) ||
    effectiveScope === "all";

  useEffect(() => {
    if (!ready) {
      setReport(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/reports/data?${searchKey}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? t("ui.error"));
          setReport(null);
          return;
        }
        setReport(data.report as ReportDocument);
      })
      .catch((reason) => {
        if ((reason as Error).name !== "AbortError") setError(t("ui.error"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    window.history.replaceState(null, "", `/rapports?${searchKey}`);
    return () => controller.abort();
  }, [searchKey, ready, refreshKey, t]);

  const pdfHref = `/api/reports/pdf?${searchKey}`;

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-brand-muted">
        {t("ui.noProjects")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">{t("ui.catalogTitle")}</h2>
          <p className="text-sm text-brand-muted">{t("ui.catalogHint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {REPORT_TYPES.map((item) => {
            const Icon = ICONS[item];
            const active = item === type;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setType(item);
                  if (!PROJECT_ONLY_REPORTS.includes(item) && item === "portfolio" && scope === "project") {
                    setScope(portfolios.length > 0 ? "portfolio" : "all");
                  }
                }}
                aria-pressed={active}
                className={cn(
                  "group relative flex h-full flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md",
                  active ? "border-brand-indigo ring-2 ring-brand-indigo/30" : "border-slate-200",
                )}
              >
                <div
                  className={cn(
                    "mb-3 flex h-10 w-10 items-center justify-center rounded-lg",
                    active ? "gradient-brand" : "bg-slate-100 group-hover:bg-brand-indigo/10",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-white" : "text-brand-indigo")} />
                </div>
                <p className="text-sm font-semibold text-slate-900">{rtDynamic(t, `types.${item}.name`)}</p>
                <p className="mt-1 text-xs leading-relaxed text-brand-muted">
                  {rtDynamic(t, `types.${item}.description`)}
                </p>
                <p className="mt-auto pt-3 text-[11px] font-medium text-indigo-600">
                  {PROJECT_ONLY_REPORTS.includes(item) ? t("ui.projectOnly") : t("ui.multiProject")}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("ui.filtersTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">{t("ui.scope")}</label>
            <div className="flex gap-2">
              {!projectOnly && (
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as ScopeKind)}
                  className={cn(inputClass, "w-auto")}
                >
                  <option value="project">{t("ui.scopeProject")}</option>
                  {portfolios.length > 0 && <option value="portfolio">{t("ui.scopePortfolio")}</option>}
                  <option value="all">{t("ui.scopeAll")}</option>
                </select>
              )}
              {effectiveScope === "project" && (
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={inputClass}>
                  <option value="" disabled>
                    {t("ui.selectProject")}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
              {effectiveScope === "portfolio" && (
                <select value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)} className={inputClass}>
                  <option value="" disabled>
                    {t("ui.selectPortfolio")}
                  </option>
                  {portfolios.map((portfolio) => (
                    <option key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="report-period" className="mb-1.5 block text-xs font-medium text-slate-600">
              {t("ui.period")}
            </label>
            <select
              id="report-period"
              value={preset}
              onChange={(event) => setPreset(event.target.value as PeriodPreset)}
              className={inputClass}
            >
              <option value="all">{t("ui.periodAll")}</option>
              <option value="30">{t("ui.period30")}</option>
              <option value="90">{t("ui.period90")}</option>
              <option value="year">{t("ui.periodYear")}</option>
              <option value="custom">{t("ui.periodCustom")}</option>
            </select>
          </div>

          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="report-from" className="mb-1.5 block text-xs font-medium text-slate-600">
                  {t("ui.from")}
                </label>
                <input id="report-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="report-to" className="mb-1.5 block text-xs font-medium text-slate-600">
                  {t("ui.to")}
                </label>
                <input id="report-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={inputClass} />
              </div>
            </div>
          ) : (
            <div className="hidden xl:block" />
          )}

          <div>
            <label htmlFor="report-locale" className="mb-1.5 block text-xs font-medium text-slate-600">
              {t("ui.reportLanguage")}
            </label>
            <select
              id="report-locale"
              value={reportLocale}
              onChange={(event) => setReportLocale(event.target.value as Locale)}
              className={inputClass}
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_NATIVE_NAMES[locale]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("ui.refresh")}
          </button>
          <a
            href={ready ? pdfHref : undefined}
            aria-disabled={!ready}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800",
              !ready && "pointer-events-none opacity-50",
            )}
          >
            <FileDown className="h-4 w-4" />
            {t("ui.downloadPdf")}
          </a>
          <button
            type="button"
            onClick={() => setSendOpen(true)}
            disabled={!ready || !report}
            className="gradient-brand inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            {t("ui.sendEmail")}
          </button>
          {!mailConfigured && <p className="text-xs text-amber-700">{t("ui.mailNotConfigured")}</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-muted">{t("ui.preview")}</h2>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {loading && !report && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-brand-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("ui.loading")}
          </div>
        )}
        {report && (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <ReportPreview report={report} />
          </div>
        )}
      </section>

      <SendReportDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        t={t}
        search={search}
        mailConfigured={mailConfigured}
        pdfHref={pdfHref}
      />
    </div>
  );
}
