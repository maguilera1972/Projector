import { hasPermission, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";
import { getPortfolioById, getProjectById } from "@/lib/db/store";
import { canUserEditProjectDocuments } from "@/lib/hermes/project-roles";
import type { AnnexCategory, AnnexDocument, HermesPhaseId, Project } from "@/types";
import { ANNEX_CATEGORIES } from "@/types";

export interface ProjectDocumentAccess {
  project: Project;
  canRead: boolean;
  /** Déposer des fichiers, nouvelles versions, créer des sous-dossiers. */
  canWrite: boolean;
  /** Modifier / supprimer les documents des autres (chef de projet, admin). */
  canManage: boolean;
}

export async function getProjectDocumentAccess(
  projectId: string,
  user: SessionUser,
): Promise<ProjectDocumentAccess | null> {
  const project = await getProjectById(projectId);
  if (!project) return null;
  const portfolio = project.portfolioId ? await getPortfolioById(project.portfolioId) : undefined;
  const canRead = hasPermission(user, PERMISSIONS.DOCUMENTS_READ);
  const canWrite = canRead && hasPermission(user, PERMISSIONS.DOCUMENTS_WRITE);
  return {
    project,
    canRead,
    canWrite,
    canManage: canWrite && canUserEditProjectDocuments(user, project, portfolio),
  };
}

export function canEditAnnex(
  access: ProjectDocumentAccess,
  document: AnnexDocument,
  user: SessionUser,
): boolean {
  return access.canManage || (access.canWrite && document.createdBy === user.id);
}

export function parseAnnexCategory(value: unknown): AnnexCategory | undefined {
  return typeof value === "string" && (ANNEX_CATEGORIES as string[]).includes(value)
    ? (value as AnnexCategory)
    : undefined;
}

export function parseAnnexPhases(value: unknown): HermesPhaseId[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = value.split(",");
    }
  }
  if (!Array.isArray(list)) return undefined;
  return list.filter((item): item is HermesPhaseId => typeof item === "string" && item.length < 40);
}
