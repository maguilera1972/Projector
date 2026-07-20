import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ProjectCard } from "@/components/project/project-card";
import { EmptyState } from "@/components/ui/empty-state";
import { listProjects } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";

export default async function ProjetsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const projects = await listProjects();

  return (
    <>
      <Header
        title="Projets"
        subtitle="Gérez vos projets selon la méthode HERMES5"
        user={user}
      />

      <main className="p-8">
        {projects.length === 0 ? (
          <EmptyState
            title="Aucun projet"
            description="Commencez par créer votre premier projet HERMES5."
            actionLabel="Créer un projet"
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
