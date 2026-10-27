"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  FileText,
  Loader2,
  ShieldCheck,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Notification, NotificationKind } from "@/types";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import type { Translator } from "@/lib/i18n/translate";

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  task_assigned: ClipboardList,
  invitation_accepted: UserPlus,
  phase_submitted: ShieldCheck,
  phase_approved: ShieldCheck,
  phase_rejected: ShieldCheck,
  budget_revision_requested: Wallet,
  budget_revision_approved: Wallet,
  budget_approval_required: Wallet,
  document_pv_pending: FileText,
};

function relativeTime(iso: string, t: Translator, locale: Locale): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("notifications.justNow");
  if (minutes < 60) return t("notifications.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hoursAgo", { count: hours });
  return formatDate(iso.slice(0, 10), locale);
}

export function NotificationBell() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) return;
      const data = (await response.json()) as {
        notifications: Notification[];
        unreadCount: number;
      };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const interval = globalThis.setInterval(() => {
      void loadNotifications();
    }, 60_000);
    return () => globalThis.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    globalThis.document.addEventListener("mousedown", onPointerDown);
    return () =>
      globalThis.document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function markAsRead(notification: Notification) {
    if (notification.readAt) return;

    const response = await fetch(
      `/api/notifications/${notification.id}/read`,
      { method: "PATCH" },
    );

    if (!response.ok) return;

    const data = (await response.json()) as { unreadCount: number };
    setUnreadCount(data.unreadCount);
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  async function handleOpenItem(notification: Notification) {
    await markAsRead(notification);
    setOpen(false);
    if (notification.href) {
      router.push(notification.href);
      router.refresh();
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const response = await fetch("/api/notifications", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as { unreadCount: number };
      const now = new Date().toISOString();
      setUnreadCount(data.unreadCount);
      setNotifications((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt ?? now })),
      );
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void loadNotifications();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
        aria-label={t("notifications.title")}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-indigo px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("notifications.title")}
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-indigo hover:underline disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                {t("notifications.markAll")}
              </button>
            )}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-brand-muted">
                {t("common.loading")}
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-brand-muted">
                {t("notifications.empty")}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notification) => {
                  const Icon = KIND_ICONS[notification.kind];
                  const unread = !notification.readAt;

                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => void handleOpenItem(notification)}
                        className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                          unread ? "bg-brand-indigo/5" : ""
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            unread
                              ? "bg-brand-indigo/15 text-brand-indigo"
                              : "bg-slate-100 text-brand-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span
                              className={`text-sm ${
                                unread
                                  ? "font-semibold text-slate-900"
                                  : "font-medium text-slate-800"
                              }`}
                            >
                              {notification.title}
                            </span>
                            {unread && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-indigo" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-brand-muted">
                            {notification.message}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {relativeTime(notification.createdAt, t, locale)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <Link
              href="/parametres/profil"
              onClick={() => setOpen(false)}
              className="text-xs text-brand-muted hover:text-slate-700"
            >
              {t("notifications.preferences")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
