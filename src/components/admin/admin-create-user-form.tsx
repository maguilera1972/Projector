"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  defaultPermissionsForRole,
  USER_ROLES,
  type UserRole,
} from "@/lib/auth/permissions";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";

export function AdminCreateUserForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as UserRole,
  });

  function resetForm() {
    setForm({ name: "", email: "", password: "", role: "user" });
    setError("");
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        error?: string;
        user?: { name: string };
      };

      if (!response.ok) {
        setError(data.error ?? t("admin.createFailed"));
        return;
      }

      handleClose();
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        {t("admin.createUser")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
          >
            <form onSubmit={handleSubmit} className="p-6">
              <div className="flex items-center justify-between">
                <h3
                  id="create-user-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {t("admin.newUser")}
                </h3>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded p-1 text-brand-muted hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t("common.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.fullName")}</span>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, name: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                    placeholder={t("admin.namePlaceholder")}
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.email")}</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, email: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                    placeholder={t("admin.emailPlaceholder")}
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.password")}</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        password: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                    placeholder={t("admin.passwordPlaceholder")}
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.role")}</span>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        role: e.target.value as UserRole,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {tDynamic(t, `enums.role.${role}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {form.role !== "admin" && (
                <p className="mt-4 text-xs text-brand-muted">
                  {t("admin.defaultPermissions")}{" "}
                  {defaultPermissionsForRole(form.role).map((permission) => (
                    <Badge key={permission} variant="muted" className="mr-1 mt-1">
                      {permission}
                    </Badge>
                  ))}
                </p>
              )}

              {form.role === "admin" && (
                <p className="mt-4 text-xs text-brand-muted">
                  {t("admin.adminAllPermissions")}
                </p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? t("admin.creating") : t("admin.createSubmit")}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
