import type { SessionUser } from "@/lib/auth/permissions";
import { listAnnexDocumentsByProject, listGeneratedDocumentsByProject } from "@/lib/db/store";
import { getPublicBaseUrl } from "@/lib/integrations/config";
import {
  getVisibleProject,
  listMyOpenTasks,
  listVisibleProjects,
  resolveUserByEntraOid,
} from "@/lib/integrations/actions";
import type { Project } from "@/types";
import {
  documentPreview,
  documentSummaryCard,
  extensionAttachment,
  genericPreview,
  genericProjectorCard,
  projectPreview,
  projectSummaryCard,
  taskPreview,
  taskSummaryCard,
  type DocumentSummary,
} from "./cards-share";
import { normalizeText } from "./commands";
import { todayIso } from "./cards";
import { botI18nFor } from "./context";
import type { BotI18n } from "./i18n";
import type { IncomingActivity } from "./types";

/**
 * Extension de messagerie PROJECTOR : recherche (commande `searchProjector`, paramètre `query`)
 * et aperçu des liens PROJECTOR collés dans une conversation (`composeExtension/queryLink`).
 */

export const SEARCH_COMMAND_ID = "searchProjector";
export const SEARCH_PARAMETER = "query";

const MAX_RESULTS = 25;
const INITIAL_PROJECTS = 10;
const INITIAL_TASKS = 10;

type ExtensionAttachment = ReturnType<typeof extensionAttachment>;

interface ComposeQueryValue {
  commandId?: string;
  parameters?: { name?: string; value?: unknown }[];
  queryOptions?: { skip?: number; count?: number };
}

export function composeMessage(text: string): unknown {
  return { composeExtension: { type: "message", text } };
}

function composeResult(attachments: ExtensionAttachment[]): unknown {
  return { composeExtension: { type: "result", attachmentLayout: "list", attachments } };
}

function matches(needle: string, ...values: (string | undefined)[]): boolean {
  return values.some((value) => value !== undefined && normalizeText(value).includes(needle));
}

async function projectDocuments(project: Project): Promise<DocumentSummary[]> {
  const [annexes, generated] = await Promise.all([
    listAnnexDocumentsByProject(project.id),
    listGeneratedDocumentsByProject(project.id),
  ]);
  return [
    ...annexes
      .filter((doc) => !doc.deletedAt)
      .map<DocumentSummary>((doc) => ({
        kind: "annex",
        id: doc.id,
        title: doc.title,
        project,
        phase: doc.phases.length === 1 ? doc.phases[0] : undefined,
        version: doc.versions[doc.versions.length - 1]?.version,
        date: doc.updatedAt,
      })),
    ...generated.map<DocumentSummary>((doc) => ({
      kind: "deliverable",
      id: doc.id,
      title: doc.title,
      project,
      phase: doc.phase,
      version: doc.version,
      date: doc.updatedAt ?? doc.generatedAt,
    })),
  ];
}

async function search(user: SessionUser, query: string, i18n: BotI18n): Promise<ExtensionAttachment[]> {
  const today = todayIso();
  const needle = normalizeText(query);
  const [projects, tasks] = await Promise.all([listVisibleProjects(user), listMyOpenTasks(user)]);

  if (!needle) {
    return [
      ...tasks
        .slice(0, INITIAL_TASKS)
        .map(({ task, project }) =>
          extensionAttachment(taskSummaryCard(i18n, task, project, today), taskPreview(i18n, task, project)),
        ),
      ...projects
        .filter((project) => project.status !== "termine")
        .slice(0, INITIAL_PROJECTS)
        .map((project) => extensionAttachment(projectSummaryCard(i18n, project), projectPreview(i18n, project))),
    ];
  }

  const projectHits = projects.filter((project) => matches(needle, project.name, project.id, project.description));
  const taskHits = tasks.filter(({ task, project }) => matches(needle, task.title, project.name));
  const documents = (await Promise.all(projects.map(projectDocuments))).flat();
  const documentHits = documents
    .filter((doc) => matches(needle, doc.title))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return [
    ...projectHits.map((project) =>
      extensionAttachment(projectSummaryCard(i18n, project), projectPreview(i18n, project)),
    ),
    ...taskHits.map(({ task, project }) =>
      extensionAttachment(taskSummaryCard(i18n, task, project, today), taskPreview(i18n, task, project)),
    ),
    ...documentHits.map((doc) => extensionAttachment(documentSummaryCard(i18n, doc), documentPreview(i18n, doc))),
  ];
}

/** `composeExtension/query` : recherche de projets, tâches et documents visibles par l'utilisateur. */
export async function handleComposeQuery(activity: IncomingActivity): Promise<unknown> {
  const user = await resolveUserByEntraOid(activity.from.aadObjectId);
  const i18n = botI18nFor(user, activity.locale);
  if (!user) return composeMessage(i18n.t("extension.notLinked"));

  const value = (activity.value ?? {}) as ComposeQueryValue;
  const parameters = Array.isArray(value.parameters) ? value.parameters : [];
  const initialRun = parameters.some((item) => item.name === "initialRun" && String(item.value) === "true");
  const rawQuery = parameters.find((item) => item.name === SEARCH_PARAMETER)?.value;
  const query = initialRun || typeof rawQuery !== "string" ? "" : rawQuery.slice(0, 200);

  const skip = Math.max(0, Number(value.queryOptions?.skip) || 0);
  const count = Math.min(MAX_RESULTS, Math.max(1, Number(value.queryOptions?.count) || MAX_RESULTS));
  const results = await search(user, query, i18n);
  return composeResult(results.slice(skip, skip + count));
}

type LinkTarget =
  | { kind: "project"; projectId: string }
  | { kind: "documents"; projectId: string }
  | { kind: "other"; path: string };

function parseProjectorLink(rawUrl: unknown): LinkTarget | null {
  if (typeof rawUrl !== "string") return null;
  let url: URL;
  let base: URL;
  try {
    url = new URL(rawUrl);
    base = new URL(getPublicBaseUrl());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== base.protocol) return null;
  if (url.host.toLowerCase() !== base.host.toLowerCase()) return null;
  const project = /^\/projets\/([^/?#]+)/.exec(url.pathname);
  if (project) return { kind: "project", projectId: decodeURIComponent(project[1]) };
  const documents = /^\/documents\/([^/?#]+)/.exec(url.pathname);
  if (documents) return { kind: "documents", projectId: decodeURIComponent(documents[1]) };
  return { kind: "other", path: url.pathname };
}

/** `composeExtension/queryLink` : aperçu d'un lien PROJECTOR (carte générique si non visible). */
export async function handleQueryLink(activity: IncomingActivity, anonymous = false): Promise<unknown> {
  const user = anonymous ? null : await resolveUserByEntraOid(activity.from.aadObjectId);
  const i18n = botI18nFor(user, activity.locale);
  const target = parseProjectorLink((activity.value as { url?: unknown } | undefined)?.url);
  const generic = composeResult([
    extensionAttachment(genericProjectorCard(i18n, target?.kind === "other" ? target.path : "/"), genericPreview(i18n)),
  ]);
  if (!target || target.kind === "other" || !user) return generic;

  const project = await getVisibleProject(user, target.projectId);
  if (!project) return generic;
  return composeResult([extensionAttachment(projectSummaryCard(i18n, project), projectPreview(i18n, project))]);
}
