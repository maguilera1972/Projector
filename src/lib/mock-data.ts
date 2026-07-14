import type { DashboardStats, Project, Task } from "@/types";

export const mockProjects: Project[] = [
  {
    id: "proj-001",
    name: "Migration infrastructure cloud",
    description:
      "Modernisation de l'infrastructure IT selon la méthode HERMES5 — phase de conception en cours.",
    status: "en_cours",
    currentPhase: "conception",
    progress: 42,
    startDate: "2026-01-15",
    endDate: "2026-09-30",
    chefDeProjet: "Marie Dupont",
    mandant: "Direction des systèmes d'information",
    budget: 450000,
    tasksTotal: 48,
    tasksCompleted: 20,
  },
  {
    id: "proj-002",
    name: "Portail collaboratif interne",
    description:
      "Développement d'un portail de collaboration pour les équipes transverses.",
    status: "en_cours",
    currentPhase: "realisation",
    progress: 68,
    startDate: "2025-10-01",
    endDate: "2026-06-15",
    chefDeProjet: "Jean Martin",
    mandant: "Direction des ressources humaines",
    budget: 280000,
    tasksTotal: 62,
    tasksCompleted: 42,
  },
  {
    id: "proj-003",
    name: "Audit sécurité SI",
    description:
      "Évaluation de la sécurité du système d'information et plan de remédiation.",
    status: "planifie",
    currentPhase: "initialisation",
    progress: 12,
    startDate: "2026-03-01",
    endDate: "2026-08-31",
    chefDeProjet: "Sophie Keller",
    mandant: "Comité de direction",
    budget: 95000,
    tasksTotal: 24,
    tasksCompleted: 3,
  },
  {
    id: "proj-004",
    name: "Refonte processus achats",
    description:
      "Optimisation des processus d'achat et intégration du module HERMES Achat.",
    status: "termine",
    currentPhase: "cloture",
    progress: 100,
    startDate: "2025-03-01",
    endDate: "2025-12-20",
    chefDeProjet: "Pierre Weber",
    mandant: "Service financier",
    budget: 120000,
    tasksTotal: 35,
    tasksCompleted: 35,
  },
];

export const mockTasks: Task[] = [
  {
    id: "task-001",
    projectId: "proj-001",
    title: "Élaborer le dossier d'appel d'offres",
    module: "Achat",
    phase: "conception",
    status: "en_cours",
    assignee: "Marie Dupont",
    dueDate: "2026-07-15",
  },
  {
    id: "task-002",
    projectId: "proj-001",
    title: "Définir les exigences système",
    module: "Exigences",
    phase: "conception",
    status: "a_faire",
    assignee: "Thomas Brun",
    dueDate: "2026-07-20",
  },
  {
    id: "task-003",
    projectId: "proj-002",
    title: "Tests d'acceptation utilisateurs",
    module: "Qualité",
    phase: "realisation",
    status: "en_cours",
    assignee: "Jean Martin",
    dueDate: "2026-07-10",
  },
  {
    id: "task-004",
    projectId: "proj-002",
    title: "Plan de communication",
    module: "Communication",
    phase: "realisation",
    status: "termine",
    assignee: "Laura Fischer",
    dueDate: "2026-06-01",
  },
  {
    id: "task-005",
    projectId: "proj-003",
    title: "Rédiger le mandat de projet",
    module: "Gouvernance",
    phase: "initialisation",
    status: "en_cours",
    assignee: "Sophie Keller",
    dueDate: "2026-07-05",
  },
];

export function getDashboardStats(): DashboardStats {
  const activeProjects = mockProjects.filter(
    (p) => p.status === "en_cours" || p.status === "planifie",
  ).length;

  const completedTasks = mockTasks.filter((t) => t.status === "termine").length;
  const pendingTasks = mockTasks.filter(
    (t) => t.status === "a_faire" || t.status === "en_cours",
  ).length;

  const now = new Date();
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = mockTasks.filter((t) => {
    if (!t.dueDate || t.status === "termine") return false;
    const due = new Date(t.dueDate);
    return due >= now && due <= inTwoWeeks;
  }).length;

  return {
    totalProjects: mockProjects.length,
    activeProjects,
    completedTasks,
    pendingTasks,
    upcomingDeadlines,
  };
}

export function getProjectById(id: string): Project | undefined {
  return mockProjects.find((p) => p.id === id);
}

export function getTasksByProject(projectId: string): Task[] {
  return mockTasks.filter((t) => t.projectId === projectId);
}
