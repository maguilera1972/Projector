import { absoluteUrl } from "@/lib/integrations/config";
import { formatDuration } from "@/lib/time-tracking/duration";
import type { BudgetRevision, PhaseValidation, Project, Task } from "@/types";
import type { BotI18n } from "./i18n";
import type { AdaptiveCard } from "./types";

/**
 * Cartes adaptatives v1.5 du bot (conversation personnelle, canaux, réponses Action.Execute).
 * Tout texte d'origine utilisateur passe par `safe()` : les TextBlock/FactSet interprètent un sous-ensemble Markdown.
 */

const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";
const MAX_LIST_ITEMS = 15;

/** Verbes Action.Execute (Universal Actions) traités par le bot. */
export type CardVerb =
  | "approveGate"
  | "rejectGate"
  | "approveBudget"
  | "rejectBudget"
  | "completeTask"
  | "commentTask"
  | "refresh";

/** Vue à régénérer après une action (`refresh` ou résultat d'une action). */
export type CardView = "tasks" | "decisions" | "status";

export const CARD_VERBS: CardVerb[] = [
  "approveGate",
  "rejectGate",
  "approveBudget",
  "rejectBudget",
  "completeTask",
  "commentTask",
  "refresh",
];

/** Identifiants des champs de saisie (uniques par élément dans une carte en liste). */
export const inputIds = {
  signature: (key: string) => `signature_${key}`,
  reason: (key: string) => `reason_${key}`,
  comment: (key: string) => `comment_${key}`,
};

export type BannerKind = "good" | "warning" | "attention";

export interface Banner {
  kind: BannerKind;
  text: string;
}

export type CardWeatherTone = "green" | "orange" | "red" | "neutral";

/**
 * Neutralise les constructions interprétées dans un texte fourni par un utilisateur :
 * liens Markdown `[x](url)`, fonctions `{{DATE()}}`, listes/titres en début de ligne.
 */
