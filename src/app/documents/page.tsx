import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ProjectDocumentFolders } from "@/components/project/project-document-folders";
import { DocumentsIndexExport } from "@/components/project/pdf-export-bar";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listProjectGeneratedDocumentSummaries } from "@/lib/db/store";

export default async function DocumentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!hasPermission(user, PERMISSIONS.DOCUMENTS_READ)) {
    redirect("/");
  }

  const projects = await listProjectGeneratedDocumentSummaries();
  const totalDocuments = projects.reduce(
    (sum, project) => sum + project.documentCount,
    0,
  );

  return (
    <>
      <Header
        title="Documents"
        subtitle="Livrables HERMES générés automatiquement à la validation de phase"
        user={user}
      />
      <main className="p-8">
        <DocumentsIndexExport
          projectCount={projects.length}
          documentCount={totalDocuments}
        />
        <ProjectDocumentFolders projects={projects} />
      </main>
    </>
  );
}
