"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Globe, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  variant?: "sidebar" | "light";
  className?: string;
}

export function LanguageSwitcher({ variant = "sidebar", className }: LanguageSwitcherProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function changeLocale(next: Locale) {
    if (next === locale) return;
    setSaving(true);
    try {
      await fetch("/api/i18n/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } finally {
      setSaving(false);
    }
    startTransition(() => router.refresh());
  }

  const busy = saving || pending;

  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        variant === "sidebar"
          ? "bg-white/5 text-slate-300"
          : "border border-slate-200 bg-white text-slate-700",
        className,
      )}
      title={t("header.changeLanguage")}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Globe className="h-4 w-4 shrink-0" />
      )}
      <span className="sr-only">{t("header.changeLanguage")}</span>
      <select
        value={locale}
        disabled={busy}
        onChange={(event) => void changeLocale(event.target.value as Locale)}
        aria-label={t("header.changeLanguage")}
        className={cn(
          "w-full cursor-pointer appearance-none bg-transparent text-sm font-medium outline-none disabled:cursor-wait",
          variant === "sidebar" ? "text-slate-200" : "text-slate-800",
        )}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="text-slate-900">
            {LOCALE_NATIVE_NAMES[code]}
          </option>
        ))}
      </select>
      <span className="text-[10px] font-semibold uppercase text-slate-500">{locale}</span>
    </label>
  );
}
