"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { CreateProjectButton } from "@/components/project/create-project-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserAvatar } from "@/components/user/user-avatar";
import type { SessionUser } from "@/lib/auth/permissions";
import { useI18n } from "@/lib/i18n/client";

interface HeaderProps {
  title: string;
  subtitle?: string;
  user: SessionUser | null;
}

export function Header({ title, subtitle, user }: HeaderProps) {
  const router = useRouter();
  const { t } = useI18n();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-brand-muted">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder={t("header.searchPlaceholder")}
              className="h-10 w-72 rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
            />
          </div>

          <CreateProjectButton user={user} />

          {user && <NotificationBell />}

          <Link
            href="/parametres/profil"
            className="hidden text-right sm:block hover:opacity-80"
            title={t("common.myProfile")}
          >
            <p className="text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="text-xs text-brand-muted">{user?.email}</p>
          </Link>

          {user ? (
            <Link href="/parametres/profil" title={t("common.myProfile")}>
              <UserAvatar
                name={user.name}
                email={user.email}
                avatarDisplay={user.avatarDisplay}
                size="md"
              />
            </Link>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500">
              ?
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
            aria-label={t("common.logout")}
            title={t("common.logout")}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
