/** Palette PROJECTOR — extraite du logo */
export const brand = {
  navy: "#1e293b",
  navyDark: "#0f172a",
  navyLight: "#334155",
  cyan: "#7dd3fc",
  indigo: "#818cf8",
  purple: "#a855f7",
  gradient: "linear-gradient(135deg, #7dd3fc 0%, #818cf8 50%, #a855f7 100%)",
  gradientText: "linear-gradient(90deg, #7dd3fc, #818cf8, #a855f7)",
} as const;

export type HermesPhaseId =
  | "initialisation"
  | "conception"
  | "realisation"
  | "introduction"
  | "cloture";

export type ProjectStatus = "planifie" | "en_cours" | "en_pause" | "termine";

export type TaskStatus = "a_faire" | "en_cours" | "termine" | "bloque";

export interface HermesPhase {
  id: HermesPhaseId;
  label: string;
  description: string;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  currentPhase: HermesPhaseId;
  progress: number;
  startDate: string;
  endDate?: string;
  chefDeProjet: string;
  mandant: string;
  budget?: number;
  tasksTotal: number;
  tasksCompleted: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  module: string;
  phase: HermesPhaseId;
  status: TaskStatus;
  assignee?: string;
  dueDate?: string;
}

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedTasks: number;
  pendingTasks: number;
  upcomingDeadlines: number;
}

export const HERMES_PHASES: HermesPhase[] = [
  {
    id: "initialisation",
    label: "Initialisation",
    description: "Définir le mandat, les objectifs et la faisabilité du projet.",
    order: 1,
  },
  {
    id: "conception",
    label: "Conception",
    description: "Élaborer la solution, planifier et préparer la réalisation.",
    order: 2,
  },
  {
    id: "realisation",
    label: "Réalisation",
    description: "Exécuter les travaux et produire les livrables.",
    order: 3,
  },
  {
    id: "introduction",
    label: "Introduction",
    description: "Mettre en service et transférer aux opérations.",
    order: 4,
  },
  {
    id: "cloture",
    label: "Clôture",
    description: "Évaluer, clôturer et capitaliser les acquis.",
    order: 5,
  },
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planifie: "Planifié",
  en_cours: "En cours",
  en_pause: "En pause",
  termine: "Terminé",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
  bloque: "Bloqué",
};
