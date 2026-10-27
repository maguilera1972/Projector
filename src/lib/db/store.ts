import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
  promises as fs,
} from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import {
  ALL_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  defaultPermissionsForRole,
  getInitialAdmin,
  highestRole,
  isUserActive,
  type AvatarDisplay,
  type DbUser,
  type Permission,
  type User,
  type UserRole,
  type UserStatus,
} from "@/lib/auth/permissions";
import { getInitialAdminPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  notifyBudgetApprovalRequired,
  notifyBudgetRevisionApproved,
  notifyBudgetRevisionRequested,
  notifyPhaseApproved,
  notifyPhaseRejected,
  notifyPhaseSubmitted,
  notifyTaskAssigned,
  notifyDocumentPvPending,
  notifyInvitationAccepted,
} from "@/lib/notifications/dispatch";
import { flushNotificationEmails } from "@/lib/notifications/email";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { buildTasksFromScenario } from "@/lib/hermes/instantiate";
import { getScenarioById } from "@/lib/hermes/referential";
import type {
  Project,
  Task,
  Activity,
  CreateProjectInput,
  Portfolio,
  CreatePortfolioInput,
  PortfolioStats,
  UpdateTaskInput,
  CreateActivityInput,
  UpdateActivityInput,
  TaskStatus,
  ResourceGroup,
  CreateResourceGroupInput,
  UserSkill,
  ResourceProfile,
  SkillLevel,
  TaskDependency,
  CreateTaskDependencyInput,
  ProjectScheduleSummary,
  ProjectBaseline,
  CreateProjectBaselineInput,
  BaselineTaskSnapshot,
  PhaseValidation,
  BudgetRevision,
  AuditLogEntry,
  QualityGateContext,
  ApproveBudgetInput,
  ConfirmBudgetInput,
  GeneratedDocument,
  UpdateGeneratedDocumentInput,
  SubmitPhaseGateInput,
  ApprovePhaseGateInput,
  RejectPhaseGateInput,
  RequestBudgetRevisionInput,
  ProjectDocument,
  SessionPhaseValidationInput,
  SignProjectDocumentInput,
  PendingPvDocumentItem,
  HermesPhaseId,
  Notification,
  Invitation,
  InvitationEmailStatus,
  InvitationStatus,
  InvitationSummary,
  EntraRoleMapping,
  EntraSettings,
  AnnexCategory,
  AnnexDocument,
  AnnexDocumentVersion,
  ProjectFolder,
  EntraUnknownUserPolicy,
} from "@/types";
import { applyActivityAggregation } from "@/lib/tasks/progress";
import { validateScheduleDates } from "@/lib/tasks/dates";
import { addWorkingDays } from "@/lib/scheduling/calendar";
import {
  computeCriticalPath,
  recalculateProjectSchedule,
  syncTaskDurationFromDates,
  wouldCreateDependencyCycle,
} from "@/lib/scheduling/engine";
import { buildQualityGateContext, buildQualityGateChecklist, getInitialBudgetStatus, isChecklistReady, isChecklistReadyForSession } from "@/lib/hermes/quality-gates";
import { getNextPhase, isTerminalPhase, getPhaseLabel, getPhasesForApproach } from "@/lib/hermes/phases";
import {
  getUploadsRoot,
  removeAnnexFile,
  removeProjectAnnexFiles,
  saveAnnexFile,
} from "@/lib/documents/annex-storage";
import { createAuditEntry } from "@/lib/audit/log";
import { generateDocumentsForValidation } from "@/lib/documents/generate";
import {
  buildDocxPayload,
  generateHermesDocxBuffer,
  isValidDocxBuffer,
  regenerateGeneratedDocumentDocx,
  shouldAutoRegenerateDocx,
  writeGeneratedDocx,
  deleteProjectGeneratedDocxFiles,
} from "@/lib/documents/word";
import { resolveWordTemplateFile } from "@/lib/documents/templates";
import { findUserActiveProjectLinks } from "@/lib/users/project-links";

function getPrimaryDbFile(): string {
  return path.join(process.cwd(), "data", "projector.json");
}

function getFallbackDbFile(): string {
  return path.join(process.cwd(), ".local", "projector-data", "projector.json");
}

function getLiveMarkerFile(): string {
  return path.join(process.cwd(), ".local", "projector-data", ".live");
}

function canWritePath(filePath: string): boolean {
  try {
    const dir = path.dirname(filePath);
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    if (existsSync(filePath)) {
      accessSync(filePath, constants.W_OK);
    } else {
      const probe = path.join(dir, `.write-probe-${process.pid}`);
      writeFileSync(probe, "ok");
      unlinkSync(probe);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Source de vérité unique et accessible en écriture.
 * - Préfère data/projector.json si writable.
 * - Sinon .local/projector-data/projector.json (copie initiale unique).
 * - Une fois marquée « live », la base locale n'est plus jamais écrasée par data/
 *   (évite la réapparition d'éléments supprimés après redémarrage / rebuild).
 */
function resolveDbFile(): string {
  if (process.env.PROJECTOR_DB_FILE) {
    const configured = process.env.PROJECTOR_DB_FILE;
    mkdirSync(path.dirname(configured), { recursive: true });
    return configured;
  }

  const primaryFile = getPrimaryDbFile();
  if (canWritePath(primaryFile)) {
    return primaryFile;
  }

  const fallbackFile = getFallbackDbFile();
  const liveMarker = getLiveMarkerFile();
  mkdirSync(path.dirname(fallbackFile), { recursive: true });

  const alreadyLive = existsSync(liveMarker) || existsSync(fallbackFile);
  if (!alreadyLive && existsSync(primaryFile)) {
    copyFileSync(primaryFile, fallbackFile);
  }

  if (!existsSync(liveMarker)) {
    writeFileSync(
      liveMarker,
      `live-db=${fallbackFile}\nsince=${new Date().toISOString()}\n`,
      "utf-8",
    );
  }

  return fallbackFile;
}

const DB_FILE = resolveDbFile();

/** Sérialise les mutations pour éviter les courses lecture/écriture concurrentes. */
let writeChain: Promise<void> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getActiveDatabasePath(): string {
  return DB_FILE;
}

interface Database {
  version: number;
  users: DbUser[];
  portfolios: Portfolio[];
  projects: Project[];
  tasks: Task[];
  activities: Activity[];
  resourceGroups: ResourceGroup[];
  userSkills: UserSkill[];
  resourceProfiles: ResourceProfile[];
  taskDependencies: TaskDependency[];
  projectBaselines: ProjectBaseline[];
  phaseValidations: PhaseValidation[];
  budgetRevisions: BudgetRevision[];
  auditLog: AuditLogEntry[];
  projectDocuments: ProjectDocument[];
  generatedDocuments: GeneratedDocument[];
  notifications: Notification[];
  invitations: Invitation[];
  entraSettings: EntraSettings;
  annexDocuments: AnnexDocument[];
  projectFolders: ProjectFolder[];
}

export function generalFolderId(projectId: string): string {
  return `${projectId}__general`;
}

export function phaseFolderId(projectId: string, phase: HermesPhaseId): string {
  return `${projectId}__phase__${phase}`;
}

/**
 * Garantit le dossier « Général » et un dossier par phase de l'approche du projet.
 * N'efface jamais de dossier existant (changement d'approche : ajout des manquants).
 */
function ensureProjectFolders(
  folders: ProjectFolder[],
  project: Project,
  now = new Date().toISOString(),
): boolean {
  let changed = false;
  const existing = new Set(
    folders.filter((folder) => folder.projectId === project.id).map((folder) => folder.id),
  );
  const general = generalFolderId(project.id);
  if (!existing.has(general)) {
    folders.push({ id: general, projectId: project.id, kind: "general", order: 0, createdAt: now });
    changed = true;
  }
  for (const phase of getPhasesForApproach(project.approach)) {
    const id = phaseFolderId(project.id, phase.id);
    if (!existing.has(id)) {
      folders.push({
        id,
        projectId: project.id,
        kind: "phase",
        phase: phase.id,
        order: phase.order,
        createdAt: now,
      });
      changed = true;
    }
  }
  return changed;
}

const DEFAULT_ENTRA_SETTINGS: EntraSettings = {
  unknownUserPolicy: "pending",
  mappings: [],
};

function normalizeDatabase(raw: Partial<Database>): Database {
  const tasks = (raw.tasks ?? []).map((task) => ({
    ...task,
    progress: task.progress ?? 0,
  }));

  const portfolios = (raw.portfolios ?? []).map((portfolio) => ({
    ...portfolio,
    sharedResourceIds: portfolio.sharedResourceIds ?? [],
  }));

  const projects = (raw.projects ?? []).map((project) => ({
    ...project,
    budgetStatus:
      project.budgetStatus ??
      (project.status !== "planifie" ? "approved" : "pending_mandant"),
  }));

  return {
    version: raw.version ?? 10,
    users: (raw.users ?? []).map((user) => {
      const record = user as DbUser & {
        active?: boolean;
        status?: UserStatus;
        avatarDisplay?: AvatarDisplay;
      };
      const status =
        record.status ??
        (record.active === false ? "suspended" : "active");
      const { active: _active, ...rest } = record;
      return {
        ...rest,
        status,
        avatarDisplay: record.avatarDisplay ?? "initials",
      };
    }),
    portfolios,
    projects,
    tasks,
    activities: raw.activities ?? [],
    resourceGroups: raw.resourceGroups ?? [],
    userSkills: raw.userSkills ?? [],
    resourceProfiles: raw.resourceProfiles ?? [],
    taskDependencies: raw.taskDependencies ?? [],
    projectBaselines: raw.projectBaselines ?? [],
    phaseValidations: (raw.phaseValidations ?? []).map((validation) => ({
      ...validation,
      mode: validation.mode ?? "online",
    })),
    budgetRevisions: raw.budgetRevisions ?? [],
    auditLog: raw.auditLog ?? [],
    projectDocuments: raw.projectDocuments ?? [],
    generatedDocuments: raw.generatedDocuments ?? [],
    notifications: raw.notifications ?? [],
    invitations: raw.invitations ?? [],
    annexDocuments: (raw.annexDocuments ?? []).map((doc) => ({
      ...doc,
      folderId:
        doc.folderId ??
        (doc.phases?.length === 1
          ? phaseFolderId(doc.projectId, doc.phases[0])
          : generalFolderId(doc.projectId)),
    })),
    projectFolders: (() => {
      const folders = [...(raw.projectFolders ?? [])];
      for (const project of projects) ensureProjectFolders(folders, project);
      return folders;
    })(),
    entraSettings: {
      ...DEFAULT_ENTRA_SETTINGS,
      ...(raw.entraSettings ?? {}),
      mappings: raw.entraSettings?.mappings ?? [],
    },
  };
}

function stripPassword(user: DbUser): User {
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

async function loadDatabaseFromDisk(): Promise<Database> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    return normalizeDatabase(JSON.parse(raw) as Partial<Database>);
  } catch {
    const db: Database = {
      version: 2,
      users: [
        {
          id: crypto.randomUUID(),
          email: getInitialAdmin().email,
          name: getInitialAdmin().name,
          role: "admin",
          passwordHash: hashPassword(getInitialAdminPassword()),
          permissions: [...ALL_PERMISSIONS],
          createdAt: new Date().toISOString(),
          status: "active",
          avatarDisplay: "initials",
        },
      ],
      portfolios: [],
      projects: [],
      tasks: [],
      activities: [],
      resourceGroups: [],
      userSkills: [],
      resourceProfiles: [],
      taskDependencies: [],
      projectBaselines: [],
      phaseValidations: [],
      budgetRevisions: [],
      auditLog: [],
      projectDocuments: [],
      generatedDocuments: [],
      notifications: [],
      invitations: [],
      annexDocuments: [],
      projectFolders: [],
      entraSettings: { ...DEFAULT_ENTRA_SETTINGS, mappings: [] },
    };

    await persistDatabaseAtomic(db);
    return db;
  }
}

async function persistDatabaseAtomic(db: Database): Promise<void> {
  const dir = path.dirname(DB_FILE);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(db, null, 2);
  const tmpFile = path.join(
    dir,
    `.projector.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    await fs.writeFile(tmpFile, payload, "utf-8");
    await fs.rename(tmpFile, DB_FILE);
  } catch (error) {
    try {
      await fs.unlink(tmpFile);
    } catch {
      /* ignore */
    }
    throw error;
  }

  // Vérifie immédiatement que le fichier lu correspond à ce qui vient d'être écrit.
  const verify = await fs.readFile(DB_FILE, "utf-8");
  if (verify !== payload) {
    throw new Error(
      `Écriture base de données incohérente (${DB_FILE}). Les modifications n'ont pas été persistées.`,
    );
  }

  // Marque la base locale comme source de vérité (jamais écrasée par data/).
  if (DB_FILE === getFallbackDbFile()) {
    const marker = getLiveMarkerFile();
    if (!existsSync(marker)) {
      writeFileSync(
        marker,
        `live-db=${DB_FILE}\nsince=${new Date().toISOString()}\n`,
        "utf-8",
      );
    }
  }
}

/** Cache mémoire process-local + file d'attente pour sérialiser les mutations. */
let memoryDb: Database | null = null;

async function readDatabase(): Promise<Database> {
  return withWriteLock(async () => {
    if (!memoryDb) {
      memoryDb = await loadDatabaseFromDisk();
    }
    return memoryDb;
  });
}

async function writeDatabase(db: Database): Promise<void> {
  await withWriteLock(async () => {
    memoryDb = db;
    await persistDatabaseAtomic(db);
  });
  flushNotificationEmails(db.users);
}

/**
 * Mutation atomique : charge (ou réutilise) la DB, applique le mutateur, persiste.
 * À privilégier pour toute opération d'ajout / suppression / mise à jour.
 */
async function mutateDatabase<T>(
  mutator: (db: Database) => T | Promise<T>,
): Promise<T> {
  const result = await withWriteLock(async () => {
    if (!memoryDb) {
      memoryDb = await loadDatabaseFromDisk();
    }
    const value = await mutator(memoryDb);
    await persistDatabaseAtomic(memoryDb);
    return value;
  });
  if (memoryDb) flushNotificationEmails(memoryDb.users);
  return result;
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<User | null> {
  const db = await readDatabase();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && isUserActive(u),
  );

  if (!user) return null;

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return stripPassword(user);
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await readDatabase();
  const user = db.users.find((u) => u.id === id && isUserActive(u));
  return user ? stripPassword(user) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await readDatabase();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && isUserActive(u),
  );
  return user ? stripPassword(user) : null;
}

export async function getUserByIdAny(id: string): Promise<User | null> {
  const db = await readDatabase();
  const user = db.users.find((u) => u.id === id);
  return user ? stripPassword(user) : null;
}

export async function listUsers(): Promise<User[]> {
  const db = await readDatabase();
  return db.users.filter(isUserActive).map(stripPassword);
}

export async function listAllUsers(): Promise<User[]> {
  const db = await readDatabase();
  return db.users.map(stripPassword);
}

export async function listProjects(portfolioId?: string): Promise<Project[]> {
  const db = await readDatabase();
  if (portfolioId) {
    return db.projects.filter((p) => p.portfolioId === portfolioId);
  }
  return db.projects;
}

export async function listPortfolios(
  includeArchived = false,
): Promise<Portfolio[]> {
  const db = await readDatabase();
  return db.portfolios.filter(
    (p) => includeArchived || p.status === "actif",
  );
}

export async function getPortfolioById(
  id: string,
): Promise<Portfolio | undefined> {
  const db = await readDatabase();
  return db.portfolios.find((p) => p.id === id);
}

export async function getPortfolioStats(
  portfolioId: string,
): Promise<PortfolioStats> {
  const projects = await listProjects(portfolioId);
  const activeProjects = projects.filter(
    (p) => p.status === "en_cours" || p.status === "planifie",
  ).length;
  const averageProgress =
    projects.length === 0
      ? 0
      : Math.round(
          projects.reduce((sum, p) => sum + p.progress, 0) / projects.length,
        );
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

  return {
    projectCount: projects.length,
    activeProjects,
    averageProgress,
    totalBudget,
  };
}

export async function createPortfolio(
  input: CreatePortfolioInput,
  createdBy: string,
): Promise<Portfolio> {
  const db = await readDatabase();
  const now = new Date().toISOString();

  const owner = db.users.find(
    (user) => user.id === input.ownerId && isUserActive(user),
  );
  if (!owner) {
    throw new Error("Responsable du portfolio introuvable ou inactif.");
  }

  const portfolio: Portfolio = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    status: "actif",
    owner: owner.name,
    ownerId: owner.id,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  db.portfolios.push(portfolio);
  await writeDatabase(db);
  return portfolio;
}

export async function updatePortfolio(
  id: string,
  input: Partial<CreatePortfolioInput>,
): Promise<Portfolio | null> {
  const db = await readDatabase();
  const index = db.portfolios.findIndex((p) => p.id === id);
  if (index === -1) return null;

  if (input.name?.trim()) db.portfolios[index].name = input.name.trim();
  if (input.description !== undefined) {
    db.portfolios[index].description = input.description.trim();
  }
  if (input.ownerId) {
    const owner = db.users.find(
      (user) => user.id === input.ownerId && isUserActive(user),
    );
    if (!owner) {
      throw new Error("Responsable du portfolio introuvable ou inactif.");
    }
    db.portfolios[index].owner = owner.name;
    db.portfolios[index].ownerId = owner.id;
  }
  db.portfolios[index].updatedAt = new Date().toISOString();

  await writeDatabase(db);
  return db.portfolios[index];
}

export async function archivePortfolio(id: string): Promise<Portfolio | null> {
  const db = await readDatabase();
  const portfolio = db.portfolios.find((p) => p.id === id);
  if (!portfolio) return null;

  portfolio.status = "archive";
  portfolio.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  return portfolio;
}

export async function deletePortfolio(portfolioId: string): Promise<{
  deletedProjects: number;
} | null> {
  const result = await mutateDatabase((db) => {
    const index = db.portfolios.findIndex((p) => p.id === portfolioId);
    if (index === -1) return null;

    const projectIds = db.projects
      .filter((p) => p.portfolioId === portfolioId)
      .map((p) => p.id);

    const deletedTaskIds = db.tasks
      .filter((task) => projectIds.includes(task.projectId))
      .map((task) => task.id);

    db.portfolios.splice(index, 1);
    db.projects = db.projects.filter((p) => p.portfolioId !== portfolioId);
    db.tasks = db.tasks.filter((t) => !projectIds.includes(t.projectId));
    db.activities = db.activities.filter(
      (activity) => !deletedTaskIds.includes(activity.taskId),
    );
    db.taskDependencies = db.taskDependencies.filter(
      (dep) => !projectIds.includes(dep.projectId),
    );
    db.projectBaselines = db.projectBaselines.filter(
      (baseline) => !projectIds.includes(baseline.projectId),
    );
    db.phaseValidations = db.phaseValidations.filter(
      (item) => !projectIds.includes(item.projectId),
    );
    db.budgetRevisions = db.budgetRevisions.filter(
      (item) => !projectIds.includes(item.projectId),
    );
    db.auditLog = db.auditLog.filter(
      (item) => !item.projectId || !projectIds.includes(item.projectId),
    );
    db.projectDocuments = db.projectDocuments.filter(
      (item) => !projectIds.includes(item.projectId),
    );
    db.generatedDocuments = db.generatedDocuments.filter(
      (item) => !projectIds.includes(item.projectId),
    );
    db.notifications = db.notifications.filter(
      (item) => !item.projectId || !projectIds.includes(item.projectId),
    );
    db.annexDocuments = db.annexDocuments.filter(
      (item) => !projectIds.includes(item.projectId),
    );
    db.projectFolders = db.projectFolders.filter(
      (item) => !projectIds.includes(item.projectId),
    );

    return { deletedProjects: projectIds.length, projectIds };
  });

  if (!result) return null;

  await Promise.all(
    result.projectIds.flatMap((projectId) => [
      deleteProjectGeneratedDocxFiles(projectId),
      removeProjectAnnexFiles(getAnnexUploadsRoot(), projectId).catch(() => undefined),
    ]),
  );
  return { deletedProjects: result.deletedProjects };
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const db = await readDatabase();
  return db.projects.find((p) => p.id === id);
}

export async function listTasks(): Promise<Task[]> {
  const db = await readDatabase();
  return db.tasks;
}

export async function listActivities(): Promise<Activity[]> {
  const db = await readDatabase();
  return db.activities;
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const db = await readDatabase();
  return db.tasks.filter((t) => t.projectId === projectId);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const db = await readDatabase();
  return db.tasks.find((t) => t.id === id);
}

export async function updateTaskAssignee(
  taskId: string,
  assigneeId: string | null,
  actorId?: string,
): Promise<Task> {
  const db = await readDatabase();
  const task = db.tasks.find((t) => t.id === taskId);

  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  if (assigneeId) {
    const assignee = db.users.find((u) => u.id === assigneeId && isUserActive(u));
    if (!assignee) {
      throw new Error("Utilisateur introuvable ou inactif.");
    }
    task.assigneeId = assigneeId;

    const project = db.projects.find((item) => item.id === task.projectId);
    if (project) {
      notifyTaskAssigned(
        db.notifications,
        db.users,
        project,
        task,
        assigneeId,
        actorId,
      );
    }
  } else {
    delete task.assigneeId;
  }

  await writeDatabase(db);
  return task;
}

function syncProjectTaskStats(db: Database, projectId: string): void {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return;

  const projectTasks = db.tasks.filter((task) => task.projectId === projectId);
  project.tasksTotal = projectTasks.length;
  project.tasksCompleted = projectTasks.filter(
    (task) => task.status === "termine",
  ).length;
  project.progress =
    projectTasks.length === 0
      ? 0
      : Math.round(
          projectTasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) /
            projectTasks.length,
        );
}

