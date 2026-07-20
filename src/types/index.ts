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

export type HermesApproach = "classic" | "agile";

export type HermesPhaseId =
  | "initialisation"
  | "conception"
  | "realisation"
  | "deploiement"
  | "execution"
  | "cloture";

export type ProjectStatus = "planifie" | "en_cours" | "en_pause" | "termine";

export type BudgetStatus = "draft" | "pending_mandant" | "approved";

export type BudgetRevisionStatus =
  | "pending_mandant"
  | "approved"
  | "rejected"
  | "superseded";

export type PhaseValidationStatus = "submitted" | "approved" | "rejected";

export type PhaseValidationMode = "online" | "session";

export type ProjectDocumentType =
  | "pv_validation_phase"
  | "accord_budget_mandant";

export type ProjectDocumentStatus = "pending_signature" | "signed";

export type TaskStatus = "a_faire" | "en_cours" | "termine" | "bloque";

export type PortfolioStatus = "actif" | "archive";

export interface HermesPhase {
  id: HermesPhaseId;
  label: string;
  description: string;
  order: number;
}

export interface Project {
  id: string;
  portfolioId?: string;
  name: string;
  description: string;
  scenarioId?: string;
  approach: HermesApproach;
  status: ProjectStatus;
  currentPhase: HermesPhaseId;
  progress: number;
  startDate: string;
  endDate?: string;
  chefDeProjet: string;
  chefDeProjetId?: string;
  mandant: string;
  mandantUserId?: string;
  budget?: number;
  budgetHours?: number;
  budgetStatus: BudgetStatus;
  budgetApprovedAt?: string;
  budgetApprovedBy?: string;
  budgetSignature?: string;
  tasksTotal: number;
  tasksCompleted: number;
  createdBy: string;
  createdAt: string;
  /** Langue des documents HERMES générés (défaut : fr). */
  documentLocale?: DocumentLocale;
}

export type DocumentLocale = "fr" | "en";

export interface GeneratedDocument {
  id: string;
  projectId: string;
  templateId: string;
  outcomeKey: string;
  phase: HermesPhaseId;
  validationId: string;
  locale: DocumentLocale;
  version: number;
  title: string;
  contentMarkdown: string;
  /** Fichier Word HERMES généré (generated-documents/…). */
  hasDocx?: boolean;
  /** Origine du fichier Word : généré depuis le gabarit ou importé manuellement. */
  docxSource?: "generated" | "uploaded";
  /** Nom du fichier .docx importé (si docxSource = uploaded). */
  uploadedFileName?: string;
  wordTemplateFile?: string;
  milestone?: string;
  signatureText?: string;
  generatedBy: string;
  generatedByName: string;
  generatedAt: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface UpdateGeneratedDocumentInput {
  title?: string;
  contentMarkdown?: string;
}

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  module: string;
  moduleId?: string;
  phase: HermesPhaseId;
  status: TaskStatus;
  progress: number;
  comments?: string;
  templateId?: string;
  order?: number;
  assigneeId?: string;
  startDate?: string;
  dueDate?: string;
  durationDays?: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
}

export interface TaskDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
  createdAt: string;
}

export interface CreateTaskDependencyInput {
  predecessorId: string;
  successorId: string;
  type?: DependencyType;
  lagDays?: number;
}

export interface TaskScheduleNode {
  taskId: string;
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  slackDays?: number;
  isCritical?: boolean;
}

export interface ProjectScheduleSummary {
  projectId: string;
  projectEnd?: string;
  criticalTaskIds: string[];
  nodes: TaskScheduleNode[];
  dependencies: TaskDependency[];
}

export interface BaselineTaskSnapshot {
  taskId: string;
  startDate?: string;
  dueDate?: string;
  durationDays?: number;
  progress: number;
}

export interface ProjectBaseline {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  snapshots: BaselineTaskSnapshot[];
}

export interface CreateProjectBaselineInput {
  name: string;
  description?: string;
}

export interface GanttTimeline {
  startDate: string;
  endDate: string;
  totalDays: number;
}

export interface GanttBarPosition {
  leftPercent: number;
  widthPercent: number;
}

export interface GanttTaskRow {
  task: Task;
  bar?: GanttBarPosition;
  baselineBar?: GanttBarPosition;
  progress: number;
  isCritical: boolean;
  startVarianceDays?: number;
  finishVarianceDays?: number;
}

export interface Activity {
  id: string;
  taskId: string;
  title: string;
  assigneeId?: string;
  progress: number;
  status: TaskStatus;
  comments?: string;
  startDate?: string;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  progress?: number;
  comments?: string;
  startDate?: string | null;
  dueDate?: string | null;
  durationDays?: number | null;
}

export interface CreateActivityInput {
  title: string;
  assigneeId?: string;
  startDate?: string;
  dueDate?: string;
}

