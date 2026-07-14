"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  FileText,
  BarChart3,
  Settings,
  HelpCircle,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Tableau de bord", href: "/", icon: LayoutDashboard },
  { name: "Projets", href: "/projets", icon: FolderKanban },
  { name: "Tâches", href: "/taches", icon: CheckSquare },
  { name: "Équipe", href: "/equipe", icon: Users },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Rapports", href: "/rapports", icon: BarChart3 },
];

const secondaryNav = [
  { name: "Paramètres", href: "/parametres", icon: Settings },
  { name: "Aide HERMES5", href: "/aide", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-brand-navy-dark">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <Link href="/">
          <Logo size={36} />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Navigation
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
              {item.name}
            </Link>
          );
        })}

        <div className="my-4 border-t border-white/10" />

        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Système
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
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs font-medium text-brand-cyan">Méthode HERMES5</p>
          <p className="mt-1 text-xs text-slate-400">
            Gestion de projet conforme à la norme eCH-0054
          </p>
        </div>
      </div>
    </aside>
  );
}