function getActivitiesForTask(db: Database, taskId: string): Activity[] {
  return db.activities
    .filter((activity) => activity.taskId === taskId)
    .sort((a, b) => a.order - b.order);
}

function recalculateTaskFromActivities(db: Database, task: Task): void {
  const activities = getActivitiesForTask(db, task.id);
  if (activities.length === 0) return;

  const aggregated = applyActivityAggregation(task, activities);
  task.progress = aggregated.progress;
  task.status = aggregated.status;
  task.updatedAt = new Date().toISOString();
}

export async function getActivitiesByTaskId(
  taskId: string,
): Promise<Activity[]> {
  const db = await readDatabase();
  return getActivitiesForTask(db, taskId);
}

export async function updateTaskFields(
  taskId: string,
  input: UpdateTaskInput,
  updatedBy: string,
): Promise<Task> {
  const db = await readDatabase();
  const task = db.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  const activities = getActivitiesForTask(db, taskId);
  const hasActivities = activities.length > 0;

  if (input.status !== undefined && !hasActivities) {
    task.status = input.status;
  }

  if (input.progress !== undefined && !hasActivities) {
    task.progress = Math.max(0, Math.min(100, input.progress));
    if (task.progress === 100) {
      task.status = "termine";
    } else if (task.progress > 0 && task.status === "a_faire") {
      task.status = "en_cours";
    }
  }

  if (input.comments !== undefined) {
    task.comments = input.comments.trim();
  }

  if ("startDate" in input) {
    task.startDate = input.startDate?.trim() || undefined;
  }

  if ("dueDate" in input) {
    task.dueDate = input.dueDate?.trim() || undefined;
  }

  if ("durationDays" in input) {
    task.durationDays =
      input.durationDays && input.durationDays > 0
        ? input.durationDays
        : undefined;
  }

  if (
    task.startDate &&
    task.durationDays &&
    !("dueDate" in input && input.dueDate)
  ) {
    task.dueDate = addWorkingDays(task.startDate, task.durationDays - 1);
  }

  validateScheduleDates(task.startDate, task.dueDate);

  const scheduleChanged =
    "startDate" in input || "dueDate" in input || "durationDays" in input;

  if (scheduleChanged) {
    syncTaskDurationFromDates(task);
    applyScheduleRecalculation(db, task.projectId, task.id);
  }

  if (input.status === "termine" && !task.completedAt) {
    task.completedAt = new Date().toISOString();
  }

  if (input.status !== undefined && input.status !== "termine") {
    delete task.completedAt;
  }

  task.updatedAt = new Date().toISOString();
  syncProjectTaskStats(db, task.projectId);
  await writeDatabase(db);
  return task;
}

export async function startTask(taskId: string): Promise<Task> {
  const db = await readDatabase();
  const task = db.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  if (task.status === "termine") {
    throw new Error("Une tâche terminée ne peut pas être démarrée.");
  }

  if (task.startedAt) {
    throw new Error("Cette tâche est déjà démarrée.");
  }

  const now = new Date().toISOString();
  task.startedAt = now;
  task.updatedAt = now;

  const activities = getActivitiesForTask(db, taskId);
  if (activities.length === 0 && task.status === "a_faire") {
    task.status = "en_cours";
  }

  syncProjectTaskStats(db, task.projectId);
  await writeDatabase(db);
  return task;
}

export async function createActivity(
  taskId: string,
  input: CreateActivityInput,
  createdBy: string,
): Promise<Activity> {
  const db = await readDatabase();
  const task = db.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  if (!input.title.trim()) {
    throw new Error("Le titre de l'activité est requis.");
  }

  if (input.assigneeId) {
    const assignee = db.users.find(
      (user) => user.id === input.assigneeId && isUserActive(user),
    );
    if (!assignee) {
      throw new Error("Utilisateur introuvable ou inactif.");
    }
  }

  validateScheduleDates(input.startDate, input.dueDate);

  const now = new Date().toISOString();
  const existing = getActivitiesForTask(db, taskId);
  const activity: Activity = {
    id: crypto.randomUUID(),
    taskId,
    title: input.title.trim(),
    assigneeId: input.assigneeId || undefined,
    progress: 0,
    status: "a_faire",
    comments: "",
    startDate: input.startDate?.trim() || undefined,
    dueDate: input.dueDate?.trim() || undefined,
    order: existing.length + 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: createdBy,
  };

  db.activities.push(activity);
  recalculateTaskFromActivities(db, task);
  syncProjectTaskStats(db, task.projectId);
  await writeDatabase(db);
  return activity;
}

