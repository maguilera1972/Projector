import { NextResponse } from "next/server";
import { isTimeAuditAction } from "@/lib/audit/log";
import { getSessionUser } from "@/lib/auth/session";
import {
  canUserActAsChefDeProjet,
  canUserActAsMandant,
} from "@/lib/hermes/project-roles";
import {
  getPortfolioById,
  getProjectById,
  getQualityGateContextForProject,
  listAuditLogByProject,
  listBudgetRevisionsByProject,
  listPhaseValidationsByProject,
} from "@/lib/db/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  const context = await getQualityGateContextForProject(id);
  const budgetRevisions = await listBudgetRevisionsByProject(id);
  const validations = await listPhaseValidationsByProject(id);
  const auditLog = (await listAuditLogByProject(id)).filter(
    (entry) => !isTimeAuditAction(entry.action),
  );

  return NextResponse.json({
    project,
    context,
    budgetRevisions,
    validations,
    auditLog,
    permissions: {
      canSubmit: canUserActAsChefDeProjet(user, project, portfolio),
      canApprove: canUserActAsMandant(user, project),
    },
  });
}
