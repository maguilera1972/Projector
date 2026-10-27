"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  CheckSquare,
  Users,
  FileText,
  BarChart3,
  Settings,
  HelpCircle,
  Shield,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { cn } from "@/lib/utils";
import { hasPermission, type SessionUser } from "@/lib/auth/permissions";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";

const navigation: { key: MessageKey; href: string; icon: typeof LayoutDashboard }[] = [
  { key: "nav.dashboard", href: "/", icon: LayoutDashboard },
  { key: "nav.portfolios", href: "/portfolios", icon: Briefcase },
  { key: "nav.projects", href: "/projets", icon: FolderKanban },
  { key: "nav.tasks", href: "/taches", icon: CheckSquare },
  { key: "nav.team", href: "/equipe", icon: Users },
  { key: "nav.documents", href: "/documents", icon: FileText },
  { key: "nav.reports", href: "/rapports", icon: BarChart3 },
];

const secondaryNav: { key: MessageKey; href: string; icon: typeof Settings }[] = [
  { key: "nav.settings", href: "/parametres", icon: Settings },
  { key: "nav.help", href: "/aide", icon: HelpCircle },
];

interface SidebarProps {
  user: SessionUser | null;
  showAdministration?: boolean;
}

export function Sidebar({
  user,
  showAdministration = false,
}: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const showAdmin =
    user &&
    (hasPermission(user, "admin:access") || showAdministration);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-brand-navy-dark">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <Link href="/">
          <Logo size={36} />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("nav.navigation")}
        </p>
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "gradient-brand text-white shadow-lg shadow-brand-purple/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {t(item.key)}
            </Link>
          );
        })}

        <div className="my-4 border-t border-white/10" />

        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("nav.system")}
        </p>
        {secondaryNav.map((item) => {
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {t(item.key)}
            </Link>
          );
        })}

        {showAdmin && (
          <Link
            href="/parametres/administration"
            className={cn(
              "group mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/parametres/administration")
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <Shield className="h-5 w-5 shrink-0" />
            {t("nav.administration")}
          </Link>
        )}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <LanguageSwitcher variant="sidebar" />
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs font-medium text-brand-cyan">{t("nav.hermesTitle")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("nav.hermesSubtitle")}</p>
        </div>
      </div>
    </aside>
  );
}
