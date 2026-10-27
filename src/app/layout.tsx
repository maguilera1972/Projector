import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listProjects, listPortfolios } from "@/lib/db/store";
import { canUserManageProjectMandant } from "@/lib/hermes/project-roles";
import { getPublicUrl } from "@/lib/env";
import { I18nProvider } from "@/lib/i18n/client";
import { getRequestTranslator } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n/translate";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestTranslator();
  return {
    metadataBase: new URL(getPublicUrl()),
    title: t("meta.title"),
    description: t("meta.description"),
    icons: {
      icon: "/favicon.svg",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const { locale } = await getRequestTranslator();

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
    <html lang={locale}>
      <body className={`${inter.variable} font-sans antialiased`}>
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          <AppShell user={user} showAdministration={showAdministration}>
            {children}
          </AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
