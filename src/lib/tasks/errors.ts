export type TaskErrorCode =
  | "titleRequired"
  | "titleTooLong"
  | "descriptionTooLong"
  | "invalidPhase"
  | "invalidAssignee"
  | "invalidDates"
  | "invalidDuration"
  | "invalidPredecessor"
  | "dependencyCycle"
  | "phaseLocked"
  | "notManual"
  | "timeEntriesExist"
  | "projectNotFound"
  | "taskNotFound"
  | "forbidden"
  | "unauthenticated"
  | "invalidRequest";

const MESSAGES: Record<TaskErrorCode, string> = {
  titleRequired: "Le titre de la tâche est requis.",
  titleTooLong: "Le titre est trop long (300 caractères max.).",
  descriptionTooLong: "La description est trop longue (5000 caractères max.).",
  invalidPhase: "Phase HERMES invalide pour ce projet.",
  invalidAssignee: "Utilisateur introuvable ou inactif.",
  invalidDates: "La date de début ne peut pas être postérieure à l'échéance.",
  invalidDuration: "Durée invalide.",
  invalidPredecessor: "Prédécesseur invalide (tâche d'un autre projet ou inexistante).",
  dependencyCycle: "Cette dépendance créerait un cycle.",
  phaseLocked: "La phase et le module d'une tâche HERMES ne sont pas modifiables.",
  notManual: "Seules les tâches créées manuellement peuvent être supprimées.",
  timeEntriesExist: "Des saisies de temps existent sur cette tâche : confirmation requise.",
  projectNotFound: "Projet introuvable.",
  taskNotFound: "Tâche introuvable.",
  forbidden: "Accès refusé.",
  unauthenticated: "Non authentifié.",
  invalidRequest: "Requête invalide.",
};

export class TaskError extends Error {
  constructor(
    readonly code: TaskErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export function taskError(code: TaskErrorCode, details?: Record<string, unknown>): TaskError {
  return new TaskError(code, MESSAGES[code], details);
}

export const TASK_ERROR_STATUS: Partial<Record<TaskErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  projectNotFound: 404,
  taskNotFound: 404,
  timeEntriesExist: 409,
};
