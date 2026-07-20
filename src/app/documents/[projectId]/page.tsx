import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { ProjectGeneratedDocumentsList } from "@/components/project/generated-documents-panel";
import { PdfExportBar } from "@/components/project/pdf-export-bar";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  getProjectById,
  getPortfolioById,
  listGeneratedDocumentsByProject,
} from "@/lib/db/store";
import { canUserEditProjectDocuments } from "@/lib/hermes/project-roles";

interface ProjectDocumentsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDocumentsPage({
  params,
}: ProjectDocumentsPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!hasPermission(user, PERMISSIONS.DOCUMENTS_READ)) {
    redirect("/");
  }

  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const documents = await listGeneratedDocumentsByProject(projectId);
  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;
  const canEditDocuments = canUserEditProjectDocuments(
    user,
    project,
    portfolio,
  );

  return (
    <>
      <Header
        title={project.name}
        subtitle={`${documents.length} document${documents.length !== 1 ? "s" : ""} HERMES généré${documents.length !== 1 ? "s" : ""}`}
        user={user}
      />
      <main className="p-8">
        <nav
          aria-label="Fil d'Ariane"
          className="mb-6 flex items-center gap-1.5 text-sm text-brand-muted"
        >
          <Link href="/documents" className="hover:text-brand-indigo">
            Documents
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-medium text-slate-900">{project.name}</span>
        </nav>

        <PdfExportBar
          projectId={project.id}
          projectName={project.name}
          documentCount={documents.length}
        />

        <ProjectGeneratedDocumentsList
          project={project}
          documents={documents}
          canEdit={canEditDocuments}
        />

        <p className="mt-6 text-sm">
          <Link
            href={`/projets/${project.id}`}
            className="font-medium text-brand-indigo hover:underline"
          >
            Ouvrir la fiche projet →
          </Link>
        </p>
      </main>
    </>
  );
}