export async function updateActivityFields(
  activityId: string,
  input: UpdateActivityInput,
  updatedBy: string,
): Promise<Activity> {
  const db = await readDatabase();
  const activity = db.activities.find((item) => item.id === activityId);

  if (!activity) {
    throw new Error("Activité introuvable.");
  }

  const task = db.tasks.find((item) => item.id === activity.taskId);
  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  if (input.title !== undefined) {
    if (!input.title.trim()) {
      throw new Error("Le titre de l'activité est requis.");
    }
    activity.title = input.title.trim();
  }

  if ("assigneeId" in input) {
    if (input.assigneeId) {
      const assignee = db.users.find(
        (user) => user.id === input.assigneeId && isUserActive(user),
      );
      if (!assignee) {
        throw new Error("Utilisateur introuvable ou inactif.");
      }
      activity.assigneeId = input.assigneeId;
    } else {
      delete activity.assigneeId;
    }
  }

  if (input.progress !== undefined) {
    activity.progress = Math.max(0, Math.min(100, input.progress));
    if (activity.progress === 100) {
      activity.status = "termine";
    } else if (activity.progress > 0 && activity.status === "a_faire") {
      activity.status = "en_cours";
    }
  }

  if (input.status !== undefined) {
    activity.status = input.status;
    if (input.status === "termine") {
      activity.progress = 100;
    }
  }

  if (input.comments !== undefined) {
    activity.comments = input.comments.trim();
  }

  if ("startDate" in input) {
    activity.startDate = input.startDate?.trim() || undefined;
  }

  if ("dueDate" in input) {
    activity.dueDate = input.dueDate?.trim() || undefined;
  }

  validateScheduleDates(activity.startDate, activity.dueDate);

  if (input.status === "termine" && !activity.completedAt) {
    activity.completedAt = new Date().toISOString();
  }

  if (input.status !== undefined && input.status !== "termine") {
    delete activity.completedAt;
  }

  activity.updatedAt = new Date().toISOString();
  activity.updatedBy = updatedBy;

  recalculateTaskFromActivities(db, task);
  syncProjectTaskStats(db, task.projectId);
  await writeDatabase(db);
  return activity;
}

export async function startActivity(activityId: string): Promise<Activity> {
  const db = await readDatabase();
  const activity = db.activities.find((item) => item.id === activityId);

  if (!activity) {
    throw new Error("Activité introuvable.");
  }

  if (activity.status === "termine") {
    throw new Error("Une activité terminée ne peut pas être démarrée.");
  }

  if (activity.startedAt) {
    throw new Error("Cette activité est déjà démarrée.");
  }

  const task = db.tasks.find((item) => item.id === activity.taskId);
  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  const now = new Date().toISOString();
  activity.startedAt = now;
  activity.updatedAt = now;

  if (activity.status === "a_faire") {
    activity.status = "en_cours";
  }

  if (!task.startedAt) {
    task.startedAt = now;
    task.updatedAt = now;
  }

  recalculateTaskFromActivities(db, task);
  syncProjectTaskStats(db, task.projectId);
  await writeDatabase(db);
  return activity;
}

export async function deleteActivity(activityId: string): Promise<boolean> {
  const db = await readDatabase();
  const index = db.activities.findIndex((item) => item.id === activityId);

  if (index === -1) return false;

  const activity = db.activities[index];
  const task = db.tasks.find((item) => item.id === activity.taskId);

  db.activities.splice(index, 1);

  db.activities
    .filter((item) => item.taskId === activity.taskId)
    .sort((a, b) => a.order - b.order)
    .forEach((item, orderIndex) => {
      item.order = orderIndex + 1;
    });

  if (task) {
    recalculateTaskFromActivities(db, task);
    syncProjectTaskStats(db, task.projectId);
  }

  await writeDatabase(db);
  return true;
}

export async function createProject(
  input: CreateProjectInput,
  createdBy: string,
): Promise<Project> {
  const db = await readDatabase();

  if (input.portfolioId) {
    const portfolio = db.portfolios.find((p) => p.id === input.portfolioId);
    if (!portfolio || portfolio.status !== "actif") {
      throw new Error("Portfolio introuvable ou archivé.");
    }
  }

  const scenario = getScenarioById(input.scenarioId);
  if (!scenario) {
    throw new Error("Scénario HERMES introuvable.");
  }

  const chef = db.users.find(
    (user) => user.id === input.chefDeProjetId && isUserActive(user),
  );
  if (!chef) {
    throw new Error("Chef de projet introuvable ou inactif.");
  }

  const projectId = crypto.randomUUID();
  const tasks = buildTasksFromScenario(
    projectId,
    input.scenarioId,
    input.approach,
  );

  const mandantUser = input.mandantUserId
    ? db.users.find((user) => user.id === input.mandantUserId && isUserActive(user))
    : undefined;

  const project: Project = {
    id: projectId,
    portfolioId: input.portfolioId || undefined,
    name: input.name.trim(),
    description: input.description.trim(),
    scenarioId: input.scenarioId,
    approach: input.approach,
    status: "planifie",
    currentPhase: "initialisation",
    progress: 0,
    startDate: input.startDate,
    endDate: input.endDate || undefined,
    chefDeProjet: chef.name,
    chefDeProjetId: chef.id,
    mandant: mandantUser?.name ?? input.mandant.trim(),
    mandantUserId: mandantUser?.id,
    budget: input.budget,
    budgetHours: input.budgetHours,
    budgetStatus: getInitialBudgetStatus(input.budget, input.budgetHours),
    tasksTotal: tasks.length,
    tasksCompleted: 0,
    createdBy,
    createdAt: new Date().toISOString(),
    documentLocale: input.documentLocale ?? "fr",
  };

  db.projects.push(project);
  db.tasks.push(...tasks);
  ensureProjectFolders(db.projectFolders, project);

  if (project.budgetStatus === "pending_mandant") {
    notifyBudgetApprovalRequired(db.notifications, db.users, project);
  }

  await writeDatabase(db);
  return project;
}

export async function updateProjectLocale(
  projectId: string,
  locale: Locale,
): Promise<Project | null> {
  return mutateDatabase((db) => {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return null;
    project.documentLocale = locale;
    return project;
  });
}

export async function assignProjectToPortfolio(
  projectId: string,
  portfolioId: string | null,
): Promise<Project> {
  const db = await readDatabase();
  const project = db.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (portfolioId) {
    const portfolio = db.portfolios.find((p) => p.id === portfolioId);
    if (!portfolio || portfolio.status !== "actif") {
      throw new Error("Portfolio introuvable ou archivé.");
    }
  }

  project.portfolioId = portfolioId ?? undefined;
  await writeDatabase(db);
  return project;
}

export async function updateProjectMandant(
  projectId: string,
  mandantUserId: string | null,
): Promise<Project> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (mandantUserId === null || mandantUserId === "") {
    delete project.mandantUserId;
    await writeDatabase(db);
    return project;
  }

  const mandantUser = db.users.find(
    (user) => user.id === mandantUserId && isUserActive(user),
  );

  if (!mandantUser) {
    throw new Error("Utilisateur mandant introuvable ou inactif.");
  }

  project.mandantUserId = mandantUser.id;
  project.mandant = mandantUser.name;
  await writeDatabase(db);
  return project;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const deleted = await mutateDatabase((db) => {
    const index = db.projects.findIndex((p) => p.id === projectId);
    if (index === -1) return false;

    db.projects.splice(index, 1);
    const deletedTaskIds = db.tasks
      .filter((task) => task.projectId === projectId)
      .map((task) => task.id);
    db.tasks = db.tasks.filter((t) => t.projectId !== projectId);
    db.activities = db.activities.filter(
      (activity) => !deletedTaskIds.includes(activity.taskId),
    );
    db.taskDependencies = db.taskDependencies.filter(
      (dep) => dep.projectId !== projectId,
    );
    db.projectBaselines = db.projectBaselines.filter(
      (baseline) => baseline.projectId !== projectId,
    );
    db.phaseValidations = db.phaseValidations.filter(
      (item) => item.projectId !== projectId,
    );
    db.budgetRevisions = db.budgetRevisions.filter(
      (item) => item.projectId !== projectId,
    );
    db.auditLog = db.auditLog.filter(
      (item) => item.projectId !== projectId,
    );
    db.projectDocuments = db.projectDocuments.filter(
      (item) => item.projectId !== projectId,
    );
    db.generatedDocuments = db.generatedDocuments.filter(
      (item) => item.projectId !== projectId,
    );
    db.notifications = db.notifications.filter(
      (item) => item.projectId !== projectId,
    );
    db.annexDocuments = db.annexDocuments.filter(
      (item) => item.projectId !== projectId,
    );
    db.projectFolders = db.projectFolders.filter(
      (item) => item.projectId !== projectId,
    );
    return true;
  });

  if (deleted) {
    // Nettoyage fichiers : ne bloque jamais la réponse API
    void deleteProjectGeneratedDocxFiles(projectId).catch((error) => {
      console.warn(`deleteProjectGeneratedDocxFiles(${projectId}):`, error);
    });
    void removeProjectAnnexFiles(getAnnexUploadsRoot(), projectId).catch((error) => {
      console.warn(`removeProjectAnnexFiles(${projectId}):`, error);
    });
  }
  return deleted;
}

function getProjectDependencies(db: Database, projectId: string): TaskDependency[] {
  return db.taskDependencies.filter((dep) => dep.projectId === projectId);
}

function applyScheduleRecalculation(
  db: Database,
  projectId: string,
  fromTaskId?: string,
): void {
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return;

  const projectTasks = db.tasks.filter((task) => task.projectId === projectId);
  const dependencies = getProjectDependencies(db, projectId);

  if (dependencies.length === 0) {
    return;
  }

  const recalculated = recalculateProjectSchedule(
    projectTasks,
    dependencies,
    {
      anchorStart: project.startDate,
      fromTaskId,
    },
  );

  for (const updated of recalculated) {
    const index = db.tasks.findIndex((task) => task.id === updated.id);
    if (index === -1) continue;
    db.tasks[index].startDate = updated.startDate;
    db.tasks[index].dueDate = updated.dueDate;
    db.tasks[index].durationDays = updated.durationDays;
    db.tasks[index].updatedAt = new Date().toISOString();
  }
}

export async function listTaskDependenciesByProject(
  projectId: string,
): Promise<TaskDependency[]> {
  const db = await readDatabase();
  return getProjectDependencies(db, projectId);
}

export async function createTaskDependency(
  projectId: string,
  input: CreateTaskDependencyInput,
): Promise<TaskDependency> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  const predecessor = db.tasks.find(
    (task) => task.id === input.predecessorId && task.projectId === projectId,
  );
  const successor = db.tasks.find(
    (task) => task.id === input.successorId && task.projectId === projectId,
  );

  if (!predecessor || !successor) {
    throw new Error("Les tâches doivent appartenir au même projet.");
  }

  if (input.predecessorId === input.successorId) {
    throw new Error("Une tâche ne peut pas dépendre d'elle-même.");
  }

  const existing = getProjectDependencies(db, projectId);
  if (
    wouldCreateDependencyCycle(
      existing,
      input.predecessorId,
      input.successorId,
    )
  ) {
    throw new Error("Cette dépendance créerait un cycle.");
  }

  const duplicate = existing.some(
    (dep) =>
      dep.predecessorId === input.predecessorId &&
      dep.successorId === input.successorId,
  );
  if (duplicate) {
    throw new Error("Cette dépendance existe déjà.");
  }

  const dependency: TaskDependency = {
    id: crypto.randomUUID(),
    projectId,
    predecessorId: input.predecessorId,
    successorId: input.successorId,
    type: input.type ?? "FS",
    lagDays: input.lagDays ?? 0,
    createdAt: new Date().toISOString(),
  };

  db.taskDependencies.push(dependency);
  applyScheduleRecalculation(db, projectId, input.predecessorId);
  await writeDatabase(db);
  return dependency;
}

export async function deleteTaskDependency(id: string): Promise<boolean> {
  const db = await readDatabase();
  const index = db.taskDependencies.findIndex((dep) => dep.id === id);

  if (index === -1) {
    return false;
  }

  const { projectId } = db.taskDependencies[index];
  db.taskDependencies.splice(index, 1);
  applyScheduleRecalculation(db, projectId);
  await writeDatabase(db);
  return true;
}

export async function getTaskDependencyById(
  id: string,
): Promise<TaskDependency | undefined> {
  const db = await readDatabase();
  return db.taskDependencies.find((dep) => dep.id === id);
}

export async function getProjectScheduleSummary(
  projectId: string,
): Promise<ProjectScheduleSummary | null> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    return null;
  }

  const tasks = db.tasks.filter((task) => task.projectId === projectId);
  const dependencies = getProjectDependencies(db, projectId);
  const { nodes, criticalTaskIds, projectEnd } = computeCriticalPath(
    tasks,
    dependencies,
    project.startDate,
  );

  return {
    projectId,
    projectEnd,
    criticalTaskIds,
    nodes,
    dependencies,
  };
}

export async function listProjectBaselines(
  projectId: string,
): Promise<ProjectBaseline[]> {
  const db = await readDatabase();
  return db.projectBaselines
    .filter((baseline) => baseline.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export async function getProjectBaselineById(
  id: string,
): Promise<ProjectBaseline | undefined> {
  const db = await readDatabase();
  return db.projectBaselines.find((baseline) => baseline.id === id);
}

export async function createProjectBaseline(
  projectId: string,
  input: CreateProjectBaselineInput,
  createdBy: string,
): Promise<ProjectBaseline> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Le nom de la baseline est requis.");
  }

  const tasks = db.tasks.filter((task) => task.projectId === projectId);
  const snapshots: BaselineTaskSnapshot[] = tasks.map((task) => ({
    taskId: task.id,
    startDate: task.startDate,
    dueDate: task.dueDate,
    durationDays: task.durationDays,
    progress: task.progress ?? 0,
  }));

  const baseline: ProjectBaseline = {
    id: crypto.randomUUID(),
    projectId,
    name,
    description: input.description?.trim() || undefined,
    createdAt: new Date().toISOString(),
    createdBy,
    snapshots,
  };

  db.projectBaselines.push(baseline);
  await writeDatabase(db);
  return baseline;
}

