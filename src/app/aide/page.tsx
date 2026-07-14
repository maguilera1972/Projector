import Link from "next/link";
import { Header } from "@/components/layout/header";
import { HERMES_PHASES } from "@/types";

export default function AidePage() {
  return (
    <>
      <Header
        title="Aide HERMES5"
        subtitle="Référence méthodologique eCH-0054"
      />
      <main className="p-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              À propos de HERMES5
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-muted">
              HERMES est la méthode de gestion de projet de la Confédération suisse,
              reconnue sous la norme ouverte eCH-0054. PROJECTOR implémente cette
              méthodologie pour piloter vos projets informatiques, organisationnels
              et de développement de services.
            </p>
            <Link
              href="https://www.hermes.admin.ch/hermes5/fr/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm font-medium text-brand-indigo hover:underline"
            >
              Documentation officielle HERMES5 →
            </Link>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Phases du cycle de vie
            </h2>
            <ol className="mt-4 space-y-4">
              {HERMES_PHASES.map((phase) => (
                <li key={phase.id} className="flex gap-4">
                  <span className="gradient-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
                    {phase.order}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{phase.label}</p>
                    <p className="text-sm text-brand-muted">{phase.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </>
  );
}
