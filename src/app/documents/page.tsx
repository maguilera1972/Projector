import { Header } from "@/components/layout/header";

export default function DocumentsPage() {
  return (
    <>
      <Header
        title="Documents"
        subtitle="Livrables et résultats HERMES5 (mandat, cahier des charges, rapports...)"
      />
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-2xl font-bold text-white">
            P
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Module en développement
          </h2>
          <p className="mt-2 text-sm text-brand-muted">
            Gestion documentaire conforme aux modèles HERMES5.
          </p>
        </div>
      </main>
    </>
  );
}