export function safe(value: string | undefined, max = 400): string {
  if (!value) return "";
  let text = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (text.length > max) text = `${text.slice(0, max - 1)}…`;
  return text
    .replace(/\]\s*\(/g, "]\u200b(")
    .replace(/\{\{/g, "{\u200b{")
    .replace(/^(\s*)([-*+#>]|\d+\.)(\s)/gm, "$1\u200b$2$3");
}

export function webUrl(path: string): string {
  return absoluteUrl(path);
}

export function adaptiveCard(body: unknown[], actions: unknown[] = []): AdaptiveCard {
  return {
    type: "AdaptiveCard",
    $schema: SCHEMA,
    version: "1.5",
    body,
    ...(actions.length > 0 ? { actions } : {}),
    msteams: { width: "Full" },
  };
}

export function textBlock(text: string, options: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: "TextBlock", text, wrap: true, ...options };
}

export function header(title: string, subtitle?: string): Record<string, unknown> {
  return {
    type: "Container",
    items: [
      textBlock("PROJECTOR", { size: "Small", weight: "Bolder", color: "Accent", spacing: "None" }),
      textBlock(title, { size: "Large", weight: "Bolder", spacing: "Small" }),
      ...(subtitle ? [textBlock(subtitle, { isSubtle: true, spacing: "None" })] : []),
    ],
  };
}

export function factSet(facts: [string, string][]): Record<string, unknown> {
  return {
    type: "FactSet",
    facts: facts.filter(([, value]) => value !== "").map(([title, value]) => ({ title, value })),
  };
}

export function bannerBlock(banner: Banner): Record<string, unknown> {
  return {
    type: "Container",
    style: banner.kind,
    bleed: true,
    items: [textBlock(safe(banner.text, 600), { weight: "Bolder" })],
  };
}

export function openUrlAction(title: string, path: string): Record<string, unknown> {
  return { type: "Action.OpenUrl", title, url: webUrl(path) };
}

export function executeAction(
  title: string,
  verb: CardVerb,
  data: Record<string, string>,
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: "Action.Execute", title, verb, data: { verb, ...data }, ...options };
}

/** Bouton qui envoie une commande texte comme si l'utilisateur l'avait tapée (tous les contextes Teams). */
export function commandAction(title: string, command: string): Record<string, unknown> {
  return { type: "Action.Submit", title, data: { msteams: { type: "imBack", value: command } } };
}

function inputCard(
  input: Record<string, unknown>,
  submit: Record<string, unknown>,
): Record<string, unknown> {
  return { type: "AdaptiveCard", body: [input], actions: [submit] };
}

export function weatherColor(tone: CardWeatherTone): string {
  switch (tone) {
    case "green":
      return "Good";
    case "orange":
      return "Warning";
    case "red":
      return "Attention";
    case "neutral":
      return "Default";
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

/** Date du jour (AAAA-MM-JJ) à Zurich. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
}

export function isOverdue(task: Pick<Task, "dueDate" | "status">, today: string): boolean {
  return Boolean(task.dueDate) && task.status !== "termine" && task.dueDate!.slice(0, 10) < today;
}

// ─── Aide, compte non lié, messages simples ───────────────────────────────

export function helpCard(
  i18n: BotI18n,
  options: { userName?: string; intro?: string; banner?: Banner } = {},
): AdaptiveCard {
  const { t } = i18n;
  const rows: [string, string][] = [
    [t("commands.myTasks"), t("help.myTasks")],
    [t("help.statusSyntax"), t("help.status")],
    [t("commands.decisions"), t("help.decisions")],
    [t("commands.help"), t("help.help")],
  ];
  return adaptiveCard(
    [
      ...(options.banner ? [bannerBlock(options.banner)] : []),
      header(t("help.title"), t("common.tagline")),
      ...(options.intro ? [textBlock(safe(options.intro, 600))] : []),
      textBlock(
        options.userName ? t("help.greeting", { name: safe(options.userName, 80) }) : t("help.greetingAnonymous"),
      ),
      ...rows.map(([command, description]) => ({
        type: "ColumnSet",
        spacing: "Small",
        columns: [
          { type: "Column", width: "auto", items: [textBlock(safe(command), { weight: "Bolder" })] },
          { type: "Column", width: "stretch", items: [textBlock(description)] },
        ],
      })),
      textBlock(t("help.search"), { isSubtle: true, size: "Small", spacing: "Medium" }),
    ],
    [
      commandAction(t("commands.myTasks"), t("commands.myTasks")),
      commandAction(t("commands.decisions"), t("commands.decisions")),
      openUrlAction(t("common.openProjector"), "/"),
    ],
  );
}

export function linkAccountCard(i18n: BotI18n): AdaptiveCard {
  const { t } = i18n;
  return adaptiveCard(
    [header(t("link.title")), textBlock(t("link.text"))],
    [openUrlAction(t("link.action"), "/login")],
  );
}

/** Carte de résultat seule (confirmation, erreur). */
export function messageCard(i18n: BotI18n, banner: Banner, actions: unknown[] = []): AdaptiveCard {
  return adaptiveCard(
    [bannerBlock(banner)],
    actions.length > 0 ? actions : [openUrlAction(i18n.t("common.openProjector"), "/")],
  );
}

// ─── Mes tâches ────────────────────────────────────────────────────────────

export interface TaskListItem {
  task: Task;
  project: Project;
  /** Temps total saisi sur la tâche (minutes). */
  minutesSpent?: number;
}

function taskItem(i18n: BotI18n, item: TaskListItem, today: string): Record<string, unknown> {
  const { t } = i18n;
  const { task, project } = item;
  const overdue = isOverdue(task, today);
  const due = task.dueDate ? i18n.date(task.dueDate) : t("common.noDueDate");
  const commentId = inputIds.comment(task.id);
  return {
    type: "Container",
    separator: true,
    spacing: "Medium",
    items: [
      textBlock(safe(task.title, 200), { weight: "Bolder" }),
      textBlock(
        `${safe(project.name, 120)} · ${i18n.phase(task.phase)} · ${i18n.taskStatus(task.status)} · ${task.progress} %`,
        { isSubtle: true, spacing: "None", size: "Small" },
      ),
      textBlock(`${t("common.dueDate")} : ${due}${overdue ? ` — ${t("common.overdue")}` : ""}`, {
        spacing: "None",
        size: "Small",
        color: overdue ? "Attention" : "Default",
      }),
      ...(item.minutesSpent !== undefined
        ? [
            textBlock(
              task.estimatedHours
                ? t("tasks.timeSpentPlanned", {
                    spent: formatDuration(item.minutesSpent),
                    planned: task.estimatedHours,
                  })
                : t("tasks.timeSpent", { spent: formatDuration(item.minutesSpent) }),
              { spacing: "None", size: "Small", isSubtle: true },
            ),
          ]
        : []),
      {
        type: "ActionSet",
        actions: [
          executeAction(t("tasks.complete"), "completeTask", { taskId: task.id, view: "tasks" }, { style: "positive" }),
          {
            type: "Action.ShowCard",
            title: t("tasks.comment"),
            card: inputCard(
              {
                type: "Input.Text",
                id: commentId,
                label: t("tasks.commentLabel"),
                placeholder: t("tasks.commentPlaceholder"),
                isMultiline: true,
                isRequired: true,
                maxLength: 2000,
                errorMessage: t("tasks.commentRequired"),
              },
              executeAction(t("tasks.send"), "commentTask", { taskId: task.id, view: "tasks" }),
            ),
          },
          openUrlAction(t("common.open"), `/projets/${encodeURIComponent(project.id)}`),
        ],
      },
    ],
  };
}

export function myTasksCard(
  i18n: BotI18n,
  items: TaskListItem[],
  today: string,
  banner?: Banner,
): AdaptiveCard {
  const { t } = i18n;
  const shown = items.slice(0, MAX_LIST_ITEMS);
  return adaptiveCard(
    [
      ...(banner ? [bannerBlock(banner)] : []),
      header(t("tasks.title", { count: items.length })),
      ...(items.length === 0 ? [textBlock(t("tasks.empty"))] : shown.map((item) => taskItem(i18n, item, today))),
      ...(items.length > shown.length
        ? [textBlock(t("common.more", { count: items.length - shown.length }), { isSubtle: true })]
        : []),
    ],
    [executeAction(t("common.refresh"), "refresh", { view: "tasks" }), openUrlAction(t("common.openProjector"), "/taches")],
  );
}

// ─── Décisions en attente ──────────────────────────────────────────────────

export interface GateDecisionItem {
  project: Project;
  validation: PhaseValidation;
  submittedByName?: string;
}

export interface BudgetDecisionItem {
  project: Project;
  revision: BudgetRevision;
  requestedByName?: string;
}

function decisionActions(
  i18n: BotI18n,
  key: string,
  projectId: string,
  approve: Record<string, unknown>,
  reject: Record<string, unknown>,
): Record<string, unknown> {
  const { t } = i18n;
  return {
    type: "ActionSet",
    actions: [
      {
        type: "Action.ShowCard",
        title: t("decisions.approve"),
        card: inputCard(
          {
            type: "Input.Text",
            id: inputIds.signature(key),
            label: t("decisions.signatureLabel"),
            isRequired: true,
            maxLength: 200,
            errorMessage: t("decisions.signatureRequired"),
          },
          approve,
        ),
      },
      {
        type: "Action.ShowCard",
        title: t("decisions.reject"),
        card: inputCard(
          {
            type: "Input.Text",
            id: inputIds.reason(key),
            label: t("decisions.rejectLabel"),
            isMultiline: true,
            isRequired: true,
            maxLength: 2000,
            errorMessage: t("decisions.rejectRequired"),
          },
          reject,
        ),
      },
      openUrlAction(t("common.open"), `/projets/${encodeURIComponent(projectId)}`),
    ],
  };
}

function gateItem(i18n: BotI18n, item: GateDecisionItem): Record<string, unknown> {
  const { t } = i18n;
  const { project, validation } = item;
  const data = { projectId: project.id, validationId: validation.id, view: "decisions" };
  return {
    type: "Container",
    separator: true,
    spacing: "Medium",
    items: [
      textBlock(`${t("decisions.gate")} — ${safe(project.name, 120)}`, { weight: "Bolder" }),
      textBlock(
        t("decisions.gateTransition", {
          from: i18n.phase(validation.fromPhase),
          to: i18n.phase(validation.toPhase),
        }),
        { spacing: "None" },
      ),
      textBlock(
        t("decisions.submitted", {
          name: safe(item.submittedByName ?? validation.submittedBy, 80),
          date: i18n.date(validation.submittedAt),
        }),
        { isSubtle: true, size: "Small", spacing: "None" },
      ),
      ...(validation.submitComment
        ? [textBlock(safe(validation.submitComment, 500), { isSubtle: true, maxLines: 4 })]
        : []),
      decisionActions(
        i18n,
        validation.id,
        project.id,
        executeAction(t("decisions.confirmApprove"), "approveGate", data, { style: "positive" }),
        executeAction(t("decisions.confirmReject"), "rejectGate", data, { style: "destructive" }),
      ),
    ],
  };
}

function budgetItem(i18n: BotI18n, item: BudgetDecisionItem): Record<string, unknown> {
  const { t } = i18n;
  const { project, revision } = item;
  const data = { projectId: project.id, revisionId: revision.id, view: "decisions" };
  return {
    type: "Container",
    separator: true,
    spacing: "Medium",
    items: [
      textBlock(`${t("decisions.budget")} — ${safe(project.name, 120)}`, { weight: "Bolder" }),
      factSet([
        [t("decisions.amount"), i18n.money(revision.amountCHF)],
        [t("decisions.hours"), revision.hoursForfait !== undefined ? String(revision.hoursForfait) : ""],
        [t("decisions.reason"), safe(revision.reason, 300)],
      ]),
      textBlock(
        `${t("decisions.requested", { date: i18n.date(revision.requestedAt) })}${
          item.requestedByName ? ` · ${safe(item.requestedByName, 80)}` : ""
        }`,
        { isSubtle: true, size: "Small", spacing: "Small" },
      ),
      decisionActions(
        i18n,
        revision.id,
        project.id,
        executeAction(t("decisions.confirmApprove"), "approveBudget", data, { style: "positive" }),
        executeAction(t("decisions.confirmReject"), "rejectBudget", data, { style: "destructive" }),
      ),
    ],
  };
}

export function pendingDecisionsCard(
  i18n: BotI18n,
  gates: GateDecisionItem[],
  budgets: BudgetDecisionItem[],
  banner?: Banner,
): AdaptiveCard {
  const { t } = i18n;
  const count = gates.length + budgets.length;
  const items = [
    ...gates.map((item) => gateItem(i18n, item)),
    ...budgets.map((item) => budgetItem(i18n, item)),
  ];
  const shown = items.slice(0, MAX_LIST_ITEMS);
  return adaptiveCard(
    [
      ...(banner ? [bannerBlock(banner)] : []),
      header(t("decisions.title", { count })),
      ...(count === 0 ? [textBlock(t("decisions.empty"))] : shown),
      ...(items.length > shown.length
        ? [textBlock(t("common.more", { count: items.length - shown.length }), { isSubtle: true })]
        : []),
    ],
    [executeAction(t("common.refresh"), "refresh", { view: "decisions" }), openUrlAction(t("common.openProjector"), "/")],
  );
}

// ─── État d'un projet ──────────────────────────────────────────────────────

export interface ProjectStatusData {
  project: Project;
  weather?: CardWeatherTone;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  pendingGate?: PhaseValidation;
  pendingBudget?: BudgetRevision;
}

export function projectStatusCard(i18n: BotI18n, data: ProjectStatusData, banner?: Banner): AdaptiveCard {
  const { t } = i18n;
  const { project } = data;
  const pending = [
    data.pendingGate
      ? t("status.pendingGate", {
          from: i18n.phase(data.pendingGate.fromPhase),
          to: i18n.phase(data.pendingGate.toPhase),
        })
      : "",
    data.pendingBudget ? t("status.pendingBudget", { amount: i18n.money(data.pendingBudget.amountCHF) }) : "",
  ].filter(Boolean);
  const alerts = [
    data.overdueTasks > 0 ? t("status.overdueValue", { count: data.overdueTasks }) : "",
    data.blockedTasks > 0 ? t("status.blockedValue", { count: data.blockedTasks }) : "",
  ].filter(Boolean);
  const budget = project.budget !== undefined ? `${i18n.money(project.budget)} · ` : "";
  return adaptiveCard(
    [
      ...(banner ? [bannerBlock(banner)] : []),
      header(safe(project.name, 150), t("status.title")),
      ...(data.weather
        ? [
            textBlock(`${t("status.weather")} : ${t(`weather.${data.weather}`)}`, {
              weight: "Bolder",
              color: weatherColor(data.weather),
            }),
          ]
        : []),
      factSet([
        [t("common.phase"), i18n.phase(project.currentPhase)],
        [t("common.status"), i18n.projectStatus(project.status)],
        [t("common.progress"), `${Math.round(project.progress)} %`],
        [t("status.budget"), `${budget}${i18n.budgetStatus(project.budgetStatus)}`],
        [
          t("status.period"),
          `${i18n.date(project.startDate)}${project.endDate ? ` – ${i18n.date(project.endDate)}` : ""}`,
        ],
        [t("status.chef"), safe(project.chefDeProjet, 120)],
        [t("status.mandant"), safe(project.mandant, 120)],
        [
          t("status.tasks"),
          [
            t("status.tasksValue", {
              completed: data.completedTasks,
              total: data.totalTasks,
              open: data.openTasks,
            }),
            ...alerts,
          ].join(" · "),
        ],
        [t("status.pending"), pending.length > 0 ? pending.join(" · ") : t("common.none")],
      ]),
      ...(alerts.length > 0
        ? [textBlock(alerts.join(" · "), { color: "Attention", weight: "Bolder", spacing: "Small" })]
        : []),
    ],
    [
      openUrlAction(t("common.openProject"), `/projets/${encodeURIComponent(project.id)}`),
      openUrlAction(t("extension.documentsOf"), `/documents/${encodeURIComponent(project.id)}`),
      executeAction(t("common.refresh"), "refresh", { view: "status", projectId: project.id }),
    ],
  );
}

/** Choix d'un projet lorsque « état » est envoyé sans nom (boutons « état <projet> »). */
export function chooseProjectCard(i18n: BotI18n, projects: Project[], message?: string): AdaptiveCard {
  const { t } = i18n;
  const shown = projects.slice(0, MAX_LIST_ITEMS);
  const example = `${t("commands.status")} ${shown[0]?.name ?? t("common.project")}`;
  return adaptiveCard(
    [
      header(t("status.title")),
      ...(message ? [textBlock(safe(message, 300), { color: "Warning" })] : []),
      textBlock(projects.length > 0 ? t("status.choose", { example: safe(example, 160) }) : t("status.noProjects")),
      ...shown.map((project) => ({
        type: "Container",
        separator: true,
        selectAction: commandAction(project.name, `${t("commands.status")} ${project.name}`),
        items: [
          textBlock(safe(project.name, 150), { weight: "Bolder", color: "Accent" }),
          textBlock(`${i18n.phase(project.currentPhase)} · ${Math.round(project.progress)} %`, {
            isSubtle: true,
            size: "Small",
            spacing: "None",
          }),
        ],
      })),
      ...(projects.length > shown.length
        ? [textBlock(t("common.more", { count: projects.length - shown.length }), { isSubtle: true })]
        : []),
    ],
    [openUrlAction(t("common.openProjector"), "/")],
  );
}
