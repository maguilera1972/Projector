import { Header } from "@/components/layout/header";
import { ProjectCard } from "@/components/project/project-card";
import { mockProjects } from "@/lib/mock-data";

export default function ProjetsPage() {
  return (
    <>
      <Header
        title="Projets"
        subtitle="Gérez vos projets selon la méthode HERMES5"
      />

      <main className="p-8">
        <div className="grid gap-6 md:grid-cols-2">
          {mockProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </main>
    </>
  );
}
