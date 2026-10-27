"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import {
  ALL_PERMISSIONS,
  defaultPermissionsForRole,
  USER_ROLES,
  type Permission,
  type User,
  type UserRole,
  type UserStatus,
} from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { tDynamic } from "@/lib/i18n/translate";
import type { UserProjectLink } from "@/lib/users/project-links";

interface AdminUsersTableProps {
  users: User[];
  currentUserId: string;
  currentUserIsAdmin: boolean;
  deletionBlockers: Record<string, UserProjectLink[]>;
}

interface EditFormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  permissions: Permission[];
  roleOverride: boolean;
}

function buildEditForm(user: User): EditFormState {
  return {
    name: user.name,
    email: user.email,
    password: "",
    role: user.role,
    status: user.status,
    roleOverride: Boolean(user.roleOverride),
    permissions:
      user.role !== "admin" ? [...user.permissions] : defaultPermissionsForRole("user"),
  };
}

export function AdminUsersTable({
  users,
  currentUserId,
  currentUserIsAdmin,
  deletionBlockers,
}: AdminUsersTableProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const rows = users.filter((user) => !hiddenIds.has(user.id));

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm(buildEditForm(user));
    setError("");
  }

  function closeEdit() {
    setEditingId(null);
    setForm(null);
    setError("");
  }

  function togglePermission(permission: Permission) {
    setForm((current) => {
      if (!current) return current;
      const permissions = current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      return { ...current, permissions };
    });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId || !form) return;

    setError("");
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        status: form.status,
      };

      const editedUser = users.find((item) => item.id === editingId);
      if (editedUser?.entraOid && currentUserIsAdmin) {
        payload.roleOverride = form.roleOverride;
      }

      if (form.password.trim()) {
        payload.password = form.password;
      }

      if (form.role !== "admin") {
        payload.permissions = form.permissions;
      }

      const response = await fetch(`/api/users/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        error?: string;
        user?: User;
      };

      if (!response.ok) {
        setError(data.error ?? t("admin.updateFailed"));
        return;
      }

      closeEdit();
      router.refresh();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(user: User) {
    const blockers = deletionBlockers[user.id] ?? [];

    if (blockers.length > 0) {
      const details = blockers
        .map((link) => `• ${link.projectName} (${link.role})`)
        .join("\n");
      window.alert(t("admin.deleteBlocked", { name: user.name, details }));
      return;
    }

    const confirmed = window.confirm(t("admin.deleteConfirm", { name: user.name }));

    if (!confirmed) return;

    setError("");
    setDeletingId(user.id);

    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(user.id);
      return next;
    });

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? ((await response.json()) as { error?: string })
        : { error: t("admin.unexpectedResponse", { status: response.status }) };

      if (!response.ok && response.status !== 404) {
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(user.id);
          return next;
        });
        setError(data.error ?? t("admin.deleteFailed"));
        return;
      }

      if (editingId === user.id) closeEdit();
      router.refresh();
    } catch {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="px-6 py-8 text-center text-sm text-brand-muted">
        {t("admin.noUsers")}
      </p>
    );
  }

  return (
    <>
      {error && !editingId && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("common.name")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("common.email")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("common.role")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">{t("common.status")}</th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                {t("common.permissions")}
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                {t("common.createdAt")}
              </th>
              <th className="px-6 py-4 font-semibold text-slate-700">
                {t("common.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-medium text-slate-900">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={user.name}
                      email={user.email}
                      avatarDisplay={user.avatarDisplay}
                      size="sm"
                    />
                    <span>
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-2 text-xs text-brand-muted">
                          ({t("common.you")})
                        </span>
                      )}
                      {user.entraOid && (
                        <span
                          className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700"
                          title={user.lastLoginAt ? t("entra.lastLogin", { date: formatDate(user.lastLoginAt, locale) }) : undefined}
                        >
                          {t("entra.badge")}
                        </span>
                      )}
                      {user.pendingApproval && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {t("entra.pendingApproval")}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-brand-muted">{user.email}</td>
                <td className="px-6 py-4">
                  <Badge variant={user.role === "admin" ? "default" : "muted"}>
                    {tDynamic(t, `enums.role.${user.role}`)}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant={user.status === "active" ? "success" : "warning"}
                  >
                    {tDynamic(t, `enums.userStatus.${user.status}`)}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {user.role === "admin"
                    ? t("admin.allPermissions")
                    : t("admin.permissionCount", { count: user.permissions.length })}
                </td>
                <td className="px-6 py-4 text-brand-muted">
                  {formatDate(user.createdAt, locale)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(user)}
                      className="rounded p-2 text-brand-muted transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={t("admin.editAria", { name: user.name })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      disabled={
                        deletingId === user.id || user.id === currentUserId
                      }
                      className="rounded p-2 text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t("admin.deleteAria", { name: user.name })}
                      title={
                        user.id === currentUserId
                          ? t("admin.cannotDeleteSelf")
                          : (deletionBlockers[user.id]?.length ?? 0) > 0
                            ? t("admin.linkedToProjects")
                            : t("common.delete")
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
          >
            <form onSubmit={handleSave} className="p-6">
              <div className="flex items-center justify-between">
                <h3
                  id="edit-user-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {t("admin.editUser")}
                </h3>
                <button
                  type="button"
                  onClick={closeEdit}
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
                      setForm((current) =>
                        current ? { ...current, name: e.target.value } : current,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.email")}</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm((current) =>
                        current ? { ...current, email: e.target.value } : current,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    {t("profile.newPassword")}
                  </span>
                  <input
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) =>
                      setForm((current) =>
                        current
                          ? { ...current, password: e.target.value }
                          : current,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                    placeholder={t("admin.keepPasswordPlaceholder")}
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("common.role")}</span>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              role: e.target.value as UserRole,
                              permissions: defaultPermissionsForRole(
                                e.target.value as UserRole,
                              ),
                              roleOverride: true,
                            }
                          : current,
                      )
                    }
                    disabled={
                      !currentUserIsAdmin || editingId === currentUserId
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo disabled:bg-slate-50"
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {tDynamic(t, `enums.role.${role}`)}
                      </option>
                    ))}
                  </select>
                  {!currentUserIsAdmin && (
                    <p className="mt-1 text-xs text-brand-muted">
                      {t("admin.onlyAdminRole")}
                    </p>
                  )}
                </label>

                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-slate-700">{t("common.status")}</span>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              status: e.target.value as UserStatus,
                            }
                          : current,
                      )
                    }
                    disabled={editingId === currentUserId}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo disabled:bg-slate-50"
                  >
                    <option value="active">{t("enums.userStatus.active")}</option>
                    <option value="suspended">
                      {t("enums.userStatus.suspended")}
                    </option>
                  </select>
                  <p className="mt-1 text-xs text-brand-muted">
                    {t("admin.suspendedHelp")}
                  </p>
                </label>
              </div>

              {currentUserIsAdmin && users.find((item) => item.id === editingId)?.entraOid && (
                <label className="mt-4 flex items-start gap-3 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.roleOverride}
                    onChange={(e) =>
                      setForm((current) =>
                        current ? { ...current, roleOverride: e.target.checked } : current,
                      )
                    }
                  />
                  <span>
                    <span className="font-medium text-slate-800">{t("entra.roleOverride")}</span>
                    <span className="mt-0.5 block text-xs text-brand-muted">
                      {t("entra.roleOverrideHelp")}
                    </span>
                  </span>
                </label>
              )}

              {form.role !== "admin" && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700">
                    {t("common.permissions")}
                  </p>
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

              {(deletionBlockers[editingId]?.length ?? 0) > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {t("admin.linkedProjects")}{" "}
                  {deletionBlockers[editingId]
                    ?.map((link) => `${link.projectName} (${link.role})`)
                    .join(", ")}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? t("common.saving") : t("common.save")}
                </button>
                <button
                  type="button"
                  onClick={closeEdit}
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
