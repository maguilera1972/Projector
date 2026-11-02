"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { getIntegrationTranslator, itDynamic } from "@/lib/integrations/i18n";
import type { CapabilityReport, FeatureCapability } from "@/lib/integrations/capabilities";
import type { JobsReport } from "@/lib/integrations/jobs";
import { readApiResponse } from "@/lib/integrations/client-response";
import { formatDate } from "@/lib/utils";
import {
  INTEGRATION_FEATURES,
  type GraphConnectorState,
  type IntegrationFeature,
  type IntegrationSettings,
} from "@/types";

interface Snapshot {
  settings: IntegrationSettings;
  capabilities: CapabilityReport;
  conversations: { total: number; personal: number; channel: number };
}

type Feedback = { ok: boolean; text: string } | null;

const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

function StatusBadge({ capability, it }: { capability: FeatureCapability; it: ReturnType<typeof getIntegrationTranslator> }) {
  const reason = capability.usable ? "usable" : (capability.reason ?? "disabled");
  const styles: Record<string, string> = {
    usable: "bg-emerald-50 text-emerald-700",
    disabled: "bg-slate-100 text-slate-600",
    missing_roles: "bg-amber-50 text-amber-800",
    not_configured: "bg-red-50 text-red-700",
    bot_token: "bg-amber-50 text-amber-800",
    probe_failed: "bg-red-50 text-red-700",
  };
  const labels: Record<string, string> = {
    usable: it("admin.statusUsable"),
    disabled: it("admin.statusDisabled"),
    missing_roles: it("admin.statusMissingRoles"),
    not_configured: it("admin.statusNotConfigured"),
    bot_token: it("admin.statusBotToken"),
    probe_failed: it("admin.statusProbeFailed"),
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[reason]}`}>{labels[reason]}</span>;
}

export function AdminTeamsPanel() {
  const { t, locale } = useI18n();
  const it = useMemo(() => getIntegrationTranslator(locale), [locale]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connector, setConnector] = useState<GraphConnectorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [catalogId, setCatalogId] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/integrations${force ? "?force=1" : ""}`);
      if (response.ok) {
        const data = (await response.json()) as Snapshot;
        setSnapshot(data);
        setConnector(data.settings.connector);
        setCatalogId(data.settings.teamsAppCatalogId ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, url: string, init: RequestInit, describe?: (data: Record<string, unknown>) => string) {
    setBusy(key);
    setFeedback(null);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = await readApiResponse<Record<string, unknown>>(response);
      const data = result.data as Record<string, unknown>;
      if (!result.ok) {
        setFeedback({
          ok: false,
          text: it("admin.actionFailed", { status: result.status, error: result.error ?? t("common.unknownError") }),
        });
      } else {
        setFeedback({
          ok: true,
          text: describe ? describe(data) : typeof data.message === "string" ? data.message : JSON.stringify(data),
        });
      }
      if (data.state) setConnector(data.state as GraphConnectorState);
      if (data.settings) setSnapshot(data as unknown as Snapshot);
      return data;
    } catch {
      setFeedback({ ok: false, text: t("common.networkError") });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const patch = (body: object) =>
    run("patch", "/api/admin/integrations", { method: "PATCH", body: JSON.stringify(body) });

  const connectorAction = (action: string) =>
    run(`connector-${action}`, "/api/admin/integrations/connector", {
      method: "POST",
      body: JSON.stringify({ action }),
    });

  const jobsSummary = (data: Record<string, unknown>) => {
    const report = data.report as JobsReport;
    return it("admin.jobsDone", {
      ms: report.durationMs,
      overdue: report.overdueNotifications,
      weather: report.weatherChanges.length,
      alerts: report.weatherAlertsPosted,
      weekly: report.weeklySummary.posted,
    }) + (report.errors.length ? ` ⚠ ${report.errors.join(" ; ")}` : "");
  };

  if (!snapshot) {
    return (
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm text-brand-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> {it("admin.checking")}
        </p>
      </section>
    );
  }

  const { capabilities, settings, conversations } = snapshot;
  const connectorState = connector ?? settings.connector;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-[#5b5fc7]" />
            {it("admin.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-brand-muted">{it("admin.description")}</p>
          <p className="mt-1 text-xs text-brand-muted">{it("admin.docHint")}</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading} className={buttonClass}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? it("admin.checking") : it("admin.refresh")}
        </button>
      </div>

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold text-slate-900">{it("admin.registration")}</h3>
          {!capabilities.configured ? (
            <p className="text-red-700">{it("admin.notConfigured")}</p>
          ) : (
            <>
              <p>
                <span className="text-brand-muted">{it("admin.clientId")} : </span>
                <code className="text-xs">{capabilities.clientId}</code>
              </p>
              <p>
                <span className="text-brand-muted">{it("admin.tenantId")} : </span>
                <code className="text-xs">{capabilities.tenantId}</code>
              </p>
              <p className={capabilities.tokenError ? "text-red-700" : "text-emerald-700"}>
                {capabilities.tokenError
                  ? it("admin.tokenError", { error: capabilities.tokenError })
                  : it("admin.tokenOk")}
              </p>
              {capabilities.token?.issuedAt && (
                <p className="text-xs text-brand-muted">
                  {it("admin.tokenIssued", {
                    issued: new Date(capabilities.token.issuedAt).toLocaleString(locale),
                    expires: capabilities.token.expiresAt ? new Date(capabilities.token.expiresAt).toLocaleString(locale) : "—",
                    checked: new Date(capabilities.token.checkedAt).toLocaleString(locale),
                  })}
                </p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-brand-muted">
                  {it("admin.rolesToggle", { count: capabilities.roles.length })}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {capabilities.roles.length === 0 && <span className="text-xs">{it("admin.noRoles")}</span>}
                  {capabilities.roles.map((role) => (
                    <code key={role} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                      {role}
                    </code>
                  ))}
                </div>
              </details>
              <p className="text-xs text-brand-muted">{it("admin.consentHint")}</p>
            </>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <Bot className="h-4 w-4" /> {it("admin.botTitle")}
          </h3>
          <p className={capabilities.bot.tokenOk ? "text-emerald-700" : "text-amber-700"}>
            {capabilities.bot.tokenOk
              ? it("admin.botOk", { endpoint: `${window.location.origin}/api/teams/messages` })
              : it("admin.botKo", { error: capabilities.bot.error ?? "" })}
          </p>
          <p className="text-xs text-brand-muted">{it("admin.botHint")}</p>
          <p className="text-xs">{it("admin.conversations", { count: conversations.total })}</p>

          <h3 className="pt-2 font-semibold text-slate-900">{it("admin.teamsApp")}</h3>
          <p>
            <span className="text-brand-muted">{it("admin.teamsAppId")} : </span>
            <code className="text-xs">{capabilities.teamsAppId}</code>
          </p>
          <p className="text-brand-muted">{it("admin.catalogId")}</p>
          {!capabilities.teamsAppCatalogId && <p className="text-xs text-amber-700">{it("admin.catalogUnknown")}</p>}
          <div className="flex flex-wrap gap-2">
            <input
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              placeholder={it("admin.catalogPlaceholder")}
              className="w-72 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void patch({ teamsAppCatalogId: catalogId })}
              className={buttonClass}
            >
              {it("admin.saveCatalog")}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run("discover", "/api/admin/integrations/test", {
                  method: "POST",
                  body: JSON.stringify({ action: "discoverCatalog" }),
                }).then(() => load())
              }
              className={buttonClass}
            >
              {it("admin.discoverCatalog")}
            </button>
          </div>
          <p>
            <span className="text-brand-muted">{it("admin.organizer")} : </span>
            {capabilities.meetingOrganizer ?? it("admin.none")}
          </p>
          <p className="text-brand-muted">{it("admin.copilotAudiences")}</p>
          <div className="flex flex-wrap gap-1">
            {capabilities.copilotAudiences.map((audience) => (
              <code key={audience} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                {audience}
              </code>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-6 py-5">
        <h3 className="mb-3 font-semibold text-slate-900">{it("admin.featuresTitle")}</h3>
        <ul className="divide-y divide-slate-100">
          {INTEGRATION_FEATURES.map((feature: IntegrationFeature) => {
            const capability = capabilities.features[feature];
            return (
              <li key={feature} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="max-w-2xl">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {capability.usable ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-slate-400" />
                    )}
                    {itDynamic(it, `features.${feature}.label`)}
                    <StatusBadge capability={capability} it={it} />
                  </p>
                  <p className="mt-0.5 text-xs text-brand-muted">{itDynamic(it, `features.${feature}.description`)}</p>
                  {capability.requirements
                    .filter((requirement) => requirement.satisfiedBy)
                    .map((requirement) => (
                      <p key={requirement.anyOf[0]} className="mt-0.5 text-[11px] text-emerald-700">
                        ✓ {requirement.anyOf[0]}
                        {requirement.satisfiedBy !== requirement.anyOf[0] &&
                          ` (${it("admin.satisfiedBy", { role: requirement.satisfiedBy ?? "" })})`}
                      </p>
                    ))}
                  {capability.requirements
                    .filter((requirement) => !requirement.satisfiedBy)
                    .map((requirement) => (
                      <p key={requirement.anyOf[0]} className="mt-1 text-xs text-amber-800">
                        {it("admin.missingRoles", { roles: requirement.anyOf[0] })}
                        {requirement.anyOf.length > 1 && (
                          <span className="block text-[11px] text-brand-muted">
                            {it("admin.equivalents", { roles: requirement.anyOf.slice(1).join(", ") })}
                          </span>
                        )}
                      </p>
                    ))}
                  {capability.probe && (
                    <p className={`mt-1 text-[11px] ${capability.probe.ok ? "text-emerald-700" : "text-red-700"}`}>
                      {capability.probe.ok
                        ? it("admin.probeOk", { call: capability.probe.call })
                        : it("admin.probeFailed", { call: capability.probe.call, detail: capability.probe.detail ?? "" })}
                    </p>
                  )}
                  {capability.missingOptionalRoles.length > 0 && (
                    <p className="mt-1 text-xs text-brand-muted">
                      {it("admin.optionalMissing", { roles: capability.missingOptionalRoles.join(", ") })}
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.features[feature]}
                    disabled={busy !== null}
                    onChange={(e) => void patch({ features: { [feature]: e.target.checked } })}
                  />
                  {it("admin.enable")}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-slate-100 px-6 py-5">
        <h3 className="mb-3 font-semibold text-slate-900">{it("admin.actionsTitle")}</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run("activity", "/api/admin/integrations/test", {
                method: "POST",
                body: JSON.stringify({ action: "activity" }),
              })
            }
            className={buttonClass}
          >
            {busy === "activity" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {it("admin.testActivity")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm(it("admin.installAllConfirm"))) return;
              void run("installAll", "/api/admin/integrations/test", {
                method: "POST",
                body: JSON.stringify({ action: "installAll" }),
              });
            }}
            className={buttonClass}
          >
            {busy === "installAll" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {it("admin.installAll")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run("meeting", "/api/admin/integrations/test", {
                method: "POST",
                body: JSON.stringify({ action: "meeting" }),
              })
            }
            className={buttonClass}
          >
            {busy === "meeting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {it("admin.testMeeting")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run("jobs", "/api/admin/integrations/jobs", { method: "POST", body: "{}" }, jobsSummary)
            }
            className={buttonClass}
          >
            {busy === "jobs" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {it("admin.runJobs")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run(
                "jobsWeekly",
                "/api/admin/integrations/jobs",
                { method: "POST", body: JSON.stringify({ forceWeekly: true }) },
                jobsSummary,
              )
            }
            className={buttonClass}
          >
            {busy === "jobsWeekly" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {it("admin.runJobsWeekly")}
          </button>
        </div>
        {settings.lastJobRunAt && (
          <p className="mt-2 text-xs text-brand-muted">
            {it("admin.lastJob", { date: new Date(settings.lastJobRunAt).toLocaleString(locale) })}
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 px-6 py-5 text-sm">
        <h3 className="mb-2 font-semibold text-slate-900">
          {it("admin.connectorTitle", { id: connectorState.connectionId })}
        </h3>
        <p>
          {it("admin.connectorSchema", {
            status: itDynamic(it, `admin.schema.${connectorState.schemaStatus}`),
          })}
          {connectorState.schemaError && <span className="ml-2 text-red-700">{connectorState.schemaError}</span>}
        </p>
        <p className="text-xs text-brand-muted">
          {it("admin.connectorItems", { count: connectorState.itemIds.length })}
        </p>
        {connectorState.lastSyncAt && connectorState.lastSyncResult && (
          <p className="text-xs text-brand-muted">
            {it("admin.connectorLastSync", {
              date: formatDate(connectorState.lastSyncAt, locale),
              upserted: connectorState.lastSyncResult.upserted,
              deleted: connectorState.lastSyncResult.deleted,
            })}
            {connectorState.lastSyncResult.errors.length > 0 && (
              <span className="ml-1 text-amber-700">⚠ {connectorState.lastSyncResult.errors.slice(0, 3).join(" ; ")}</span>
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["setup", "refreshSchema", "sync", "syncFull"] as const).map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy !== null}
              onClick={() => void connectorAction(action)}
              className={buttonClass}
            >
              {busy === `connector-${action}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {action === "setup"
                ? it("admin.connectorSetup")
                : action === "refreshSchema"
                  ? it("admin.connectorRefresh")
                  : action === "sync"
                    ? it("admin.connectorSync")
                    : it("admin.connectorSyncFull")}
            </button>
          ))}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(it("admin.connectorDeleteConfirm"))) void connectorAction("delete");
            }}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
          >
            {it("admin.connectorDelete")}
          </button>
        </div>
      </div>

      {feedback && (
        <p
          className={`mx-6 mb-5 rounded-lg px-3 py-2 text-sm ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
