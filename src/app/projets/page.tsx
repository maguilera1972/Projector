import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ProjectCard } from "@/components/project/project-card";
import { EmptyState } from "@/components/ui/empty-state";
import { listProjects } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";

export default async function ProjetsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t } = await getRequestTranslator();

  const projects = await listProjects();

  return (
    <>
      <Header
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        user={user}
      />

      <main className="p-8">
        {projects.length === 0 ? (
          <EmptyState
            title={t("projects.noProjects")}
            description={t("projects.startFirst")}
            actionLabel={t("projects.create")}
            user={user}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