export async function deleteProjectBaseline(id: string): Promise<boolean> {
  const db = await readDatabase();
  const index = db.projectBaselines.findIndex((baseline) => baseline.id === id);

  if (index === -1) {
    return false;
  }

  db.projectBaselines.splice(index, 1);
  await writeDatabase(db);
  return true;
}

function getActivePhaseValidation(
  db: Database,
  projectId: string,
): PhaseValidation | undefined {
  return db.phaseValidations.find(
    (item) => item.projectId === projectId && item.status === "submitted",
  );
}

function appendAudit(
  db: Database,
  entry: Omit<AuditLogEntry, "id" | "createdAt">,
): void {
  db.auditLog.push(createAuditEntry(entry));
}

/** Ajoute des entrées au journal d'audit (ex. envoi de rapports) sous verrou d'écriture. */
export async function appendAuditEntries(
  entries: Omit<AuditLogEntry, "id" | "createdAt">[],
): Promise<void> {
  if (entries.length === 0) return;
  await mutateDatabase((db) => {
    for (const entry of entries) appendAudit(db, entry);
  });
}

export async function listAuditLogByProject(
  projectId: string,
): Promise<AuditLogEntry[]> {
  const db = await readDatabase();
  return db.auditLog
    .filter((item) => item.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export async function listBudgetRevisionsByProject(
  projectId: string,
): Promise<BudgetRevision[]> {
  const db = await readDatabase();
  return db.budgetRevisions
    .filter((item) => item.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
}

export async function getBudgetRevisionById(
  id: string,
): Promise<BudgetRevision | undefined> {
  const db = await readDatabase();
  return db.budgetRevisions.find((item) => item.id === id);
}

export async function listPhaseValidationsByProject(
  projectId: string,
): Promise<PhaseValidation[]> {
  const db = await readDatabase();
  return db.phaseValidations
    .filter((item) => item.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
}

export async function getQualityGateContextForProject(
  projectId: string,
): Promise<QualityGateContext | null> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return null;

  const tasks = db.tasks.filter((task) => task.projectId === projectId);
  const budgetRevisions = db.budgetRevisions.filter(
    (item) => item.projectId === projectId,
  );
  const activeValidation = getActivePhaseValidation(db, projectId);
  const pendingPvDocuments = db.projectDocuments.filter(
    (doc) =>
      doc.projectId === projectId &&
      doc.status === "pending_signature",
  ).length;
  const projectGeneratedDocs = db.generatedDocuments
    .filter((doc) => doc.projectId === projectId)
    .map((doc) => ({ phase: doc.phase, outcomeKey: doc.outcomeKey }));

  return buildQualityGateContext(
    project,
    tasks,
    budgetRevisions,
    activeValidation,
    pendingPvDocuments,
    projectGeneratedDocs,
  );
}

export async function approveProjectBudget(
  projectId: string,
  actorId: string,
  actorName: string,
  input: ApproveBudgetInput,
): Promise<Project> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  const signature = input.signatureText.trim();
  if (!signature) {
    throw new Error("La signature est requise.");
  }

  if (project.budgetStatus === "approved") {
    throw new Error("Le budget est déjà validé.");
  }

  const now = new Date().toISOString();
  project.budgetStatus = "approved";
  project.budgetApprovedAt = now;
  project.budgetApprovedBy = actorId;
  project.budgetSignature = signature;

  if (project.status === "planifie") {
    project.status = "en_cours";
    appendAudit(db, {
      projectId,
      action: "project.initialized",
      actorId,
      actorName,
      details: { signature, budget: project.budget, budgetHours: project.budgetHours },
    });
  }

  appendAudit(db, {
    projectId,
    action: "budget.approved",
    actorId,
    actorName,
    details: {
      signature,
      amountCHF: project.budget,
      hoursForfait: project.budgetHours,
    },
  });

  await writeDatabase(db);
  return project;
}

export async function confirmProjectBudgetByChef(
  projectId: string,
  actorId: string,
  actorName: string,
  input: ConfirmBudgetInput,
): Promise<{ project: Project; document: ProjectDocument }> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (project.currentPhase !== "initialisation") {
    throw new Error(
      "La validation explicite du budget par le chef de projet n'est disponible qu'en phase d'initialisation.",
    );
  }

  if (project.budgetStatus === "approved") {
    throw new Error("Le budget est déjà validé.");
  }

  if (!project.mandantUserId) {
    throw new Error(
      "Liez d'abord un utilisateur mandant au projet (Administration → Mandants de projet).",
    );
  }

  const pendingRevision = db.budgetRevisions.find(
    (item) =>
      item.projectId === projectId && item.status === "pending_mandant",
  );
  if (pendingRevision) {
    throw new Error("Une révision budgétaire est en attente de validation.");
  }

  const mandantSignature = input.mandantSignatureText.trim();
  if (!mandantSignature) {
    throw new Error("La signature du mandant sur l'accord budget est requise.");
  }

  const validationDate = input.validationDate.trim();
  if (!validationDate) {
    throw new Error("La date de validation est requise.");
  }

  const now = new Date().toISOString();
  project.budgetStatus = "approved";
  project.budgetApprovedAt = now;
  project.budgetApprovedBy = project.mandantUserId;
  project.budgetSignature = mandantSignature;

  if (project.status === "planifie") {
    project.status = "en_cours";
    appendAudit(db, {
      projectId,
      action: "project.initialized",
      actorId,
      actorName,
      details: {
        signature: mandantSignature,
        budget: project.budget,
        budgetHours: project.budgetHours,
        mode: "chef_budget_confirm",
        validationDate,
      },
    });
  }

  appendAudit(db, {
    projectId,
    action: "budget.approved",
    actorId,
    actorName,
    details: {
      signature: mandantSignature,
      amountCHF: project.budget,
      hoursForfait: project.budgetHours,
      mode: "chef_budget_confirm",
      validationDate,
      recordedByChef: true,
    },
  });

  const document: ProjectDocument = {
    id: crypto.randomUUID(),
    projectId,
    type: "accord_budget_mandant",
    title: "Accord budget mandant signé",
    phase: "initialisation",
    status: "pending_signature",
    sessionDate: validationDate,
    sessionMandantSignature: mandantSignature,
    sessionNotes: input.comment?.trim() || undefined,
    assignedToUserId: project.chefDeProjetId ?? actorId,
    createdBy: actorId,
    createdAt: now,
  };

  db.projectDocuments.push(document);

  appendAudit(db, {
    projectId,
    action: "document.budget_accord_reminder_created",
    actorId,
    actorName,
    details: {
      documentId: document.id,
      assignedToUserId: document.assignedToUserId,
      title: document.title,
      validationDate,
    },
  });

  await writeDatabase(db);
  return { project, document };
}

export async function requestBudgetRevision(
  projectId: string,
  actorId: string,
  actorName: string,
  input: RequestBudgetRevisionInput,
): Promise<BudgetRevision> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (input.amountCHF <= 0) {
    throw new Error("Le montant doit être positif.");
  }

  const pending = db.budgetRevisions.find(
    (item) =>
      item.projectId === projectId && item.status === "pending_mandant",
  );
  if (pending) {
    throw new Error("Une révision budgétaire est déjà en attente.");
  }

  const revision: BudgetRevision = {
    id: crypto.randomUUID(),
    projectId,
    amountCHF: input.amountCHF,
    hoursForfait: input.hoursForfait,
    reason: input.reason?.trim() || undefined,
    status: "pending_mandant",
    requestedBy: actorId,
    requestedAt: new Date().toISOString(),
  };

  db.budgetRevisions.push(revision);

  appendAudit(db, {
    projectId,
    action: "budget.revision_requested",
    actorId,
    actorName,
    details: {
      revisionId: revision.id,
      amountCHF: revision.amountCHF,
      hoursForfait: revision.hoursForfait,
      reason: revision.reason,
    },
  });

  notifyBudgetRevisionRequested(
    db.notifications,
    db.users,
    project,
    actorName,
    revision.amountCHF,
  );

  await writeDatabase(db);
  return revision;
}

function applyBudgetRevisionApproval(
  db: Database,
  revision: BudgetRevision,
  project: Project,
  signature: string,
  approvedByUserId: string,
  actorId: string,
  actorName: string,
  mode: string,
): void {
  const now = new Date().toISOString();
  revision.status = "approved";
  revision.approvedAt = now;
  revision.approvedBy = approvedByUserId;
  revision.signatureText = signature;

  for (const item of db.budgetRevisions) {
    if (
      item.projectId === revision.projectId &&
      item.id !== revision.id &&
      item.status === "approved"
    ) {
      item.status = "superseded";
    }
  }

  project.budget = revision.amountCHF;
  if (revision.hoursForfait !== undefined) {
    project.budgetHours = revision.hoursForfait;
  }

  appendAudit(db, {
    projectId: project.id,
    action: "budget.revision_approved",
    actorId,
    actorName,
    details: {
      revisionId: revision.id,
      signature,
      amountCHF: revision.amountCHF,
      hoursForfait: revision.hoursForfait,
      mode,
    },
  });
}

export async function approveBudgetRevision(
  revisionId: string,
  actorId: string,
  actorName: string,
  input: ApproveBudgetInput,
): Promise<{ project: Project; revision: BudgetRevision }> {
  const db = await readDatabase();
  const revision = db.budgetRevisions.find((item) => item.id === revisionId);

  if (!revision) {
    throw new Error("Révision introuvable.");
  }

  if (revision.status !== "pending_mandant") {
    throw new Error("Cette révision n'est pas en attente.");
  }

  const signature = input.signatureText.trim();
  if (!signature) {
    throw new Error("La signature est requise.");
  }

  const project = db.projects.find((item) => item.id === revision.projectId);
  if (!project) {
    throw new Error("Projet introuvable.");
  }

  applyBudgetRevisionApproval(
    db,
    revision,
    project,
    signature,
    actorId,
    actorId,
    actorName,
    "mandant_online",
  );

  notifyBudgetRevisionApproved(
    db.notifications,
    project,
    revision.requestedBy,
    actorName,
    revision.amountCHF,
  );

  await writeDatabase(db);
  return { project, revision };
}

export async function confirmBudgetRevisionByChef(
  revisionId: string,
  actorId: string,
  actorName: string,
  input: ConfirmBudgetInput,
): Promise<{ project: Project; revision: BudgetRevision }> {
  const db = await readDatabase();
  const revision = db.budgetRevisions.find((item) => item.id === revisionId);

  if (!revision) {
    throw new Error("Révision introuvable.");
  }

  if (revision.status !== "pending_mandant") {
    throw new Error("Cette révision n'est pas en attente.");
  }

  const signature = input.mandantSignatureText.trim();
  if (!signature) {
    throw new Error("La signature du mandant est requise.");
  }

  const project = db.projects.find((item) => item.id === revision.projectId);
  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (!project.mandantUserId) {
    throw new Error(
      "Liez un utilisateur mandant au projet avant de confirmer la révision.",
    );
  }

  applyBudgetRevisionApproval(
    db,
    revision,
    project,
    signature,
    project.mandantUserId,
    actorId,
    actorName,
    "chef_session",
  );

  notifyBudgetRevisionApproved(
    db.notifications,
    project,
    revision.requestedBy,
    actorName,
    revision.amountCHF,
  );

  await writeDatabase(db);
  return { project, revision };
}

export async function updatePendingBudgetRevision(
  revisionId: string,
  input: RequestBudgetRevisionInput,
): Promise<BudgetRevision> {
  const db = await readDatabase();
  const revision = db.budgetRevisions.find((item) => item.id === revisionId);

  if (!revision) {
    throw new Error("Révision introuvable.");
  }

  if (revision.status !== "pending_mandant") {
    throw new Error("Seule une révision en attente peut être modifiée.");
  }

  if (input.amountCHF <= 0) {
    throw new Error("Le montant doit être positif.");
  }

  revision.amountCHF = input.amountCHF;
  revision.hoursForfait = input.hoursForfait;
  revision.reason = input.reason?.trim() || undefined;

  await writeDatabase(db);
  return revision;
}

export async function cancelBudgetRevision(
  revisionId: string,
  actorId: string,
  actorName: string,
): Promise<BudgetRevision> {
  const db = await readDatabase();
  const revision = db.budgetRevisions.find((item) => item.id === revisionId);

  if (!revision) {
    throw new Error("Révision introuvable.");
  }

  if (revision.status !== "pending_mandant") {
    throw new Error("Seule une révision en attente peut être annulée.");
  }

  revision.status = "rejected";
  revision.rejectionComment = "Annulée par le chef de projet.";

  appendAudit(db, {
    projectId: revision.projectId,
    action: "budget.revision_cancelled",
    actorId,
    actorName,
    details: { revisionId: revision.id },
  });

  await writeDatabase(db);
  return revision;
}

