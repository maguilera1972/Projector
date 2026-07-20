"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { UserAvatar } from "@/components/user/user-avatar";
import {
  AVATAR_DISPLAY_LABELS,
  ROLE_LABELS,
  type AvatarDisplay,
  type User,
} from "@/lib/auth/permissions";

interface ProfileFormProps {
  user: User;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [avatarDisplay, setAvatarDisplay] = useState<AvatarDisplay>(
    user.avatarDisplay ?? "initials",
  );
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
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (newPassword && !currentPassword) {
      setError("Indiquez votre mot de passe actuel pour le modifier.");
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, string> = {
        name: name.trim(),
        email: email.trim(),
        avatarDisplay,
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
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Profil mis à jour.");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
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
        Retour aux paramètres
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Photo de profil</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Gravatar utilise l&apos;adresse e-mail de votre compte. Si aucune photo
          n&apos;est enregistrée sur{" "}
          <a
            href="https://gravatar.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-indigo hover:underline"
          >
            gravatar.com
          </a>
          , les initiales s&apos;affichent automatiquement.
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
              Affichage
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
                {AVATAR_DISPLAY_LABELS[mode]}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Informations personnelles
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Nom complet</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
            />
          </label>

          <div className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Rôle</span>
            <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">
              {ROLE_LABELS[user.role]}
              <span className="ml-2 text-xs text-brand-muted">
                (modifiable uniquement par un administrateur)
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Mot de passe</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Laissez vide pour conserver votre mot de passe actuel.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Mot de passe actuel</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
              autoComplete="current-password"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Nouveau mot de passe</span>
            <input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Confirmer</span>
            <input
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
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
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
