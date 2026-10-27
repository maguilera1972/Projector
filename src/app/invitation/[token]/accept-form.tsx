"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  defaultName: string;
  defaultLocale: Locale;
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-brand-navy-dark px-4 py-2.5 text-white outline-none transition-colors focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/30 disabled:opacity-60";

export function AcceptInvitationForm({
  token,
  email,
  defaultName,
  defaultLocale,
}: AcceptInvitationFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("common.passwordsMismatch"));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password, locale }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? t("invitationAccept.failed"));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">{t("common.email")}</span>
        <input type="email" value={email} disabled className={inputClass} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          {t("common.fullName")}
        </span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          {t("common.language")}
        </span>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className={inputClass}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_NATIVE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          {t("common.password")}
        </span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          {t("profile.confirm")}
        </span>
        <input
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="gradient-brand w-full rounded-lg py-2.5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? t("invitationAccept.submitting") : t("invitationAccept.submit")}
      </button>
    </form>
  );
}
