"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Mail, RotateCw, Send, Trash2, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ALL_PERMISSIONS,
  defaultPermissionsForRole,
  USER_ROLES,
  type Permission,
  type UserRole,
} from "@/lib/auth/permissions";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/utils";
import type { InvitationStatus, InvitationSummary } from "@/types";

interface AdminInvitationsPanelProps {
  invitations: InvitationSummary[];
  currentUserIsAdmin: boolean;
  mailConfigured: boolean;
}

interface DeliveryResponse {
  error?: string;
  invitation?: InvitationSummary;
  link?: string;
  emailSent?: boolean;
  emailError?: string;
}

const STATUS_VARIANT: Record<InvitationStatus, "default" | "success" | "warning" | "muted"> = {
  pending: "default",
  accepted: "success",
  expired: "warning",
  revoked: "muted",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo";

export function AdminInvitationsPanel({
  invitations,
  currentUserIsAdmin,
  mailConfigured,
}: AdminInvitationsPanelProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeliveryResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "guest" as UserRole,
    permissions: defaultPermissionsForRole("guest"),
    locale: locale as Locale,
    message: "",
  });

  const roles = currentUserIsAdmin ? USER_ROLES : USER_ROLES.filter((r) => r !== "admin");

  function resetForm() {
    setForm({
      email: "",
      name: "",
      role: "guest",
      permissions: defaultPermissionsForRole("guest"),
      locale,
      message: "",
    });
    setError("");
  }

  function togglePermission(permission: Permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("invitations.copyLink"), link);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          permissions: form.role === "admin" ? undefined : form.permissions,
        }),
      });
      const data = (await response.json()) as DeliveryResponse;
      if (!response.ok) {
        setError(data.error ?? t("invitations.actionFailed"));
        return;
      }
      setResult(data);
      setOpen(false);
      resetForm();
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(invitation: InvitationSummary) {
    setBusyId(invitation.id);
    setError("");
    try {
      const response = await fetch(`/api/invitations/${invitation.id}/resend`, {
        method: "POST",
      });
      const data = (await response.json()) as DeliveryResponse;
      if (!response.ok) {
        setError(data.error ?? t("invitations.actionFailed"));
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(invitation: InvitationSummary) {
    const purge = invitation.status !== "pending";
    if (!purge && !window.confirm(t("invitations.revokeConfirm", { email: invitation.email }))) {
      return;
    }
    setBusyId(invitation.id);
    setError("");
    try {
      const response = await fetch(
        `/api/invitations/${invitation.id}${purge ? "?purge=1" : ""}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? t("invitations.actionFailed"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setBusyId(null);
    }
  }

  function emailStatusLabel(invitation: InvitationSummary): string {
    if (invitation.emailStatus === "sent") return t("invitations.emailSent");
    if (invitation.emailStatus === "failed") return t("invitations.emailFailed");
    if (invitation.emailStatus === "not_configured") return t("invitations.emailNotConfigured");
    return "—";
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("invitations.sectionTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-muted">
            {t("invitations.sectionDescription")}
          </p>
          {!mailConfigured && (
            <p className="mt-2 max-w-2xl text-xs text-amber-700">{t("admin.mailNotConfigured")}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <UserPlus className="h-4 w-4" />
          {t("invitations.invite")}
        </button>
      </div>

      {result?.invitation && (
        <div
          className={`mx-6 mt-4 rounded-lg border px-4 py-3 text-sm ${
            result.emailSent
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {t("invitations.created", { email: result.invitation.email })}{" "}
                {result.emailSent && t("invitations.emailSentTo", { email: result.invitation.email })}
              </p>
              {!result.emailSent && (
                <>
                  <p className="mt-1">
                    {t("invitations.emailNotSent", { reason: result.emailError ?? "—" })}
                  </p>
                  {result.link && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="block min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-700">
                        {result.link}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyLink(result.link!)}
                        className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? t("common.copied") : t("invitations.copyLink")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded p-1 hover:bg-white/60"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && !open && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {invitations.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-brand-muted">{t("invitations.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("common.email")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("common.role")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("common.language")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("common.status")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("invitations.emailColumn")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("invitations.invitedBy")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("invitations.expiresAt")}</th>
                <th className="px-6 py-3 font-semibold text-slate-700">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <tr key={invitation.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-900">{invitation.email}</p>
                    {invitation.name && (
                      <p className="text-xs text-brand-muted">{invitation.name}</p>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={invitation.role === "admin" ? "default" : "muted"}>
                      {tDynamic(t, `enums.role.${invitation.role}`)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-brand-muted">
                    {LOCALE_NATIVE_NAMES[invitation.locale] ?? invitation.locale}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={STATUS_VARIANT[invitation.status]}>
                      {tDynamic(t, `enums.invitationStatus.${invitation.status}`)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-brand-muted" title={invitation.emailError}>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {emailStatusLabel(invitation)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-brand-muted">{invitation.invitedByName}</td>
                  <td className="px-6 py-3 text-brand-muted">
                    {formatDate(invitation.expiresAt, locale)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1">
                      {invitation.status !== "accepted" && (
                        <button
                          type="button"
                          disabled={busyId === invitation.id}
                          onClick={() => void handleResend(invitation)}
                          className="rounded p-2 text-brand-muted transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                          title={t("invitations.resend")}
                          aria-label={t("invitations.resend")}
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                      )}
                      {invitation.status !== "accepted" && (
                        <button
                          type="button"
                          disabled={busyId === invitation.id}
                          onClick={() => void handleRevoke(invitation)}
                          className="rounded p-2 text-red-500 transition hover:bg-red-50 disabled:opacity-40"
                          title={
                            invitation.status === "pending"
                              ? t("invitations.revoke")
                              : t("common.delete")
                          }
                          aria-label={t("invitations.revoke")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <form onSubmit={handleSubmit} className="p-6">
              <div className="flex items-center justify-between">
                <h3 id="invite-title" className="text-lg font-semibold text-slate-900">
                  {t("invitations.dialogTitle")}
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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
                  <span className="font-medium text-slate-700">{t("common.email")}</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                    className={inputClass}
                    placeholder={t("admin.emailPlaceholder")}
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("invitations.nameLabel")}</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                    className={inputClass}
                    placeholder={t("admin.namePlaceholder")}
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.role")}</span>
                  <select
                    value={form.role}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setForm((c) => ({
                        ...c,
                        role,
                        permissions: defaultPermissionsForRole(role),
                      }));
                    }}
                    className={inputClass}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {tDynamic(t, `enums.role.${role}`)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-brand-muted">
                    {tDynamic(t, `enums.roleDescription.${form.role}`)}
                  </span>
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.language")}</span>
                  <select
                    value={form.locale}
                    onChange={(e) => setForm((c) => ({ ...c, locale: e.target.value as Locale }))}
                    className={inputClass}
                  >
                    {LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {LOCALE_NATIVE_NAMES[code]}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-brand-muted">
                    {t("invitations.languageHelp")}
                  </span>
                </label>

                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-slate-700">{t("invitations.messageLabel")}</span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={form.message}
                    onChange={(e) => setForm((c) => ({ ...c, message: e.target.value }))}
                    className={inputClass}
                    placeholder={t("invitations.messagePlaceholder")}
                  />
                </label>
              </div>

              {form.role === "admin" ? (
                <p className="mt-4 text-xs text-brand-muted">{t("admin.adminAllPermissions")}</p>
              ) : (
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700">{t("common.permissions")}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {ALL_PERMISSIONS.map((permission) => (
                      <label
                        key={permission}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission)}
                          onChange={() => togglePermission(permission)}
                        />
                        <span>{permission}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {loading ? t("invitations.submitting") : t("invitations.submit")}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
