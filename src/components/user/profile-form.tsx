"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { UserAvatar } from "@/components/user/user-avatar";
import type { AvatarDisplay, User } from "@/lib/auth/permissions";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NATIVE_NAMES, normalizeLocale, type Locale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import { getIntegrationTranslator } from "@/lib/integrations/i18n";

type NotificationChannel = "email" | "teams" | "both" | "none";

function channelFor(user: User): NotificationChannel {
  const email = user.emailNotifications !== false;
  const teams = Boolean(user.entraOid) && user.teamsNotifications !== false;
  if (email && teams) return "both";
  if (email) return "email";
  return teams ? "teams" : "none";
}

interface ProfileFormProps {
  user: User;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo";

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const { t, locale: currentLocale } = useI18n();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [avatarDisplay, setAvatarDisplay] = useState<AvatarDisplay>(
    user.avatarDisplay ?? "initials",
  );
  const [locale, setLocale] = useState<Locale>(
    user.locale ? normalizeLocale(user.locale) : currentLocale,
  );
  const it = useMemo(() => getIntegrationTranslator(currentLocale), [currentLocale]);
  const teamsAvailable = Boolean(user.entraOid);
  const [channel, setChannel] = useState<NotificationChannel>(channelFor(user));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError(t("common.passwordsMismatch"));
      return;
    }

    if (newPassword && !currentPassword) {
      setError(t("profile.currentRequired"));
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, string | boolean> = {
        name: name.trim(),
        email: email.trim(),
        avatarDisplay,
        locale,
        emailNotifications: channel === "email" || channel === "both",
        teamsNotifications: channel === "teams" || channel === "both",
      };

      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? t("profile.saveFailed"));
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(t("profile.updated"));
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Link
        href="/parametres"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("profile.back")}
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("profile.photo")}</h2>
        <p className="mt-1 text-sm text-brand-muted">
          {t("profile.photoHelpBefore")}{" "}
          <a
            href="https://gravatar.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-indigo hover:underline"
          >
            gravatar.com
          </a>
          {t("profile.photoHelpAfter")}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <UserAvatar
            name={name}
            email={email}
            avatarDisplay={avatarDisplay}
            size="lg"
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">
              {t("profile.display")}
            </legend>
            {(["initials", "gravatar"] as const).map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="radio"
                  name="avatarDisplay"
                  value={mode}
                  checked={avatarDisplay === mode}
                  onChange={() => setAvatarDisplay(mode)}
                  className="text-brand-indigo focus:ring-brand-indigo"
                />
                {tDynamic(t, `enums.avatarDisplay.${mode}`)}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("profile.personalInfo")}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("common.fullName")}</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("common.email")}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">{t("common.role")}</span>
            <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">
              {tDynamic(t, `enums.role.${user.role}`)}
              <span className="ml-2 text-xs text-brand-muted">
                {t("profile.roleAdminOnly")}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("profile.preferences")}</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("common.language")}</span>
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
            <span className="mt-1 block text-xs text-brand-muted">
              {t("profile.languageHelp")}
            </span>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{it("profile.channelTitle")}</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as NotificationChannel)}
              className={inputClass}
            >
              {(["email", "teams", "both", "none"] as const)
                .filter((option) => teamsAvailable || option === "email" || option === "none")
                .map((option) => (
                  <option key={option} value={option}>
                    {it(`profile.channel.${option}`)}
                  </option>
                ))}
            </select>
            <span className="mt-1 block text-xs text-brand-muted">
              {teamsAvailable ? it("profile.channelHint") : it("profile.teamsUnavailable")}
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("profile.passwordSection")}</h2>
        <p className="mt-1 text-sm text-brand-muted">{t("profile.passwordHelp")}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">{t("profile.currentPassword")}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("profile.newPassword")}</span>
            <input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("profile.confirm")}</span>
            <input
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-indigo px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {loading ? t("common.saving") : t("common.save")}
      </button>
    </form>
  );
}