export interface UpdateActivityInput {
  title?: string;
  assigneeId?: string | null;
  progress?: number;
  status?: TaskStatus;
  comments?: string;
  startDate?: string | null;
  dueDate?: string | null;
}

export type SkillLevel = "debutant" | "intermediaire" | "confirme" | "expert";

export interface ResourceGroup {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSkill {
  id: string;
  userId: string;
  groupId: string;
  level: SkillLevel;
}

export interface ResourceProfile {
  userId: string;
  weeklyCapacityPercent: number;
  notes?: string;
  updatedAt: string;
}

export interface CreateResourceGroupInput {
  name: string;
  description: string;
}

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
  confirme: "Confirmé",
  expert: "Expert",
};

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedTasks: number;
  pendingTasks: number;
  upcomingDeadlines: number;
  myOverdueTasks: number;
  pendingPvDocuments: number;
}

export interface PendingPvDocumentItem {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  phase: HermesPhaseId;
  sessionDate: string;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  scenarioId: string;
  approach: HermesApproach;
  portfolioId?: string;
  mandant: string;
  mandantUserId?: string;
  chefDeProjetId: string;
  startDate: string;
  endDate?: string;
  budget?: number;
  budgetHours?: number;
}

export type QualityGateCheckStatus = "ok" | "pending" | "blocked";

export interface QualityGateCheckItem {
  id: string;
  label: string;
  status: QualityGateCheckStatus;
  detail?: string;
}

export interface PhaseValidation {
  id: string;
  projectId: string;
  fromPhase: HermesPhaseId;
  toPhase: HermesPhaseId;
  status: PhaseValidationStatus;
  mode: PhaseValidationMode;
  checklistSnapshot: QualityGateCheckItem[];
  submitComment?: string;
  submittedBy: string;
  submittedAt: string;
  sessionDate?: string;
  recordedBy?: string;
  signatureText?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionComment?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  pvDocumentId?: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  validationId?: string;
  type: ProjectDocumentType;
  title: string;
  phase: HermesPhaseId;
  status: ProjectDocumentStatus;
  sessionDate: string;
  sessionMandantSignature?: string;
  sessionNotes?: string;
  pvSignatureText?: string;
  assignedToUserId: string;
  createdBy: string;
  createdAt: string;
  signedAt?: string;
  signedBy?: string;
}

export interface SessionPhaseValidationInput {
  sessionDate: string;
  mandantSignatureText: string;
  comment?: string;
}

export interface SignProjectDocumentInput {
  pvSignatureText: string;
  notes?: string;
}

export interface BudgetRevision {
  id: string;
  projectId: string;
  amountCHF: number;
  hoursForfait?: number;
  reason?: string;
  status: BudgetRevisionStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  signatureText?: string;
  rejectionComment?: string;
}

export interface AuditLogEntry {
  id: string;
  projectId?: string;
  action: string;
  actorId: string;
  actorName: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type NotificationKind =
  | "task_assigned"
  | "phase_submitted"
  | "phase_approved"
  | "phase_rejected"
  | "budget_revision_requested"
  | "budget_revision_approved"
  | "budget_approval_required"
  | "document_pv_pending";

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  href?: string;
  projectId?: string;
  readAt?: string;
  createdAt: string;
}

export interface QualityGateContext {
  projectId: string;
  currentPhase: HermesPhaseId;
  nextPhase: HermesPhaseId | null;
  approach: HermesApproach;
  gateLabel: string;
  milestone?: string;
  isTerminal: boolean;
  checklist: QualityGateCheckItem[];
  checklistReady: boolean;
  checklistReadyForSession: boolean;
  budgetStatus: BudgetStatus;
  activeValidation: PhaseValidation | null;
  canAdvance: boolean;
  pendingPvDocuments: number;
}

export interface ApproveBudgetInput {
  signatureText: string;
}

export interface ConfirmBudgetInput {
  validationDate: string;
  mandantSignatureText: string;
  comment?: string;
}

export interface SubmitPhaseGateInput {
  comment?: string;
}

export interface ApprovePhaseGateInput {
  signatureText: string;
}

export interface RejectPhaseGateInput {
  comment: string;
}

export interface RequestBudgetRevisionInput {
  amountCHF: number;
  hoursForfait?: number;
  reason?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  status: PortfolioStatus;
  owner: string;
  ownerId?: string;
  sharedResourceIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortfolioInput {
  name: string;
  description: string;
  ownerId: string;
}

export interface PortfolioStats {
  projectCount: number;
  activeProjects: number;
  averageProgress: number;
  totalBudget: number;
}

export const PORTFOLIO_STATUS_LABELS: Record<PortfolioStatus, string> = {
  actif: "Actif",
  archive: "Archivé",
};

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
