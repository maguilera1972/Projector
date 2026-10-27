import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, Users, UserCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { listProjects, listPortfolios } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { canUserManageProjectMandant } from "@/lib/hermes/project-roles";
import { getRequestTranslator } from "@/lib/i18n/server";

export default async function ParametresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t } = await getRequestTranslator();

  const isAdmin = hasPermission(user, "admin:access");
  const projects = await listProjects();
  const portfolios = await listPortfolios(true);
  const portfolioById = new Map(portfolios.map((p) => [p.id, p]));
  const canManageMandant =
    isAdmin ||
    projects.some((project) => {
      const portfolio = project.portfolioId
        ? portfolioById.get(project.portfolioId)
        : undefined;
      return canUserManageProjectMandant(user, project, portfolio);
    });

  const settingsLinks = [
    {
      title: t("settings.profileTitle"),
      description: t("settings.profileDescription"),
      href: "/parametres/profil",
      icon: UserCircle,
      visible: true,
    },
    {
      title: t("settings.adminTitle"),
      description: isAdmin
        ? t("settings.adminDescriptionAdmin")
        : t("settings.adminDescriptionMandant"),
      href: "/parametres/administration",
      icon: Shield,
      visible: isAdmin || canManageMandant,
    },
    {
      title: t("settings.usersTitle"),
      description: t("settings.usersDescription"),
      href: "/equipe",
      icon: Users,
      visible: true,
    },
  ];

  return (
    <>
      <Header
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        user={user}
      />

      <main className="p-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {settingsLinks
            .filter((link) => link.visible)
            .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-brand-indigo/40 hover:shadow-md"
              >
                <div className="gradient-brand mb-4 flex h-11 w-11 items-center justify-center rounded-lg">
                  <link.icon className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-indigo">
                  {link.title}
                </h2>
                <p className="mt-2 text-sm text-brand-muted">
                  {link.description}
                </p>
              </Link>
            ))}

        </div>
      </main>
    </>
  );
}