export async function submitPhaseValidation(
  projectId: string,
  actorId: string,
  actorName: string,
  input: SubmitPhaseGateInput,
): Promise<PhaseValidation> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (project.status === "termine") {
    throw new Error("Le projet est terminé.");
  }

  const active = getActivePhaseValidation(db, projectId);
  if (active) {
    throw new Error("Une demande de validation est déjà en cours.");
  }

  const nextPhase = getNextPhase(project.currentPhase, project.approach);
  const terminal = isTerminalPhase(project.currentPhase, project.approach);

  if (!nextPhase && !terminal) {
    throw new Error("Aucune phase suivante.");
  }

  const tasks = db.tasks.filter((task) => task.projectId === projectId);
  const budgetRevisions = db.budgetRevisions.filter(
    (item) => item.projectId === projectId,
  );
  const checklist = buildQualityGateChecklist(project, tasks, budgetRevisions);

  if (!isChecklistReady(checklist)) {
    throw new Error(
      "La liste de contrôle du quality gate n'est pas satisfaite.",
    );
  }

  const validation: PhaseValidation = {
    id: crypto.randomUUID(),
    projectId,
    fromPhase: project.currentPhase,
    toPhase: nextPhase ?? project.currentPhase,
    status: "submitted",
    mode: "online",
    checklistSnapshot: checklist,
    submitComment: input.comment?.trim() || undefined,
    submittedBy: actorId,
    submittedAt: new Date().toISOString(),
  };

  db.phaseValidations.push(validation);

  appendAudit(db, {
    projectId,
    action: "phase.submitted",
    actorId,
    actorName,
    details: {
      validationId: validation.id,
      fromPhase: validation.fromPhase,
      toPhase: validation.toPhase,
      comment: validation.submitComment,
    },
  });

  notifyPhaseSubmitted(db.notifications, db.users, project, validation, actorName);

  await writeDatabase(db);
  return validation;
}

async function appendPhaseGeneratedDocuments(
  db: Database,
  project: Project,
  validation: PhaseValidation,
  actorId: string,
  actorName: string,
): Promise<GeneratedDocument[]> {
  const tasks = db.tasks.filter((task) => task.projectId === project.id);
  const generated = generateDocumentsForValidation(
    project,
    validation,
    tasks,
    db.generatedDocuments,
    actorId,
    actorName,
  );

  const portfolio = project.portfolioId
    ? db.portfolios.find((item) => item.id === project.portfolioId)
    : undefined;
  const projectWithMeta = {
    ...project,
    portfolioName: portfolio?.name,
  };

  for (const document of generated) {
    if (document.wordTemplateFile) {
      try {
        const payload = buildDocxPayload(
          document.wordTemplateFile,
          projectWithMeta,
          validation.fromPhase,
          validation,
          tasks,
          document.locale,
          document.version,
          actorName,
          document.milestone,
          document.contentMarkdown,
        );
        const buffer = await generateHermesDocxBuffer(payload);
        await writeGeneratedDocx(project.id, document.id, buffer);
        document.hasDocx = true;
        document.docxSource = "generated";
      } catch {
        document.hasDocx = false;
      }
    }

    db.generatedDocuments.push(document);
    appendAudit(db, {
      projectId: project.id,
      action: "document.generated",
      actorId,
      actorName,
      details: {
        documentId: document.id,
        templateId: document.templateId,
        title: document.title,
        version: document.version,
        locale: document.locale,
        validationId: validation.id,
        phase: document.phase,
      },
    });
  }

  return generated;
}

function advanceProjectPhase(
  project: Project,
  toPhase: HermesPhaseId,
): void {
  project.currentPhase = toPhase;

  if (project.status === "planifie") {
    project.status = "en_cours";
  }

  if (isTerminalPhase(project.currentPhase, project.approach)) {
    project.status = "termine";
    project.progress = 100;
  }
}

