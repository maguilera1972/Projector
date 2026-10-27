"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Mail, Plus, Send, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";
import { rtDynamic, type ReportTranslator } from "@/lib/reports/i18n";
import { cn } from "@/lib/utils";

interface RecipientRow {
  key: string;
  userId?: string;
  name: string;
  email: string;
  locale?: Locale;
  roles: string[];
  external: boolean;
  selected: boolean;
}

interface SendReportDialogProps {
  open: boolean;
  onClose: () => void;
  t: ReportTranslator;
  /** Paramètres du rapport (query string commune aux routes /api/reports/*). */
  search: URLSearchParams;
  mailConfigured: boolean;
  pdfHref: string;
}

const MAX_RECIPIENTS = 25;
const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function SendReportDialog({ open, onClose, t, search, mailConfigured, pdfHref }: SendReportDialogProps) {
  const { t: tc } = useI18n();
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(mailConfigured);
  const [extra, setExtra] = useState("");
  const [message, setMessage] = useState("");
  const [perRecipientLocale, setPerRecipientLocale] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const searchKey = search.toString();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    fetch(`/api/reports/recipients?${searchKey}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? t("ui.error"));
          setRows([]);
          return;
        }
        setConfigured(Boolean(data.mailConfigured));
        setRows(
          (data.recipients ?? []).map(
            (item: { userId: string; name: string; email: string; locale: Locale; roles: string[] }) => ({
              key: item.userId,
              userId: item.userId,
              name: item.name,
              email: item.email,
              locale: item.locale,
              roles: item.roles,
              external: false,
              selected: true,
            }),
          ),
        );
      })
      .catch(() => !cancelled && setError(t("ui.error")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, searchKey, t]);

  const selected = useMemo(() => rows.filter((row) => row.selected), [rows]);

  if (!open) return null;

  function toggle(key: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, selected: !row.selected } : row)));
  }

  function setAll(value: boolean) {
    setRows((current) => current.map((row) => ({ ...row, selected: value })));
  }

  function remove(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function addExtra() {
    const email = extra.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError(t("ui.invalidEmail"));
      return;
    }
    setError(null);
    const existing = rows.find((row) => row.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      setRows((current) => current.map((row) => (row.key === existing.key ? { ...row, selected: true } : row)));
    } else {
      setRows((current) => [
        ...current,
        { key: `extra:${email}`, name: email, email, roles: ["added"], external: true, selected: true },
      ]);
    }
    setExtra("");
  }

  async function handleSend() {
    setError(null);
    setSuccess(null);
    if (selected.length === 0) {
      setError(t("ui.noRecipients"));
      return;
    }
    if (selected.length > MAX_RECIPIENTS) {
      setError(t("ui.tooMany", { max: MAX_RECIPIENTS }));
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(search.entries()),
          recipients: selected.map((row) => (row.userId ? { userId: row.userId } : { email: row.email })),
          message: message.trim() || undefined,
          perRecipientLocale,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "mailNotConfigured") setConfigured(false);
        setError(data.error ?? t("ui.error"));
        return;
      }
      const failed = (data.failed ?? []) as { email: string; error: string }[];
      if (failed.length > 0) {
        setError(
          t("ui.partial", {
            sent: data.sent ?? 0,
            failed: failed.length,
            errors: failed.map((item) => item.email).join(", "),
          }),
        );
      } else {
        setSuccess(t("ui.sent", { count: data.sent ?? selected.length }));
      }
    } catch {
      setError(t("ui.error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="gradient-brand flex h-9 w-9 items-center justify-center rounded-lg">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("ui.sendTitle")}</h2>
              <p className="text-sm text-brand-muted">{t("ui.recipientsHint")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={tc("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-6">
          {!configured && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{t("ui.mailNotConfigured")}</p>
                <a href={pdfHref} className="mt-1 inline-block font-semibold underline">
                  {t("ui.downloadPdf")}
                </a>
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">
                {t("ui.recipients")}{" "}
                <span className="font-normal text-brand-muted">
                  · {t("ui.selectedCount", { count: selected.length })}
                </span>
              </p>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setAll(true)} className="text-brand-indigo hover:underline">
                  {t("ui.selectAll")}
                </button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => setAll(false)} className="text-brand-indigo hover:underline">
                  {t("ui.selectNone")}
                </button>
              </div>
            </div>
            <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {loading ? (
                <p className="px-4 py-3 text-sm text-brand-muted">{t("ui.loadingRecipients")}</p>
              ) : rows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-brand-muted">{t("ui.noAssigned")}</p>
              ) : (
                rows.map((row) => (
                  <div key={row.key} className={cn("flex items-center gap-3 px-4 py-2.5", !row.selected && "opacity-60")}>
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggle(row.key)}
                      className="h-4 w-4 rounded border-slate-300 accent-[#818cf8]"
                      aria-label={row.name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {row.name}
                        {row.external && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                            {t("ui.external")}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-brand-muted">
                        {row.email}
                        {row.locale && ` · ${LOCALE_NATIVE_NAMES[row.locale]}`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.roles.map((role) => (
                          <span
                            key={role}
                            className="rounded-full border border-brand-indigo/30 bg-brand-indigo/10 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
                          >
                            {rtDynamic(t, `ui.roles.${role}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(row.key)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title={t("ui.remove")}
                      aria-label={t("ui.remove")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label htmlFor="report-extra-recipient" className="mb-1.5 block text-sm font-medium">
              {t("ui.addRecipient")}
            </label>
            <div className="flex gap-2">
              <input
                id="report-extra-recipient"
                type="email"
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addExtra();
                  }
                }}
                placeholder={t("ui.addPlaceholder")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              />
              <button
                type="button"
                onClick={addExtra}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                {t("ui.add")}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="report-message" className="mb-1.5 block text-sm font-medium">
              {t("ui.message")}
            </label>
            <textarea
              id="report-message"
              rows={3}
              maxLength={4000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("ui.messagePlaceholder")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={perRecipientLocale}
              onChange={(event) => setPerRecipientLocale(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#818cf8]"
            />
            <span>
              <span className="font-medium text-slate-900">{t("ui.perRecipientLanguage")}</span>
              <span className="block text-xs text-brand-muted">{t("ui.perRecipientLanguageHint")}</span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <a
            href={pdfHref}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("ui.downloadPdf")}
          </a>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !configured || selected.length === 0}
            className="gradient-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? t("ui.sending") : t("ui.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
