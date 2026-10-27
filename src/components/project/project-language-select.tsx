"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";

interface ProjectLanguageSelectProps {
  projectId: string;
  value: Locale;
  canEdit: boolean;
}

export function ProjectLanguageSelect({ projectId, value, canEdit }: ProjectLanguageSelectProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [current, setCurrent] = useState<Locale>(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!canEdit) {
    return <span className="font-medium text-slate-900">{LOCALE_NATIVE_NAMES[value]}</span>;
  }

  async function handleChange(next: Locale) {
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentLocale: next }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setCurrent(previous);
        setMessage({ ok: false, text: data.error ?? t("common.unknownError") });
        return;
      }
      setMessage({ ok: true, text: t("projects.languageUpdated") });
      router.refresh();
    } catch {
      setCurrent(previous);
      setMessage({ ok: false, text: t("common.networkError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <select
        value={current}
        disabled={saving}
        onChange={(event) => void handleChange(event.target.value as Locale)}
        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo disabled:opacity-60"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NATIVE_NAMES[code]}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-brand-muted">{t("projects.languageHelp")}</p>
      {message && (
        <p className={`mt-1 text-xs ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
