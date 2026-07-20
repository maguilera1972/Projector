import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserAssignTasksOnProject } from "@/lib/auth/task-assignment";
import {
  deleteTaskDependency,
  getPortfolioById,
  getProjectById,
  getTaskDependencyById,
  getTasksByProject,
  listTaskDependenciesByProject,
} from "@/lib/db/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const dependency = await getTaskDependencyById(id);

  if (!dependency) {
    return NextResponse.json({ error: "Dépendance introuvable." }, { status: 404 });
  }

  const project = await getProjectById(dependency.projectId);
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  if (!canUserAssignTasksOnProject(user, project, portfolio)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const deleted = await deleteTaskDependency(id);
  if (!deleted) {
    return NextResponse.json({ error: "Dépendance introuvable." }, { status: 404 });
  }

  const tasks = await getTasksByProject(dependency.projectId);
  const dependencies = await listTaskDependenciesByProject(dependency.projectId);

  return NextResponse.json({ tasks, dependencies });
}
