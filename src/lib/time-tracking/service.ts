import type { SessionUser, User } from "@/lib/auth/permissions";
import {
  getActivitiesByTaskId,
  getPortfolioById,
  getProjectById,
  getTaskById,
  listActivities,
  listAllUsers,
  listDeletedTasks,
  listPortfolios,
  listProjects,
  listTasks,
  listTaskEstimateRevisions,
  listTimeEntries,
  listTimeEntryAudit,
  listUsers,
  type TimeEntryFilter,
} from "@/lib/db/store";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import { todayIso } from "@/lib/reports/format";
import { localizeTask } from "@/lib/hermes/i18n";
import { normalizeLocale, type Locale } from "@/lib/i18n/config";
import { toAssigneeOptions, type AssigneeOption } from "@/lib/users";
import type {
  AuditLogEntry,
  EstimateRevisionReason,
  Portfolio,
  Project,
  Task,
  TimeEntry,
} from "@/types";
import {
  canModifyTimeEntry,
  getTimeAccess,
  isOwnEntry,
  isTimeManager,
  type TimeAccess,
} from "./access";
import { DAILY_WARNING_MINUTES, dailyTotalMinutes } from "./rules";
import { buildProjectTimeAnalysis, type ProjectTimeAnalysis } from "./summary";

export interface TimeEntryView extends TimeEntry {
  userName: string;
  createdByName: string;
  updatedByName: string;
  taskTitle: string;
  projectName: string;
  phase?: Task["phase"];
  canEdit: boolean;
}

export interface TimeHistoryItem {
  id: string;
  action: "created" | "updated" | "deleted";
  actorName: string;
  createdAt: string;
  entryId?: string;
  userName?: string;
  before?: { date: string; durationMinutes: number; comment: string | null; userId: string };
  after?: { date: string; durationMinutes: number; comment: string | null; userId: string };
}

export interface EstimateRevisionView {
  id: string;
  previousHours: number | null;
  newHours: number | null;
  reason: EstimateRevisionReason;
  reasonText?: string;
  changedByName: string;
  changedAt: string;
}

export interface TaskTimeContext {
  taskId: string;
  projectId: string;
  estimatedHours: number | null;
  initialEstimatedHours: number | null;
  estimateRevisions: EstimateRevisionView[];
  totalMinutes: number;
  entries: TimeEntryView[];
  history: TimeHistoryItem[];
  permissions: TimeAccess & { canEditEstimate: boolean };
  members: AssigneeOption[];
  currentUserId: string;
}

export interface DailyWarning {
  date: string;
  totalMinutes: number;
  limitMinutes: number;
}

export interface TaskTimeScope {
  task: Task;
  project: Project;
  portfolio?: Portfolio;
  access: TimeAccess;
  /** Assigné (tâche ou activité) : voit toutes les saisies de la tâche. */
  canWork: boolean;
}

export async function loadTaskTimeScope(taskId: string, user: SessionUser): Promise<TaskTimeScope | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;
  const project = await getProjectById(task.projectId);
  if (!project) return null;
  const portfolio = project.portfolioId ? await getPortfolioById(project.portfolioId) : undefined;
  const activities = await getActivitiesByTaskId(taskId);
  const access = getTimeAccess(user, project, portfolio, task, activities);
  return { task, project, portfolio, access, canWork: access.canLogOwn };
}

function nameResolver(users: User[]): (id: string) => string {
  const byId = new Map(users.map((user) => [user.id, user.name]));
  return (id) => byId.get(id) ?? "—";
}

function toView(
  entry: TimeEntry,
  user: SessionUser,
  name: (id: string) => string,
  task: Task | undefined,
  project: Project | undefined,
  canManageProject: boolean,
): TimeEntryView {
  return {
    ...entry,
    userName: name(entry.userId),
    createdByName: name(entry.createdBy),
    updatedByName: name(entry.updatedBy),
    taskTitle: task?.title ?? "—",
    projectName: project?.name ?? "—",
    phase: task?.phase,
    canEdit: !entry.deletedAt && canModifyTimeEntry(user, entry, canManageProject),
  };
}

