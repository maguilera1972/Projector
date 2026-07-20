import Link from "next/link";
import { FileWarning } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PendingPvDocumentItem } from "@/types";

interface PendingPvPanelProps {
  items: PendingPvDocumentItem[];
}

export function PendingPvPanel({ items }: PendingPvPanelProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <FileWarning className="h-5 w-5 text-amber-700" />
        <h2 className="text-lg font-semibold text-amber-950">
          Documents à archiver ({items.length})
        </h2>
      </div>
      <p className="mb-4 text-sm text-amber-900">
        Des documents mandant sont en attente d&apos;archivage dans le dossier
        projet (accord budget ou PV de séance).
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
                {item.projectName} · séance {formatDate(item.sessionDate)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
