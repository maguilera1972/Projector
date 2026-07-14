import { Header } from "@/components/layout/header";

function PlaceholderPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <Header title={title} subtitle={subtitle} />
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-2xl font-bold text-white">
            P
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Module en développement
          </h2>
          <p className="mt-2 text-sm text-brand-muted">
            Ce module sera implémenté selon le cahier des charges HERMES5.
          </p>
        </div>
      </main>
    </>
  );
}

export default function EquipePage() {
  return (
    <PlaceholderPage
      title="Équipe"
      subtitle="Rôles HERMES5 : chef de projet, mandant, spécialistes..."
    />
  );
}