function toHistoryItem(entry: AuditLogEntry): TimeHistoryItem {
  const details = entry.details as Partial<TimeHistoryItem> & { entryId?: string; userName?: string };
  return {
    id: entry.id,
    action: entry.action.replace("time.", "") as TimeHistoryItem["action"],
    actorName: entry.actorName,
    createdAt: entry.createdAt,
    entryId: details.entryId,
    userName: details.userName,
    before: details.before,
    after: details.after,
  };
}

function concernsUser(entry: AuditLogEntry, userId: string): boolean {
  const details = entry.details as Partial<TimeHistoryItem>;
  return (
    entry.actorId === userId || details.before?.userId === userId || details.after?.userId === userId
  );
}

export async function getTaskTimeContext(scope: TaskTimeScope, user: SessionUser): Promise<TaskTimeContext> {
  const { task, project, access } = scope;
  const [entries, users, allUsers, audit, revisions] = await Promise.all([
    listTimeEntries({ taskId: task.id }),
    listUsers(),
    listAllUsers(),
    listTimeEntryAudit({ projectId: project.id, taskId: task.id }),
    listTaskEstimateRevisions({ taskId: task.id }),
  ]);
  const name = nameResolver(allUsers);
  const seeAll = access.canManage || scope.canWork;
  const visible = entries.filter((entry) => seeAll || isOwnEntry(user, entry));
  const localized = localizeTask(task, normalizeLocale(project.documentLocale));

  return {
    taskId: task.id,
    projectId: project.id,
    estimatedHours: task.estimatedHours ?? null,
    initialEstimatedHours: task.initialEstimatedHours ?? null,
    estimateRevisions: revisions.map((revision) => ({
      id: revision.id,
      previousHours: revision.previousHours,
      newHours: revision.newHours,
      reason: revision.reason,
      reasonText: revision.reasonText,
      changedByName: name(revision.changedBy),
      changedAt: revision.changedAt,
    })),
    totalMinutes: visible.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    entries: visible.map((entry) => toView(entry, user, name, localized, project, access.canManage)),
    history: audit
      .filter((entry) => access.canManage || concernsUser(entry, user.id))
      .slice(0, 50)
      .map(toHistoryItem),
    permissions: {
      ...access,
      canEditEstimate: access.canManage,
    },
    members: access.canManage ? toAssigneeOptions(users) : [],
    currentUserId: user.id,
  };
}

export async function getDailyWarning(userId: string, date: string): Promise<DailyWarning | null> {
  const entries = await listTimeEntries({ userId, from: date, to: date });
  const totalMinutes = dailyTotalMinutes(entries, userId, date);
  return totalMinutes > DAILY_WARNING_MINUTES
    ? { date, totalMinutes, limitMinutes: DAILY_WARNING_MINUTES }
    : null;
}

/**
 * Liste filtrée des saisies visibles : les siennes, celles des projets gérés
 * (chef de projet / portfolio) et toutes pour un administrateur.
 */
export async function listVisibleTimeEntries(
  user: SessionUser,
  query: TimeEntryFilter,
): Promise<TimeEntryView[]> {
  const [entries, projects, portfolios, activeTasks, deletedTasks, allUsers] = await Promise.all([
    listTimeEntries(query),
    listProjects(),
    listPortfolios(true),
    listTasks(),
    listDeletedTasks(),
    listAllUsers(),
  ]);
  const tasks = [...deletedTasks, ...activeTasks];
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const managed = new Map<string, boolean>();
  const canManage = (projectId: string): boolean => {
    if (!managed.has(projectId)) {
      const project = projectById.get(projectId);
      managed.set(
        projectId,
        Boolean(
          project &&
            isTimeManager(user, project, project.portfolioId ? portfolioById.get(project.portfolioId) : undefined),
        ),
      );
    }
    return managed.get(projectId)!;
  };
  const name = nameResolver(allUsers);

  return entries
    .filter((entry) => isOwnEntry(user, entry) || canManage(entry.projectId))
    .map((entry) => {
      const project = projectById.get(entry.projectId);
      const task = taskById.get(entry.taskId);
      const localized = task && project ? localizeTask(task, normalizeLocale(project.documentLocale)) : task;
      return toView(entry, user, name, localized, project, canManage(entry.projectId));
    });
}

