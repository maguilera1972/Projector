"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/logo";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
        setError(data.error ?? "Connexion impossible.");
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
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
            Connexion
          </h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            Plateforme de gestion de projets HERMES5
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                E-mail
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
                Mot de passe
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
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          PROJECTOR — Conforme à la norme eCH-0054 (HERMES5)
        </p>
      </div>
    </div>
  );
}
