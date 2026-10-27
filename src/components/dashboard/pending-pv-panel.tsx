"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { FileWarning } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PendingPvDocumentItem } from "@/types";

interface PendingPvPanelProps {
  items: PendingPvDocumentItem[];
}

export function PendingPvPanel({ items }: PendingPvPanelProps) {
  const { t, locale } = useI18n();
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <FileWarning className="h-5 w-5 text-amber-700" />
        <h2 className="text-lg font-semibold text-amber-950">
          {t("dashboard.pvTitle", { count: items.length })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-amber-900">
        {t("dashboard.pvDescription")}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/projets/${item.projectId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm transition-colors hover:border-amber-300"
            >
              <span className="font-medium text-slate-900">{item.title}</span>
              <span className="text-brand-muted">
                {t("dashboard.pvSession", { project: item.projectName, date: formatDate(item.sessionDate, locale) })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