export interface TimesheetTaskRow {
  taskId: string;
  title: string;
  projectId: string;
  projectName: string;
  phase: Task["phase"];
  status: Task["status"];
  estimatedHours: number | null;
}

/** Tâches sur lesquelles l'utilisateur peut saisir son temps (assigné à la tâche ou à une activité). */
export async function listMyTimesheetTasks(user: SessionUser): Promise<TimesheetTaskRow[]> {
  const [tasks, activities, projects] = await Promise.all([listTasks(), listActivities(), listProjects()]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const activityTaskIds = new Set(
    activities.filter((activity) => activity.assigneeId === user.id).map((activity) => activity.taskId),
  );
  return tasks
    .filter((task) => task.assigneeId === user.id || activityTaskIds.has(task.id))
    .flatMap((task) => {
      const project = projectById.get(task.projectId);
      if (!project) return [];
      const localized = localizeTask(task, normalizeLocale(project.documentLocale));
      return [
        {
          taskId: task.id,
          title: localized.title,
          projectId: project.id,
          projectName: project.name,
          phase: task.phase,
          status: task.status,
          estimatedHours: task.estimatedHours ?? null,
        },
      ];
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.title.localeCompare(b.title));
}

/** Analyse complète de l'utilisation du temps d'un projet (page projet et rapports). */
export async function loadProjectTimeAnalysis(
  project: Project,
  locale: Locale,
  data?: { tasks?: Task[]; entries?: TimeEntry[]; users?: User[] },
): Promise<ProjectTimeAnalysis> {
  const projectLocale = normalizeLocale(project.documentLocale);
  const [tasks, entries, revisions, users] = await Promise.all([
    data?.tasks ?? listTasks().then((all) => all.filter((task) => task.projectId === project.id)),
    data?.entries ?? listTimeEntries({ projectId: project.id }),
    listTaskEstimateRevisions({ projectId: project.id }),
    data?.users ?? listAllUsers(),
  ]);
  const t = getTranslator(locale);
  return buildProjectTimeAnalysis({
    project,
    tasks: tasks.map((task) => localizeTask(task, projectLocale)),
    entries,
    revisions,
    today: todayIso(),
    userName: nameResolver(users),
    phaseLabel: (phase) => tDynamic(t, `enums.phase.${phase}`),
    phaseOrder: getPhasesForApproach(project.approach).map((phase) => phase.id),
  });
}

export interface TaskTimeIndex {
  /** Minutes saisies (actives) par tâche. */
  timeByTask: Record<string, number>;
  /** Tâches sur lesquelles l'utilisateur peut saisir du temps. */
  canLogTaskIds: string[];
}

/** Index des temps par tâche et des tâches « saisissables » par l'utilisateur (tableaux de tâches). */
export async function buildTaskTimeIndex(user: SessionUser, tasks: Task[]): Promise<TaskTimeIndex> {
  const [entries, activities, projects, portfolios] = await Promise.all([
    listTimeEntries(),
    listActivities(),
    listProjects(),
    listPortfolios(true),
  ]);
  const taskIds = new Set(tasks.map((task) => task.id));
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));
  const managed = new Set(
    projects
      .filter((project) =>
        isTimeManager(user, project, project.portfolioId ? portfolioById.get(project.portfolioId) : undefined),
      )
      .map((project) => project.id),
  );
  const activityTaskIds = new Set(
    activities.filter((activity) => activity.assigneeId === user.id).map((activity) => activity.taskId),
  );
  const timeByTask: Record<string, number> = {};
  for (const entry of entries) {
    if (!taskIds.has(entry.taskId)) continue;
    timeByTask[entry.taskId] = (timeByTask[entry.taskId] ?? 0) + entry.durationMinutes;
  }
  return {
    timeByTask,
    canLogTaskIds: tasks
      .filter(
        (task) => managed.has(task.projectId) || task.assigneeId === user.id || activityTaskIds.has(task.id),
      )
      .map((task) => task.id),
  };
}