export async function listProjectDocumentsByProject(
  projectId: string,
): Promise<ProjectDocument[]> {
  const db = await readDatabase();
  return db.projectDocuments
    .filter((doc) => doc.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export async function getProjectDocumentById(
  id: string,
): Promise<ProjectDocument | undefined> {
  const db = await readDatabase();
  return db.projectDocuments.find((doc) => doc.id === id);
}

export async function listGeneratedDocumentsByProject(
  projectId: string,
): Promise<GeneratedDocument[]> {
  const db = await readDatabase();
  return db.generatedDocuments
    .filter((doc) => doc.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
}

export async function listProjectGeneratedDocumentSummaries(): Promise<
  {
    projectId: string;
    projectName: string;
    documentCount: number;
    lastGeneratedAt?: string;
    currentPhase: Project["currentPhase"];
    approach: Project["approach"];
    annexCount: number;
  }[]
> {
  const db = await readDatabase();
  const stats = new Map<string, { count: number; last?: string }>();
  const annexCounts = new Map<string, number>();
  for (const doc of db.annexDocuments) {
    if (!doc.deletedAt) annexCounts.set(doc.projectId, (annexCounts.get(doc.projectId) ?? 0) + 1);
  }

  for (const doc of db.generatedDocuments) {
    const entry = stats.get(doc.projectId) ?? { count: 0 };
    entry.count += 1;
    if (!entry.last || doc.generatedAt > entry.last) {
      entry.last = doc.generatedAt;
    }
    stats.set(doc.projectId, entry);
  }

  return db.projects
    .map((project) => {
      const { count, last } = stats.get(project.id) ?? { count: 0 };
      return {
        projectId: project.id,
        projectName: project.name,
        documentCount: count,
        lastGeneratedAt: last,
        currentPhase: project.currentPhase,
        approach: project.approach,
        annexCount: annexCounts.get(project.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastGeneratedAt ?? 0).getTime() -
        new Date(a.lastGeneratedAt ?? 0).getTime(),
    );
}

export async function listAllGeneratedDocuments(): Promise<
  (GeneratedDocument & { projectName: string })[]
> {
  const db = await readDatabase();
  const projectById = new Map(db.projects.map((p) => [p.id, p.name]));

  return db.generatedDocuments
    .map((doc) => ({
      ...doc,
      projectName: projectById.get(doc.projectId) ?? "Projet",
    }))
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
}

export async function getGeneratedDocumentById(
  id: string,
): Promise<GeneratedDocument | undefined> {
  const db = await readDatabase();
  return db.generatedDocuments.find((doc) => doc.id === id);
}

export async function getPhaseValidationById(
  id: string,
): Promise<PhaseValidation | undefined> {
  const db = await readDatabase();
  return db.phaseValidations.find((item) => item.id === id);
}

export async function updateGeneratedDocument(
  documentId: string,
  actorId: string,
  actorName: string,
  input: UpdateGeneratedDocumentInput,
): Promise<GeneratedDocument> {
  const db = await readDatabase();
  const document = db.generatedDocuments.find((item) => item.id === documentId);

  if (!document) {
    throw new Error("Document introuvable.");
  }

  const title = input.title?.trim();
  const contentMarkdown = input.contentMarkdown?.trim();

  if (title === undefined && contentMarkdown === undefined) {
    throw new Error("Aucune modification à enregistrer.");
  }

  if (title !== undefined && !title) {
    throw new Error("Le titre ne peut pas être vide.");
  }

  if (contentMarkdown !== undefined && !contentMarkdown) {
    throw new Error("Le contenu ne peut pas être vide.");
  }

  if (title !== undefined) {
    document.title = title;
  }

  if (contentMarkdown !== undefined) {
    document.contentMarkdown = contentMarkdown;
  }

  const now = new Date().toISOString();
  document.updatedAt = now;
  document.updatedBy = actorId;
  document.updatedByName = actorName;

  appendAudit(db, {
    projectId: document.projectId,
    action: "document.updated",
    actorId,
    actorName,
    details: {
      documentId: document.id,
      title: document.title,
    },
  });

  const project = db.projects.find((item) => item.id === document.projectId);
  const validation = db.phaseValidations.find(
    (item) => item.id === document.validationId,
  );
  if (
    project &&
    validation &&
    resolveWordTemplateFile(document) &&
    shouldAutoRegenerateDocx(document)
  ) {
    const portfolio = project.portfolioId
      ? db.portfolios.find((item) => item.id === project.portfolioId)
      : undefined;
    const tasks = db.tasks.filter((task) => task.projectId === project.id);
    try {
      document.hasDocx = await regenerateGeneratedDocumentDocx(
        document,
        { ...project, portfolioName: portfolio?.name },
        validation,
        tasks,
        actorName,
      );
      if (document.hasDocx) {
        document.docxSource = "generated";
        delete document.uploadedFileName;
      }
    } catch {
      document.hasDocx = false;
    }
  }

  await writeDatabase(db);
  return document;
}

export async function replaceGeneratedDocumentDocx(
  documentId: string,
  actorId: string,
  actorName: string,
  buffer: Buffer,
  originalFileName: string,
): Promise<GeneratedDocument> {
  const db = await readDatabase();
  const document = db.generatedDocuments.find((item) => item.id === documentId);

  if (!document) {
    throw new Error("Document introuvable.");
  }

  if (!isValidDocxBuffer(buffer)) {
    throw new Error(
      "Fichier invalide. Seuls les documents Word (.docx, max. 25 Mo) sont acceptés.",
    );
  }

  await writeGeneratedDocx(document.projectId, document.id, buffer);

  const now = new Date().toISOString();
  document.hasDocx = true;
  document.docxSource = "uploaded";
  document.uploadedFileName = originalFileName;
  document.updatedAt = now;
  document.updatedBy = actorId;
  document.updatedByName = actorName;

  appendAudit(db, {
    projectId: document.projectId,
    action: "document.docx_replaced",
    actorId,
    actorName,
    details: {
      documentId: document.id,
      title: document.title,
      uploadedFileName: originalFileName,
    },
  });

  await writeDatabase(db);
  return document;
}

export async function getPendingPvDocumentsForUser(
  userId: string,
): Promise<PendingPvDocumentItem[]> {
  const db = await readDatabase();
  const projectById = new Map(db.projects.map((p) => [p.id, p]));

  return db.projectDocuments
    .filter(
      (doc) =>
        doc.status === "pending_signature" &&
        doc.assignedToUserId === userId,
    )
    .map((doc) => ({
      id: doc.id,
      projectId: doc.projectId,
      projectName: projectById.get(doc.projectId)?.name ?? "Projet",
      title: doc.title,
      phase: doc.phase,
      sessionDate: doc.sessionDate,
      createdAt: doc.createdAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export async function confirmSessionPhaseValidation(
  projectId: string,
  actorId: string,
  actorName: string,
  input: SessionPhaseValidationInput,
): Promise<{
  project: Project;
  validation: PhaseValidation;
  document: ProjectDocument;
}> {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Projet introuvable.");
  }

  if (project.status === "termine") {
    throw new Error("Le projet est terminé.");
  }

  const active = getActivePhaseValidation(db, projectId);
  if (active) {
    throw new Error("Une demande de validation est déjà en cours.");
  }

  const mandantSignature = input.mandantSignatureText.trim();
  if (!mandantSignature) {
    throw new Error("La signature du mandant en séance est requise.");
  }

  const sessionDate = input.sessionDate.trim();
  if (!sessionDate) {
    throw new Error("La date de séance est requise.");
  }

  const nextPhase = getNextPhase(project.currentPhase, project.approach);
  const terminal = isTerminalPhase(project.currentPhase, project.approach);

  if (!nextPhase && !terminal) {
    throw new Error("Aucune phase suivante.");
  }

  if (project.budgetStatus !== "approved") {
    const now = new Date().toISOString();
    project.budgetStatus = "approved";
    project.budgetApprovedAt = now;
    project.budgetApprovedBy = project.mandantUserId ?? actorId;
    project.budgetSignature = mandantSignature;

    if (project.status === "planifie") {
      project.status = "en_cours";
      appendAudit(db, {
        projectId,
        action: "project.initialized",
        actorId,
        actorName,
        details: {
          signature: mandantSignature,
          budget: project.budget,
          budgetHours: project.budgetHours,
          mode: "session",
        },
      });
    }

    appendAudit(db, {
      projectId,
      action: "budget.approved",
      actorId,
      actorName,
      details: {
        signature: mandantSignature,
        amountCHF: project.budget,
        hoursForfait: project.budgetHours,
        mode: "session",
      },
    });
  }

  const pendingRevision = db.budgetRevisions.find(
    (item) =>
      item.projectId === projectId && item.status === "pending_mandant",
  );
  if (pendingRevision) {
    applyBudgetRevisionApproval(
      db,
      pendingRevision,
      project,
      mandantSignature,
      project.mandantUserId ?? actorId,
      actorId,
      actorName,
      "session_phase",
    );
  }

  const tasks = db.tasks.filter((task) => task.projectId === projectId);
  const budgetRevisions = db.budgetRevisions.filter(
    (item) => item.projectId === projectId,
  );
  const checklist = buildQualityGateChecklist(project, tasks, budgetRevisions);

  if (!isChecklistReadyForSession(checklist)) {
    throw new Error(
      "La liste de contrôle du quality gate n'est pas satisfaite.",
    );
  }

  const now = new Date().toISOString();
  const toPhase = nextPhase ?? project.currentPhase;
  const phaseLabel = getPhaseLabel(project.currentPhase, project.approach);

  const validation: PhaseValidation = {
    id: crypto.randomUUID(),
    projectId,
    fromPhase: project.currentPhase,
    toPhase,
    status: "approved",
    mode: "session",
    checklistSnapshot: checklist,
    submitComment: input.comment?.trim() || undefined,
    submittedBy: actorId,
    submittedAt: now,
    sessionDate,
    recordedBy: actorId,
    signatureText: mandantSignature,
    approvedBy: project.mandantUserId ?? actorId,
    approvedAt: now,
  };

  const document: ProjectDocument = {
    id: crypto.randomUUID(),
    projectId,
    validationId: validation.id,
    type: "pv_validation_phase",
    title: `PV de séance — validation phase ${phaseLabel}`,
    phase: project.currentPhase,
    status: "pending_signature",
    sessionDate,
    sessionMandantSignature: mandantSignature,
    sessionNotes: input.comment?.trim() || undefined,
    assignedToUserId: project.chefDeProjetId ?? actorId,
    createdBy: actorId,
    createdAt: now,
  };

  validation.pvDocumentId = document.id;
  db.phaseValidations.push(validation);
  db.projectDocuments.push(document);
  await appendPhaseGeneratedDocuments(db, project, validation, actorId, actorName);
  advanceProjectPhase(project, toPhase);

  appendAudit(db, {
    projectId,
    action: "phase.session_validated",
    actorId,
    actorName,
    details: {
      validationId: validation.id,
      documentId: document.id,
      fromPhase: validation.fromPhase,
      toPhase: validation.toPhase,
      sessionDate,
      mandantSignature,
    },
  });

  appendAudit(db, {
    projectId,
    action: "document.pv_reminder_created",
    actorId,
    actorName,
    details: {
      documentId: document.id,
      assignedToUserId: document.assignedToUserId,
      title: document.title,
    },
  });

  notifyDocumentPvPending(db.notifications, project, document);

  await writeDatabase(db);
  return { project, validation, document };
}

export async function signProjectDocument(
  documentId: string,
  actorId: string,
  actorName: string,
  input: SignProjectDocumentInput,
): Promise<ProjectDocument> {
  const db = await readDatabase();
  const document = db.projectDocuments.find((doc) => doc.id === documentId);

  if (!document) {
    throw new Error("Document introuvable.");
  }

  if (document.status !== "pending_signature") {
    throw new Error("Ce document est déjà signé.");
  }

  const signature = input.pvSignatureText.trim();
  if (!signature) {
    throw new Error("La signature sur le PV est requise.");
  }

  const now = new Date().toISOString();
  document.status = "signed";
  document.pvSignatureText = signature;
  document.sessionNotes = input.notes?.trim() || document.sessionNotes;
  document.signedAt = now;
  document.signedBy = actorId;

  appendAudit(db, {
    projectId: document.projectId,
    action: "document.pv_signed",
    actorId,
    actorName,
    details: {
      documentId: document.id,
      validationId: document.validationId,
      pvSignature: signature,
    },
  });

  await writeDatabase(db);
  return document;
}

export async function approvePhaseValidation(
  validationId: string,
  actorId: string,
  actorName: string,
  input: ApprovePhaseGateInput,
): Promise<{ project: Project; validation: PhaseValidation }> {
  const db = await readDatabase();
  const validation = db.phaseValidations.find((item) => item.id === validationId);

  if (!validation) {
    throw new Error("Demande de validation introuvable.");
  }

  if (validation.status !== "submitted") {
    throw new Error("Cette demande n'est pas en attente.");
  }

  const signature = input.signatureText.trim();
  if (!signature) {
    throw new Error("La signature est requise.");
  }

  const project = db.projects.find((item) => item.id === validation.projectId);
  if (!project) {
    throw new Error("Projet introuvable.");
  }

  const now = new Date().toISOString();
  validation.status = "approved";
  validation.mode = validation.mode ?? "online";
  validation.signatureText = signature;
  validation.approvedBy = actorId;
  validation.approvedAt = now;

  advanceProjectPhase(project, validation.toPhase);
  await appendPhaseGeneratedDocuments(db, project, validation, actorId, actorName);

  appendAudit(db, {
    projectId: project.id,
    action: "phase.approved",
    actorId,
    actorName,
    details: {
      validationId: validation.id,
      signature,
      fromPhase: validation.fromPhase,
      toPhase: validation.toPhase,
    },
  });

  notifyPhaseApproved(db.notifications, project, validation, actorName);

  await writeDatabase(db);
  return { project, validation };
}

export async function rejectPhaseValidation(
  validationId: string,
  actorId: string,
  actorName: string,
  input: RejectPhaseGateInput,
): Promise<PhaseValidation> {
  const db = await readDatabase();
  const validation = db.phaseValidations.find((item) => item.id === validationId);

  if (!validation) {
    throw new Error("Demande de validation introuvable.");
  }

  if (validation.status !== "submitted") {
    throw new Error("Cette demande n'est pas en attente.");
  }

  const comment = input.comment.trim();
  if (!comment) {
    throw new Error("Un commentaire de refus est requis.");
  }

  validation.status = "rejected";
  validation.rejectionComment = comment;
  validation.rejectedBy = actorId;
  validation.rejectedAt = new Date().toISOString();

  appendAudit(db, {
    projectId: validation.projectId,
    action: "phase.rejected",
    actorId,
    actorName,
    details: {
      validationId: validation.id,
      comment,
      fromPhase: validation.fromPhase,
      toPhase: validation.toPhase,
    },
  });

  const project = db.projects.find((item) => item.id === validation.projectId);
  if (project) {
    notifyPhaseRejected(db.notifications, project, validation, actorName);
  }

  await writeDatabase(db);
  return validation;
}

const NOTIFICATION_LIST_LIMIT = 50;

export async function listNotificationsForUser(
  userId: string,
  limit = NOTIFICATION_LIST_LIMIT,
): Promise<Notification[]> {
  const db = await readDatabase();
  return db.notifications
    .filter((item) => item.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const db = await readDatabase();
  return db.notifications.filter(
    (item) => item.userId === userId && !item.readAt,
  ).length;
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<Notification | null> {
  const db = await readDatabase();
  const notification = db.notifications.find(
    (item) => item.id === notificationId && item.userId === userId,
  );

  if (!notification) return null;

  if (!notification.readAt) {
    notification.readAt = new Date().toISOString();
    await writeDatabase(db);
  }

  return notification;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const db = await readDatabase();
  const now = new Date().toISOString();
  let updated = 0;

  for (const notification of db.notifications) {
    if (notification.userId === userId && !notification.readAt) {
      notification.readAt = now;
      updated += 1;
    }
  }

  if (updated > 0) {
    await writeDatabase(db);
  }

  return updated;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  permissions: Permission[];
  locale?: Locale;
}): Promise<User> {
  return mutateDatabase((db) => {
    if (
      db.users.some(
        (u) => u.email.toLowerCase() === input.email.toLowerCase(),
      )
    ) {
      throw new Error("Un utilisateur avec cet e-mail existe déjà.");
    }

    const user = buildDbUser(input);
    db.users.push(user);
    return stripPassword(user);
  });
}

function buildDbUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  permissions: Permission[];
  locale?: Locale;
  invitedBy?: string;
}): DbUser {
  return {
    id: crypto.randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    passwordHash: hashPassword(input.password),
    permissions: input.role === "admin" ? [...ALL_PERMISSIONS] : input.permissions,
    createdAt: new Date().toISOString(),
    status: "active",
    avatarDisplay: "initials",
    locale: input.locale,
    emailNotifications: true,
    invitedBy: input.invitedBy,
  };
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
  permissions?: Permission[];
  roleOverride?: boolean;
}

export interface AuditActor {
  id: string;
  name: string;
}

function countActiveAdmins(db: Database, excludeUserId?: string): number {
  return db.users.filter(
    (user) =>
      user.role === "admin" &&
      isUserActive(user) &&
      user.id !== excludeUserId,
  ).length;
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actor?: AuditActor,
): Promise<User | null> {
  const db = await readDatabase();
  const index = db.users.findIndex((user) => user.id === userId);

  if (index === -1) return null;

  const user = db.users[index];
  const previousRole = user.role;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Le nom est requis.");
    user.name = name;
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error("L'e-mail est requis.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("L'e-mail n'est pas valide.");
    }
    if (
      db.users.some(
        (item) => item.id !== userId && item.email.toLowerCase() === email,
      )
    ) {
      throw new Error("Un utilisateur avec cet e-mail existe déjà.");
    }
    user.email = email;
  }

  if (input.password !== undefined && input.password.length > 0) {
    if (input.password.length < 8) {
      throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
    }
    user.passwordHash = hashPassword(input.password);
  }

  if (input.role !== undefined) {
    user.role = input.role;
  }

  if (input.roleOverride !== undefined) {
    user.roleOverride = input.roleOverride;
  }

  if (input.status === "active") {
    user.pendingApproval = false;
  }

  if (input.status !== undefined) {
    if (input.status === "suspended" && user.role === "admin") {
      if (countActiveAdmins(db, userId) === 0) {
        throw new Error("Impossible de suspendre le dernier administrateur actif.");
      }
    }
    user.status = input.status;
  }

  const nextRole = user.role;
  if (nextRole === "admin") {
    user.permissions = [...ALL_PERMISSIONS];
  } else if (input.permissions !== undefined) {
    user.permissions = input.permissions;
  } else if (previousRole !== nextRole) {
    user.permissions = defaultPermissionsForRole(nextRole);
  }

  if (previousRole !== nextRole || input.roleOverride !== undefined) {
    appendAudit(db, {
      action: "user.role_changed",
      actorId: actor?.id ?? "system",
      actorName: actor?.name ?? "system",
      details: {
        userId: user.id,
        email: user.email,
        from: previousRole,
        to: nextRole,
        roleOverride: Boolean(user.roleOverride),
        source: "admin",
      },
    });
  }

  await writeDatabase(db);
  return stripPassword(user);
}

export interface UpdateUserProfileInput {
  name?: string;
  email?: string;
  avatarDisplay?: AvatarDisplay;
  currentPassword?: string;
  newPassword?: string;
  locale?: Locale;
  emailNotifications?: boolean;
}

export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput,
): Promise<User | null> {
  const db = await readDatabase();
  const index = db.users.findIndex((user) => user.id === userId);

  if (index === -1) return null;

  const user = db.users[index];

  if (!isUserActive(user)) {
    throw new Error("Ce compte est suspendu.");
  }

  const wantsPasswordChange =
    input.newPassword !== undefined && input.newPassword.length > 0;

  if (wantsPasswordChange) {
    if (!input.currentPassword) {
      throw new Error("Le mot de passe actuel est requis.");
    }
    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new Error("Mot de passe actuel incorrect.");
    }
    if (input.newPassword!.length < 8) {
      throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
    }
    user.passwordHash = hashPassword(input.newPassword!);
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Le nom est requis.");
    user.name = name;
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error("L'e-mail est requis.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("L'e-mail n'est pas valide.");
    }
    if (
      db.users.some(
        (item) => item.id !== userId && item.email.toLowerCase() === email,
      )
    ) {
      throw new Error("Un utilisateur avec cet e-mail existe déjà.");
    }
    user.email = email;
  }

  if (input.avatarDisplay !== undefined) {
    if (input.avatarDisplay !== "initials" && input.avatarDisplay !== "gravatar") {
      throw new Error("Mode d'avatar invalide.");
    }
    user.avatarDisplay = input.avatarDisplay;
  }

  if (input.locale !== undefined) {
    if (!isLocale(input.locale)) throw new Error("Langue invalide.");
    user.locale = input.locale;
  }

  if (input.emailNotifications !== undefined) {
    user.emailNotifications = Boolean(input.emailNotifications);
  }

  await writeDatabase(db);
  return stripPassword(user);
}

/** Met à jour uniquement la langue préférée (sélecteur de langue de l'en-tête). */
export async function updateUserLocale(
  userId: string,
  locale: Locale,
): Promise<User | null> {
  return mutateDatabase((db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user) return null;
    user.locale = locale;
    return stripPassword(user);
  });
}

export async function deleteUser(userId: string): Promise<boolean> {
  return mutateDatabase((db) => {
    const index = db.users.findIndex((user) => user.id === userId);

    if (index === -1) return false;

    const user = db.users[index];

    if (user.role === "admin") {
      const remainingActiveAdmins = db.users.filter(
        (item) =>
          item.role === "admin" &&
          isUserActive(item) &&
          item.id !== userId,
      ).length;

      if (remainingActiveAdmins === 0) {
        throw new Error(
          "Impossible de supprimer le dernier administrateur actif.",
        );
      }
    }

    const links = findUserActiveProjectLinks(
      userId,
      db.projects,
      db.tasks,
      db.activities,
    );

    if (links.length > 0) {
      const summary = links
        .map((link) => `« ${link.projectName} » (${link.role})`)
        .join(", ");
      throw new Error(
        `Suppression impossible : l'utilisateur est rattaché à des projets actifs — ${summary}.`,
      );
    }

    db.userSkills = db.userSkills.filter((skill) => skill.userId !== userId);
    db.resourceProfiles = db.resourceProfiles.filter(
      (profile) => profile.userId !== userId,
    );

    for (const portfolio of db.portfolios) {
      if (portfolio.sharedResourceIds?.includes(userId)) {
        portfolio.sharedResourceIds = portfolio.sharedResourceIds.filter(
          (id) => id !== userId,
        );
      }
    }

    db.users.splice(index, 1);
    return true;
  });
}

/** @deprecated Utiliser updateUser avec status: "suspended". */
export async function updateUserRole(
  userId: string,
  role: UserRole,
  permissions: Permission[],
): Promise<User | null> {
  return updateUser(userId, { role, permissions });
}

/** @deprecated Utiliser updateUser avec status: "suspended". */
export async function deactivateUser(userId: string): Promise<boolean> {
  const updated = await updateUser(userId, { status: "suspended" });
  return updated !== null;
}

// ─── Invitations ────────────────────────────────────────────────────────────

export type InvitationErrorCode =
  | "alreadyUser"
  | "alreadyPending"
  | "notFound"
  | "invalid"
  | "expired"
  | "revoked"
  | "accepted";

export class InvitationError extends Error {
  constructor(public readonly code: InvitationErrorCode) {
    super(code);
    this.name = "InvitationError";
  }
}

function invitationTtlMs(): number {
  const days = Number(process.env.PROJECTOR_INVITATION_TTL_DAYS ?? "7");
  return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

function getInvitationStatus(invitation: Invitation): InvitationStatus {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return "expired";
  return "pending";
}

function toInvitationSummary(invitation: Invitation): InvitationSummary {
  const { tokenHash: _tokenHash, ...rest } = invitation;
  return { ...rest, status: getInvitationStatus(invitation) };
}

export async function listInvitations(): Promise<InvitationSummary[]> {
  const db = await readDatabase();
  return [...db.invitations]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toInvitationSummary);
}

export interface CreateInvitationInput {
  email: string;
  name?: string;
  role: UserRole;
  permissions: Permission[];
  locale: Locale;
  message?: string;
  invitedBy: string;
  invitedByName: string;
}

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<{ invitation: InvitationSummary; token: string }> {
  const email = input.email.trim().toLowerCase();

  return mutateDatabase((db) => {
    if (db.users.some((user) => user.email.toLowerCase() === email)) {
      throw new InvitationError("alreadyUser");
    }

    const now = Date.now();
    for (const existing of db.invitations) {
      if (
        existing.email === email &&
        getInvitationStatus(existing) === "pending"
      ) {
        throw new InvitationError("alreadyPending");
      }
    }

    const { token, tokenHash } = newInvitationToken();
    const invitation: Invitation = {
      id: crypto.randomUUID(),
      email,
      name: input.name?.trim() || undefined,
      role: input.role,
      permissions:
        input.role === "admin" ? [...ALL_PERMISSIONS] : input.permissions,
      locale: input.locale,
      message: input.message?.trim() || undefined,
      tokenHash,
      invitedBy: input.invitedBy,
      invitedByName: input.invitedByName,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + invitationTtlMs()).toISOString(),
    };

    db.invitations.push(invitation);
    return { invitation: toInvitationSummary(invitation), token };
  });
}

/** Régénère le jeton (le jeton brut n'est jamais conservé) et prolonge la validité. */
export async function renewInvitationToken(
  invitationId: string,
): Promise<{ invitation: InvitationSummary; token: string }> {
  return mutateDatabase((db) => {
    const invitation = db.invitations.find((item) => item.id === invitationId);
    if (!invitation) throw new InvitationError("notFound");
    if (invitation.acceptedAt) throw new InvitationError("accepted");

    const { token, tokenHash } = newInvitationToken();
    invitation.tokenHash = tokenHash;
    invitation.revokedAt = undefined;
    invitation.expiresAt = new Date(Date.now() + invitationTtlMs()).toISOString();
    return { invitation: toInvitationSummary(invitation), token };
  });
}

export async function recordInvitationEmailResult(
  invitationId: string,
  status: InvitationEmailStatus,
  error?: string,
): Promise<InvitationSummary | null> {
  return mutateDatabase((db) => {
    const invitation = db.invitations.find((item) => item.id === invitationId);
    if (!invitation) return null;
    invitation.emailStatus = status;
    invitation.emailError = error?.slice(0, 500);
    if (status === "sent") invitation.lastSentAt = new Date().toISOString();
    return toInvitationSummary(invitation);
  });
}

export async function revokeInvitation(
  invitationId: string,
): Promise<InvitationSummary> {
  return mutateDatabase((db) => {
    const invitation = db.invitations.find((item) => item.id === invitationId);
    if (!invitation) throw new InvitationError("notFound");
    if (invitation.acceptedAt) throw new InvitationError("accepted");
    invitation.revokedAt = new Date().toISOString();
    return toInvitationSummary(invitation);
  });
}

export async function deleteInvitation(invitationId: string): Promise<boolean> {
  return mutateDatabase((db) => {
    const index = db.invitations.findIndex((item) => item.id === invitationId);
    if (index === -1) return false;
    db.invitations.splice(index, 1);
    return true;
  });
}

export async function getInvitationByToken(
  token: string,
): Promise<InvitationSummary | null> {
  if (!token) return null;
  const tokenHash = hashInvitationToken(token);
  const db = await readDatabase();
  const invitation = db.invitations.find((item) => item.tokenHash === tokenHash);
  return invitation ? toInvitationSummary(invitation) : null;
}

export async function acceptInvitation(
  token: string,
  input: { name: string; password: string; locale?: Locale },
): Promise<User> {
  const tokenHash = hashInvitationToken(token);

  return mutateDatabase((db) => {
    const invitation = db.invitations.find((item) => item.tokenHash === tokenHash);
    if (!invitation) throw new InvitationError("invalid");

    const status = getInvitationStatus(invitation);
    if (status !== "pending") throw new InvitationError(status);

    if (db.users.some((user) => user.email.toLowerCase() === invitation.email)) {
      throw new InvitationError("alreadyUser");
    }

    const user = buildDbUser({
      email: invitation.email,
      name: input.name.trim(),
      password: input.password,
      role: invitation.role,
      permissions: invitation.permissions,
      locale: input.locale ?? invitation.locale,
      invitedBy: invitation.invitedBy,
    });
    db.users.push(user);

    invitation.acceptedAt = new Date().toISOString();
    invitation.acceptedUserId = user.id;

    notifyInvitationAccepted(db.notifications, invitation.invitedBy, {
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return stripPassword(user);
  });
}

export async function listResourceGroups(): Promise<ResourceGroup[]> {
  const db = await readDatabase();
  return db.resourceGroups.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function createResourceGroup(
  input: CreateResourceGroupInput,
): Promise<ResourceGroup> {
  const db = await readDatabase();
  const now = new Date().toISOString();

  if (!input.name.trim()) {
    throw new Error("Le nom du groupe est requis.");
  }

  const group: ResourceGroup = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    createdAt: now,
    updatedAt: now,
  };

  db.resourceGroups.push(group);
  await writeDatabase(db);
  return group;
}

export async function updateResourceGroup(
  id: string,
  input: Partial<CreateResourceGroupInput>,
): Promise<ResourceGroup | null> {
  const db = await readDatabase();
  const group = db.resourceGroups.find((item) => item.id === id);
  if (!group) return null;

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("Le nom du groupe est requis.");
    group.name = input.name.trim();
  }
  if (input.description !== undefined) {
    group.description = input.description.trim();
  }
  group.updatedAt = new Date().toISOString();

  await writeDatabase(db);
  return group;
}

export async function deleteResourceGroup(id: string): Promise<boolean> {
  const db = await readDatabase();
  const index = db.resourceGroups.findIndex((item) => item.id === id);
  if (index === -1) return false;

  db.resourceGroups.splice(index, 1);
  db.userSkills = db.userSkills.filter((skill) => skill.groupId !== id);
  await writeDatabase(db);
  return true;
}

export async function listUserSkills(): Promise<UserSkill[]> {
  const db = await readDatabase();
  return db.userSkills;
}

export async function setUserSkill(
  userId: string,
  groupId: string,
  level: SkillLevel,
): Promise<UserSkill> {
  const db = await readDatabase();

  const user = db.users.find((item) => item.id === userId && isUserActive(item));
  if (!user) throw new Error("Utilisateur introuvable ou inactif.");

  const group = db.resourceGroups.find((item) => item.id === groupId);
  if (!group) throw new Error("Groupe de compétences introuvable.");

  const existing = db.userSkills.find(
    (skill) => skill.userId === userId && skill.groupId === groupId,
  );

  if (existing) {
    existing.level = level;
    await writeDatabase(db);
    return existing;
  }

  const skill: UserSkill = {
    id: crypto.randomUUID(),
    userId,
    groupId,
    level,
  };

  db.userSkills.push(skill);
  await writeDatabase(db);
  return skill;
}

export async function removeUserSkill(
  userId: string,
  groupId: string,
): Promise<boolean> {
  const db = await readDatabase();
  const index = db.userSkills.findIndex(
    (skill) => skill.userId === userId && skill.groupId === groupId,
  );

  if (index === -1) return false;

  db.userSkills.splice(index, 1);
  await writeDatabase(db);
  return true;
}

export async function listResourceProfiles(): Promise<ResourceProfile[]> {
  const db = await readDatabase();
  return db.resourceProfiles;
}

export async function upsertResourceProfile(
  userId: string,
  input: { weeklyCapacityPercent: number; notes?: string },
): Promise<ResourceProfile> {
  const db = await readDatabase();

  const user = db.users.find((item) => item.id === userId && isUserActive(item));
  if (!user) throw new Error("Utilisateur introuvable ou inactif.");

  const capacity = Math.max(0, Math.min(100, input.weeklyCapacityPercent));
  const existing = db.resourceProfiles.find((profile) => profile.userId === userId);
  const now = new Date().toISOString();

  if (existing) {
    existing.weeklyCapacityPercent = capacity;
    existing.notes = input.notes?.trim() || undefined;
    existing.updatedAt = now;
    await writeDatabase(db);
    return existing;
  }

  const profile: ResourceProfile = {
    userId,
    weeklyCapacityPercent: capacity,
    notes: input.notes?.trim() || undefined,
    updatedAt: now,
  };

  db.resourceProfiles.push(profile);
  await writeDatabase(db);
  return profile;
}

export async function setPortfolioSharedResources(
  portfolioId: string,
  userIds: string[],
): Promise<Portfolio> {
  const db = await readDatabase();
  const portfolio = db.portfolios.find((item) => item.id === portfolioId);

  if (!portfolio) {
    throw new Error("Portfolio introuvable.");
  }

  const uniqueIds = [...new Set(userIds)];
  for (const userId of uniqueIds) {
    const user = db.users.find((item) => item.id === userId && isUserActive(item));
    if (!user) {
      throw new Error("Utilisateur introuvable ou inactif.");
    }
  }

  portfolio.sharedResourceIds = uniqueIds;
  portfolio.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  return portfolio;
}

// ─── Microsoft Entra ID ─────────────────────────────────────────────────────

export async function getEntraSettings(): Promise<EntraSettings> {
  const db = await readDatabase();
  return db.entraSettings;
}

export async function updateEntraUnknownUserPolicy(
  policy: EntraUnknownUserPolicy,
  actor: AuditActor,
): Promise<EntraSettings> {
  return mutateDatabase((db) => {
    const previous = db.entraSettings.unknownUserPolicy;
    db.entraSettings.unknownUserPolicy = policy;
    appendAudit(db, {
      action: "entra.settings_changed",
      actorId: actor.id,
      actorName: actor.name,
      details: { unknownUserPolicy: { from: previous, to: policy } },
    });
    return db.entraSettings;
  });
}

export async function addEntraRoleMapping(
  input: Pick<EntraRoleMapping, "type" | "value" | "role" | "label">,
  actor: AuditActor,
): Promise<EntraRoleMapping> {
  return mutateDatabase((db) => {
    const value = input.value.trim();
    if (
      db.entraSettings.mappings.some(
        (mapping) =>
          mapping.type === input.type &&
          mapping.value.toLowerCase() === value.toLowerCase(),
      )
    ) {
      throw new Error("duplicate");
    }
    const mapping: EntraRoleMapping = {
      id: crypto.randomUUID(),
      type: input.type,
      value,
      role: input.role,
      label: input.label?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    db.entraSettings.mappings.push(mapping);
    appendAudit(db, {
      action: "entra.mapping_added",
      actorId: actor.id,
      actorName: actor.name,
      details: { type: mapping.type, value: mapping.value, role: mapping.role },
    });
    return mapping;
  });
}

export async function deleteEntraRoleMapping(
  mappingId: string,
  actor: AuditActor,
): Promise<boolean> {
  return mutateDatabase((db) => {
    const index = db.entraSettings.mappings.findIndex((m) => m.id === mappingId);
    if (index === -1) return false;
    const [removed] = db.entraSettings.mappings.splice(index, 1);
    appendAudit(db, {
      action: "entra.mapping_removed",
      actorId: actor.id,
      actorName: actor.name,
      details: { type: removed.type, value: removed.value, role: removed.role },
    });
    return true;
  });
}

/** Journal d'audit plateforme (hors projet) : connexions Entra, rôles, réglages. */
export async function listPlatformAuditLog(limit = 30): Promise<AuditLogEntry[]> {
  const db = await readDatabase();
  return db.auditLog
    .filter((entry) => !entry.projectId)
    .slice(-limit)
    .reverse();
}

export interface EntraIdentity {
  oid: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  groups: string[];
}

export type EntraLoginResult =
  | { ok: true; user: User; linkedBy: "oid" | "email" | "invitation" | "mapping" }
  | { ok: false; reason: "denied" | "pending" | "suspended" };

function resolveMappedRole(
  settings: EntraSettings,
  identity: EntraIdentity,
): UserRole | null {
  const roleValues = new Set(identity.roles.map((role) => role.toLowerCase()));
  const groupIds = new Set(identity.groups.map((group) => group.toLowerCase()));
  const matched = settings.mappings
    .filter((mapping) =>
      mapping.type === "appRole"
        ? roleValues.has(mapping.value.toLowerCase())
        : groupIds.has(mapping.value.toLowerCase()),
    )
    .map((mapping) => mapping.role);
  return highestRole(matched);
}

/**
 * Résout une connexion Entra : liaison du compte (oid, puis e-mail, puis invitation),
 * application du rôle selon la priorité
 * « rôle fixé par un admin > correspondance Entra > invitation > politique par défaut ».
 */
export async function resolveEntraLogin(
  identity: EntraIdentity,
): Promise<EntraLoginResult> {
  return mutateDatabase((db): EntraLoginResult => {
    const now = new Date().toISOString();
    const email = identity.email.trim().toLowerCase();
    const mappedRole = resolveMappedRole(db.entraSettings, identity);
    const audit = (action: string, details: Record<string, unknown>, actor?: DbUser) =>
      appendAudit(db, {
        action,
        actorId: actor?.id ?? identity.oid,
        actorName: actor?.name ?? identity.name,
        details: { email, oid: identity.oid, ...details },
      });

    let user = db.users.find((item) => item.entraOid === identity.oid);
    let linkedBy: "oid" | "email" | "invitation" | "mapping" = "oid";

    if (!user && email) {
      user = db.users.find((item) => item.email.toLowerCase() === email);
      if (user) {
        user.entraOid = identity.oid;
        linkedBy = "email";
      }
    }

    if (!user && email) {
      const invitation = db.invitations.find(
        (item) => item.email === email && getInvitationStatus(item) === "pending",
      );
      if (invitation) {
        const role = mappedRole ?? invitation.role;
        user = buildDbUser({
          email,
          name: invitation.name || identity.name || email,
          password: randomBytes(32).toString("base64url"),
          role,
          permissions:
            role === invitation.role ? invitation.permissions : defaultPermissionsForRole(role),
          locale: invitation.locale,
          invitedBy: invitation.invitedBy,
        });
        user.entraOid = identity.oid;
        user.authSource = "entra";
        db.users.push(user);
        invitation.acceptedAt = now;
        invitation.acceptedUserId = user.id;
        notifyInvitationAccepted(db.notifications, invitation.invitedBy, {
          name: user.name,
          email: user.email,
          role: user.role,
        });
        linkedBy = "invitation";
      }
    }

    if (!user) {
      if (!mappedRole && db.entraSettings.unknownUserPolicy === "deny") {
        audit("auth.entra_denied", { reason: "unknown_user" });
        return { ok: false, reason: "denied" };
      }
      const role = mappedRole ?? "guest";
      user = buildDbUser({
        email: email || `${identity.oid}@entra.invalid`,
        name: identity.name || email,
        password: randomBytes(32).toString("base64url"),
        role,
        permissions: defaultPermissionsForRole(role),
      });
      user.entraOid = identity.oid;
      user.authSource = "entra";
      if (!mappedRole) {
        user.status = "suspended";
        user.pendingApproval = true;
      }
      db.users.push(user);
      linkedBy = "mapping";
      audit(mappedRole ? "auth.entra_user_created" : "auth.entra_pending", { role });
      if (!mappedRole) return { ok: false, reason: "pending" };
    }

    if (!user.roleOverride && mappedRole && mappedRole !== user.role) {
      const wouldDropLastAdmin =
        user.role === "admin" && countActiveAdmins(db, user.id) === 0;
      if (!wouldDropLastAdmin) {
        const previous = user.role;
        user.role = mappedRole;
        user.permissions = defaultPermissionsForRole(mappedRole);
        audit(
          "user.role_changed",
          { userId: user.id, from: previous, to: mappedRole, source: "entra_mapping" },
          user,
        );
      }
    }

    if (!isUserActive(user)) {
      audit("auth.entra_denied", { reason: user.pendingApproval ? "pending" : "suspended" }, user);
      return { ok: false, reason: user.pendingApproval ? "pending" : "suspended" };
    }

    user.lastLoginAt = now;
    audit("auth.entra_login", { linkedBy, role: user.role }, user);
    return { ok: true, user: stripPassword(user), linkedBy };
  });
}

// ─── Documents annexes ──────────────────────────────────────────────────────

export function getAnnexUploadsRoot(): string {
  return getUploadsRoot(DB_FILE);
}

export interface AnnexFileInput {
  originalName: string;
  mimeType: string;
  data: Buffer;
}

export interface AnnexMetadataInput {
  title?: string;
  description?: string;
  category?: AnnexCategory;
  phases?: HermesPhaseId[];
  folderId?: string;
}

function resolveAnnexFolder(
  db: Database,
  project: Project,
  folderId: string | undefined,
): string {
  ensureProjectFolders(db.projectFolders, project);
  if (folderId) {
    const folder = db.projectFolders.find(
      (item) => item.id === folderId && item.projectId === project.id,
    );
    if (!folder) throw new Error("Dossier introuvable.");
    return folder.id;
  }
  return phaseFolderId(project.id, project.currentPhase);
}

function normalizeAnnexPhases(project: Project, phases: HermesPhaseId[] | undefined): HermesPhaseId[] {
  if (!phases || phases.length === 0) return [];
  const allowed = new Set(getPhasesForApproach(project.approach).map((phase) => phase.id));
  const unique = [...new Set(phases.filter((phase) => allowed.has(phase)))];
  return unique.length === allowed.size ? [] : unique;
}

export async function listAnnexDocumentsByProject(projectId: string): Promise<AnnexDocument[]> {
  const db = await readDatabase();
  return db.annexDocuments
    .filter((doc) => doc.projectId === projectId && !doc.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function countAnnexDocumentsByProject(): Promise<Record<string, number>> {
  const db = await readDatabase();
  const counts: Record<string, number> = {};
  for (const doc of db.annexDocuments) {
    if (!doc.deletedAt) counts[doc.projectId] = (counts[doc.projectId] ?? 0) + 1;
  }
  return counts;
}

export async function getAnnexDocumentById(id: string): Promise<AnnexDocument | undefined> {
  const db = await readDatabase();
  return db.annexDocuments.find((doc) => doc.id === id && !doc.deletedAt);
}

export async function createAnnexDocument(
  projectId: string,
  metadata: AnnexMetadataInput,
  file: AnnexFileInput,
  actor: AuditActor,
): Promise<AnnexDocument> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Projet introuvable.");

  const documentId = crypto.randomUUID();
  const root = getAnnexUploadsRoot();
  const stored = await saveAnnexFile(root, projectId, documentId, 1, file.originalName, file.data);

  try {
    return await mutateDatabase((db) => {
      const now = new Date().toISOString();
      const version: AnnexDocumentVersion = {
        version: 1,
        storedName: stored.storedName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.data.length,
        sha256: stored.sha256,
        uploadedBy: actor.id,
        uploadedByName: actor.name,
        uploadedAt: now,
      };
      const document: AnnexDocument = {
        id: documentId,
        projectId,
        title: metadata.title?.trim() || file.originalName,
        description: metadata.description?.trim() || undefined,
        category: metadata.category ?? "autre",
        folderId: resolveAnnexFolder(db, project, metadata.folderId),
        phases: normalizeAnnexPhases(project, metadata.phases),
        versions: [version],
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: now,
        updatedAt: now,
      };
      db.annexDocuments.push(document);
      appendAudit(db, {
        projectId,
        action: "annex.uploaded",
        actorId: actor.id,
        actorName: actor.name,
        details: { documentId, title: document.title, fileName: file.originalName, size: version.size },
      });
      return document;
    });
  } catch (error) {
    await removeAnnexFile(root, projectId, documentId, stored.storedName).catch(() => undefined);
    throw error;
  }
}

export async function addAnnexDocumentVersion(
  documentId: string,
  file: AnnexFileInput,
  comment: string | undefined,
  actor: AuditActor,
): Promise<AnnexDocument> {
  const existing = await getAnnexDocumentById(documentId);
  if (!existing) throw new Error("Document introuvable.");

  const root = getAnnexUploadsRoot();
  const nextVersion = Math.max(...existing.versions.map((v) => v.version)) + 1;
  const stored = await saveAnnexFile(
    root,
    existing.projectId,
    documentId,
    nextVersion,
    file.originalName,
    file.data,
  );

  try {
    return await mutateDatabase((db) => {
      const document = db.annexDocuments.find((doc) => doc.id === documentId && !doc.deletedAt);
      if (!document) throw new Error("Document introuvable.");
      const now = new Date().toISOString();
      const version = Math.max(...document.versions.map((v) => v.version)) + 1;
      document.versions.push({
        version,
        storedName: stored.storedName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.data.length,
        sha256: stored.sha256,
        comment: comment?.trim().slice(0, 500) || undefined,
        uploadedBy: actor.id,
        uploadedByName: actor.name,
        uploadedAt: now,
      });
      document.updatedAt = now;
      appendAudit(db, {
        projectId: document.projectId,
        action: "annex.version_added",
        actorId: actor.id,
        actorName: actor.name,
        details: { documentId, title: document.title, version, fileName: file.originalName },
      });
      return document;
    });
  } catch (error) {
    await removeAnnexFile(root, existing.projectId, documentId, stored.storedName).catch(
      () => undefined,
    );
    throw error;
  }
}

export async function updateAnnexDocument(
  documentId: string,
  metadata: AnnexMetadataInput,
  actor: AuditActor,
): Promise<AnnexDocument> {
  return mutateDatabase((db) => {
    const document = db.annexDocuments.find((doc) => doc.id === documentId && !doc.deletedAt);
    if (!document) throw new Error("Document introuvable.");
    const project = db.projects.find((p) => p.id === document.projectId);
    if (!project) throw new Error("Projet introuvable.");

    if (metadata.title !== undefined) {
      const title = metadata.title.trim();
      if (!title) throw new Error("Le titre est requis.");
      document.title = title.slice(0, 200);
    }
    if (metadata.description !== undefined) {
      document.description = metadata.description.trim().slice(0, 2000) || undefined;
    }
    if (metadata.category !== undefined) document.category = metadata.category;
    if (metadata.phases !== undefined) {
      document.phases = normalizeAnnexPhases(project, metadata.phases);
    }
    if (metadata.folderId !== undefined) {
      document.folderId = resolveAnnexFolder(db, project, metadata.folderId);
    }
    document.updatedAt = new Date().toISOString();
    appendAudit(db, {
      projectId: document.projectId,
      action: "annex.updated",
      actorId: actor.id,
      actorName: actor.name,
      details: { documentId, title: document.title },
    });
    return document;
  });
}

/** Suppression logique : le document disparaît de l'interface, fichiers et historique conservés. */
export async function softDeleteAnnexDocument(
  documentId: string,
  actor: AuditActor,
): Promise<boolean> {
  return mutateDatabase((db) => {
    const document = db.annexDocuments.find((doc) => doc.id === documentId && !doc.deletedAt);
    if (!document) return false;
    document.deletedAt = new Date().toISOString();
    document.deletedBy = actor.id;
    appendAudit(db, {
      projectId: document.projectId,
      action: "annex.deleted",
      actorId: actor.id,
      actorName: actor.name,
      details: { documentId, title: document.title, versions: document.versions.length },
    });
    return true;
  });
}

// ─── Dossiers documentaires par projet ──────────────────────────────────────

export async function listProjectFolders(projectId: string): Promise<ProjectFolder[]> {
  const project = await getProjectById(projectId);
  if (!project) return [];
  const db = await readDatabase();
  if (!db.projectFolders.some((folder) => folder.id === phaseFolderId(projectId, project.currentPhase))) {
    await mutateDatabase((mutable) => {
      ensureProjectFolders(mutable.projectFolders, project);
    });
  }
  return db.projectFolders
    .filter((folder) => folder.projectId === projectId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function assertCustomFolderName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  if (!cleaned) throw new Error("folderNameRequired");
  return cleaned;
}

export async function createCustomFolder(
  projectId: string,
  parentId: string,
  name: string,
  actor: AuditActor,
): Promise<ProjectFolder> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Projet introuvable.");
  return mutateDatabase((db) => {
    ensureProjectFolders(db.projectFolders, project);
    const parent = db.projectFolders.find(
      (folder) => folder.id === parentId && folder.projectId === projectId,
    );
    if (!parent || parent.kind === "custom") throw new Error("folderParentInvalid");
    const cleanName = assertCustomFolderName(name);
    if (
      db.projectFolders.some(
        (folder) =>
          folder.parentId === parentId &&
          folder.name?.toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      throw new Error("folderExists");
    }
    const siblings = db.projectFolders.filter((folder) => folder.parentId === parentId);
    const folder: ProjectFolder = {
      id: crypto.randomUUID(),
      projectId,
      kind: "custom",
      parentId,
      phase: parent.phase,
      name: cleanName,
      order: parent.order + (siblings.length + 1) / 1000,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
    };
    db.projectFolders.push(folder);
    appendAudit(db, {
      projectId,
      action: "folder.created",
      actorId: actor.id,
      actorName: actor.name,
      details: { folderId: folder.id, name: cleanName, parentId },
    });
    return folder;
  });
}

export async function renameCustomFolder(
  projectId: string,
  folderId: string,
  name: string,
  actor: AuditActor,
): Promise<ProjectFolder> {
  return mutateDatabase((db) => {
    const folder = db.projectFolders.find(
      (item) => item.id === folderId && item.projectId === projectId,
    );
    if (!folder || folder.kind !== "custom") throw new Error("folderNotCustom");
    const cleanName = assertCustomFolderName(name);
    const previous = folder.name;
    folder.name = cleanName;
    appendAudit(db, {
      projectId,
      action: "folder.renamed",
      actorId: actor.id,
      actorName: actor.name,
      details: { folderId, from: previous, to: cleanName },
    });
    return folder;
  });
}

export async function deleteCustomFolder(
  projectId: string,
  folderId: string,
  actor: AuditActor,
): Promise<boolean> {
  return mutateDatabase((db) => {
    const index = db.projectFolders.findIndex(
      (item) => item.id === folderId && item.projectId === projectId,
    );
    if (index === -1) return false;
    const folder = db.projectFolders[index];
    if (folder.kind !== "custom") throw new Error("folderNotCustom");
    if (db.annexDocuments.some((doc) => doc.folderId === folderId && !doc.deletedAt)) {
      throw new Error("folderNotEmpty");
    }
    db.projectFolders.splice(index, 1);
    appendAudit(db, {
      projectId,
      action: "folder.deleted",
      actorId: actor.id,
      actorName: actor.name,
      details: { folderId, name: folder.name },
    });
    return true;
  });
}
