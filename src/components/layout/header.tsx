"use client";

import { Bell, Search, Plus } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
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
              placeholder="Rechercher un projet, une tâche..."
              className="h-10 w-72 rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
            />
          </div>

          <button
            type="button"
            className="gradient-brand flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white shadow-md transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nouveau projet
          </button>

          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-purple" />
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-brand text-sm font-bold text-white">
            MA
          </div>
        </div>
      </div>
    </header>
  );
}
