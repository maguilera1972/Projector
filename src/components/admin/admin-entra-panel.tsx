"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES, type UserRole } from "@/lib/auth/permissions";
import { useI18n } from "@/lib/i18n/client";
import { toIntlLocale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import type {
  AuditLogEntry,
  EntraMappingType,
  EntraSettings,
  EntraUnknownUserPolicy,
} from "@/types";

interface AdminEntraPanelProps {
  enabled: boolean;
  redirectUri: string;
  settings: EntraSettings;
  auditLog: AuditLogEntry[];
}

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo";

export function AdminEntraPanel({ enabled, redirectUri, settings, auditLog }: AdminEntraPanelProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [policy, setPolicy] = useState<EntraUnknownUserPolicy>(settings.unknownUserPolicy);
  const [form, setForm] = useState({
    type: "appRole" as EntraMappingType,
    value: "",
    label: "",
    role: "user" as UserRole,
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function request(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setFeedback({ ok: false, text: data.error ?? t("common.unknownError") });
        return false;
      }
      setFeedback({ ok: true, text: t("entra.saved") });
      router.refresh();
      return true;
    } catch {
      setFeedback({ ok: false, text: t("common.networkError") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changePolicy(next: EntraUnknownUserPolicy) {
    const previous = policy;
    setPolicy(next);
    const ok = await request("/api/admin/entra", {
      method: "PATCH",
      body: JSON.stringify({ unknownUserPolicy: next }),
    });
    if (!ok) setPolicy(previous);
  }

  async function addMapping(event: React.FormEvent) {
    event.preventDefault();
    const ok = await request("/api/admin/entra/mappings", {
      method: "POST",
      body: JSON.stringify(form),
    });
    if (ok) setForm((current) => ({ ...current, value: "", label: "" }));
  }

  const formatDateTime = (iso: string) =>
    new Intl.DateTimeFormat(toIntlLocale(locale), {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Zurich",
    }).format(new Date(iso));

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <KeyRound className="h-5 w-5 text-brand-indigo" />
          {t("entra.title")}
        </h2>
        <p className={`mt-1 text-sm ${enabled ? "text-emerald-700" : "text-amber-700"}`}>
          {enabled ? t("entra.configured") : t("entra.notConfigured")}
        </p>
        <p className="mt-2 text-xs text-brand-muted">
          {t("entra.redirectUri")}{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{redirectUri}</code>
        </p>
        <p className="mt-2 max-w-3xl text-xs text-brand-muted">{t("entra.precedence")}</p>
      </div>

      <div className="space-y-6 px-6 py-5">
        <label className="block max-w-md text-sm">
          <span className="font-medium text-slate-700">{t("entra.unknownPolicy")}</span>
          <select
            value={policy}
            disabled={busy}
            onChange={(e) => void changePolicy(e.target.value as EntraUnknownUserPolicy)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="pending">{t("entra.policyPending")}</option>
            <option value="deny">{t("entra.policyDeny")}</option>
          </select>
        </label>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("entra.mappingsTitle")}</h3>
          <p className="mt-1 max-w-3xl text-xs text-brand-muted">{t("entra.mappingsHelp")}</p>

          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 font-semibold text-slate-700">{t("entra.mappingType")}</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">{t("entra.mappingValue")}</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">{t("entra.mappingLabel")}</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">{t("entra.mappingRole")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settings.mappings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-brand-muted">
                      {t("entra.noMappings")}
                    </td>
                  </tr>
                )}
                {settings.mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="px-4 py-2 text-brand-muted">
                      {mapping.type === "appRole" ? t("entra.typeAppRole") : t("entra.typeGroup")}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-800">{mapping.value}</td>
                    <td className="px-4 py-2 text-brand-muted">{mapping.label ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={mapping.role === "admin" ? "default" : "muted"}>
                        {tDynamic(t, `enums.role.${mapping.role}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void request(`/api/admin/entra/mappings/${mapping.id}`, {
                            method: "DELETE",
                          })
                        }
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={addMapping} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_1fr_10rem_auto]">
            <select
              value={form.type}
              onChange={(e) => setForm((c) => ({ ...c, type: e.target.value as EntraMappingType }))}
              className={inputClass}
              aria-label={t("entra.mappingType")}
            >
              <option value="appRole">{t("entra.typeAppRole")}</option>
              <option value="group">{t("entra.typeGroup")}</option>
            </select>
            <input
              required
              value={form.value}
              onChange={(e) => setForm((c) => ({ ...c, value: e.target.value }))}
              placeholder={t("entra.mappingValuePlaceholder")}
              className={inputClass}
              aria-label={t("entra.mappingValue")}
            />
            <input
              value={form.label}
              onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))}
              placeholder={t("entra.mappingLabel")}
              className={inputClass}
              aria-label={t("entra.mappingLabel")}
            />
            <select
              value={form.role}
              onChange={(e) => setForm((c) => ({ ...c, role: e.target.value as UserRole }))}
              className={inputClass}
              aria-label={t("entra.mappingRole")}
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {tDynamic(t, `enums.role.${role}`)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {t("entra.addMapping")}
            </button>
          </form>

          {feedback && (
            <p
              className={`mt-2 text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}
            >
              {feedback.text}
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("entra.auditTitle")}</h3>
          {auditLog.length === 0 ? (
            <p className="mt-2 text-xs text-brand-muted">{t("entra.auditEmpty")}</p>
          ) : (
            <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 text-xs">
              {auditLog.map((entry) => {
                const details = entry.details as Record<string, unknown>;
                const extra = [
                  typeof details.email === "string" ? details.email : null,
                  typeof details.from === "string" && typeof details.to === "string"
                    ? `${tDynamic(t, `enums.role.${details.from}`)} → ${tDynamic(t, `enums.role.${details.to}`)}`
                    : typeof details.role === "string"
                      ? tDynamic(t, `enums.role.${details.role}`)
                      : null,
                  typeof details.reason === "string" ? details.reason : null,
                  typeof details.source === "string" ? details.source : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                    <span className="text-slate-400">{formatDateTime(entry.createdAt)}</span>
                    <span className="font-medium text-slate-800">
                      {tDynamic(t, `entra.audit_${entry.action.replace(/\./g, "_")}`)}
                    </span>
                    <span className="text-brand-muted">{entry.actorName}</span>
                    {extra && <span className="text-slate-500">{extra}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
