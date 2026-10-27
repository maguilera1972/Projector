"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";

export function LoginForm({ entraEnabled = false }: { entraEnabled?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const entraError = searchParams.get("error");
  const [error, setError] = useState(
    entraError?.startsWith("entra_") ? tDynamic(t, `entra.error_${entraError}`) : "",
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? t("auth.failed"));
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy-dark px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={48} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-brand-navy p-8 shadow-2xl">
          <h1 className="text-center text-2xl font-semibold text-white">
            {t("auth.title")}
          </h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            {t("auth.subtitle")}
          </p>

          {error && (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {entraEnabled && (
            <>
              <a
                href={`/api/auth/entra/login?redirect=${encodeURIComponent(redirect)}`}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white py-2.5 text-sm font-semibold text-slate-900 shadow transition hover:bg-slate-100"
              >
                <svg aria-hidden="true" viewBox="0 0 21 21" className="h-4 w-4">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                {t("entra.loginButton")}
              </a>
              <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-500">
                <span className="h-px flex-1 bg-white/10" />
                {t("entra.orDivider")}
                <span className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                {t("common.email")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className="w-full rounded-lg border border-white/10 bg-brand-navy-dark px-4 py-2.5 text-white outline-none transition-colors focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/30"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                {t("common.password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-white/10 bg-brand-navy-dark px-4 py-2.5 text-white outline-none transition-colors focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="gradient-brand w-full rounded-lg py-2.5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? t("auth.submitting") : t("auth.submit")}
            </button>
          </form>
        </div>

        <LanguageSwitcher variant="sidebar" className="mx-auto mt-6 max-w-[14rem]" />

        <p className="mt-4 text-center text-xs text-slate-500">
          {t("auth.footer")}
        </p>
      </div>
    </div>
  );
}
