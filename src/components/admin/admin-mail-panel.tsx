"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

interface AdminMailPanelProps {
  sender: string | null;
}

export function AdminMailPanel({ sender }: AdminMailPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendTest() {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/mail/test", { method: "POST" });
      const data = (await response.json()) as { message?: string; error?: string };
      setFeedback({
        ok: response.ok,
        text: response.ok ? data.message ?? "" : data.error ?? t("common.unknownError"),
      });
    } catch {
      setFeedback({ ok: false, text: t("common.networkError") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Mail className="h-5 w-5 text-brand-indigo" />
            {t("admin.mailTitle")}
          </h2>
          <p className={`mt-1 text-sm ${sender ? "text-emerald-700" : "text-amber-700"}`}>
            {sender ? t("admin.mailConfigured", { sender }) : t("admin.mailNotConfigured")}
          </p>
        </div>
        {sender && (
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("admin.mailTest")}
          </button>
        )}
      </div>
      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
