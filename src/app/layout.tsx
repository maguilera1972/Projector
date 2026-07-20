import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listProjects, listPortfolios } from "@/lib/db/store";
import { canUserManageProjectMandant } from "@/lib/hermes/project-roles";
import { getPublicUrl } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicUrl()),
  title: "PROJECTOR — Gestion de projets HERMES5",
  description:
    "Plateforme de gestion de projets conforme à la méthode HERMES5 (eCH-0054)",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  let showAdministration = false;
  if (user) {
    const isAdmin = hasPermission(user, "admin:access");
    if (isAdmin) {
      showAdministration = true;
    } else {
      const projects = await listProjects();
      const portfolios = await listPortfolios(true);
      const portfolioById = new Map(portfolios.map((p) => [p.id, p]));
      showAdministration = projects.some((project) => {
        const portfolio = project.portfolioId
          ? portfolioById.get(project.portfolioId)
          : undefined;
        return canUserManageProjectMandant(user, project, portfolio);
      });
    }
  }

  return (
    <html lang="fr">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppShell user={user} showAdministration={showAdministration}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
