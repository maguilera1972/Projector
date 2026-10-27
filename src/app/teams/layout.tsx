import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PROJECTOR — Microsoft Teams",
  robots: { index: false, follow: false },
};

/** Pages d'amorçage des onglets Teams (sans barre latérale, voir AppShell). */
export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
