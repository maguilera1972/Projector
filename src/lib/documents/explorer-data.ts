import type { SessionUser } from "@/lib/auth/permissions";
import {
  listAnnexDocumentsByProject,
  listGeneratedDocumentsByProject,
  listProjectFolders,
} from "@/lib/db/store";
import { getProjectDocumentAccess } from "@/lib/documents/annex-access";
import { ALLOWED_ANNEX_EXTENSIONS, getUploadMaxBytes } from "@/lib/documents/annex-storage";
import type { ProjectDocumentsExplorer } from "@/components/project/project-documents-explorer";
import type { ComponentProps } from "react";

export type ExplorerProps = ComponentProps<typeof ProjectDocumentsExplorer>;

/** Données du classeur documentaire d'un projet (dossiers, annexes, livrables HERMES). */
export async function loadProjectDocumentsExplorer(
  projectId: string,
  user: SessionUser,
): Promise<ExplorerProps | null> {
  const access = await getProjectDocumentAccess(projectId, user);
  if (!access?.canRead) return null;

  const [folders, annexes, generated] = await Promise.all([
    listProjectFolders(projectId),
    listAnnexDocumentsByProject(projectId),
    listGeneratedDocumentsByProject(projectId),
  ]);

  return {
    project: {
      id: access.project.id,
      approach: access.project.approach,
      currentPhase: access.project.currentPhase,
      status: access.project.status,
    },
    folders,
    annexes,
    hermesDocuments: generated.map((doc) => ({
      id: doc.id,
      title: doc.title,
      phase: doc.phase,
      version: doc.version,
      generatedAt: doc.generatedAt,
      hasDocx: Boolean(doc.hasDocx),
    })),
    canWrite: access.canWrite,
    canManage: access.canManage,
    currentUserId: user.id,
    maxUploadMb: Math.round(getUploadMaxBytes() / 1024 / 1024),
    acceptExtensions: ALLOWED_ANNEX_EXTENSIONS,
  };
}
