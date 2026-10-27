import type { HermesPhaseId, Project, Task } from "@/types";
import {
  adaptiveCard,
  factSet,
  header,
  isOverdue,
  openUrlAction,
  safe,
  textBlock,
  weatherColor,
  type CardWeatherTone,
} from "./cards";
import type { BotI18n } from "./i18n";
import type { AdaptiveCard, Attachment } from "./types";

/**
 * Cartes partagées dans les conversations : résultats de l'extension de messagerie, aperçus de liens
 * et messages proactifs dans les canaux de projet. Contenu volontairement limité (lisible par tous les membres).
 */

export interface ThumbnailPreview {
  title: string;
  text?: string;
}

/** Les cartes miniatures interprètent un sous-ensemble XML/HTML : on échappe les chevrons et esperluettes. */
function xmlSafe(value: string, max = 200): string {
  const text = value.length > max ? `${value.slice(0, max - 1)}…` : value;
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Élément de résultat d'extension de messagerie (carte adaptative + aperçu miniature). */
export function extensionAttachment(card: AdaptiveCard, preview: ThumbnailPreview): Attachment & {
  preview: Attachment;
} {
  return {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: card,
    preview: {
      contentType: "application/vnd.microsoft.card.thumbnail",
      content: { title: xmlSafe(preview.title), ...(preview.text ? { text: xmlSafe(preview.text, 300) } : {}) },
    },
  };
}

const projectPath = (project: Project) => `/projets/${encodeURIComponent(project.id)}`;

export function projectSummaryCard(i18n: BotI18n, project: Project): AdaptiveCard {
  const { t } = i18n;
  return adaptiveCard(
    [
      header(safe(project.name, 150), t("extension.project")),
      ...(project.description ? [textBlock(safe(project.description, 300), { isSubtle: true, maxLines: 3 })] : []),
      factSet([
        [t("common.phase"), i18n.phase(project.currentPhase)],
        [t("common.status"), i18n.projectStatus(project.status)],
        [t("common.progress"), `${Math.round(project.progress)} %`],
        [t("status.chef"), safe(project.chefDeProjet, 120)],
        [t("status.mandant"), safe(project.mandant, 120)],
      ]),
    ],
    [openUrlAction(t("common.openProject"), projectPath(project))],
  );
}

export function projectPreview(i18n: BotI18n, project: Project): ThumbnailPreview {
  return {
    title: project.name,
    text: `${i18n.t("extension.project")} · ${i18n.phase(project.currentPhase)} · ${Math.round(project.progress)} %`,
  };
}

export function taskSummaryCard(i18n: BotI18n, task: Task, project: Project, today: string): AdaptiveCard {
  const { t } = i18n;
  const overdue = isOverdue(task, today);
  return adaptiveCard(
    [
      header(safe(task.title, 200), t("extension.task")),
      factSet([
        [t("common.project"), safe(project.name, 150)],
        [t("common.phase"), i18n.phase(task.phase)],
        [t("common.status"), `${i18n.taskStatus(task.status)} · ${task.progress} %`],
        [
          t("common.dueDate"),
          `${task.dueDate ? i18n.date(task.dueDate) : t("common.noDueDate")}${overdue ? ` — ${t("common.overdue")}` : ""}`,
        ],
      ]),
    ],
    [openUrlAction(t("common.openProject"), projectPath(project)), openUrlAction(t("extension.tasksPage"), "/taches")],
  );
}

export function taskPreview(i18n: BotI18n, task: Task, project: Project): ThumbnailPreview {
  const due = task.dueDate ? ` · ${i18n.date(task.dueDate)}` : "";
  return { title: task.title, text: `${i18n.t("extension.task")} · ${project.name}${due}` };
}

export interface DocumentSummary {
  kind: "annex" | "deliverable";
  id: string;
  title: string;
  project: Project;
  phase?: HermesPhaseId;
  version?: number;
  date?: string;
}

export function documentSummaryCard(i18n: BotI18n, doc: DocumentSummary): AdaptiveCard {
  const { t } = i18n;
  const kind = doc.kind === "annex" ? t("extension.annex") : t("extension.deliverable");
  return adaptiveCard(
    [
      header(safe(doc.title, 200), kind),
      factSet([
        [t("common.project"), safe(doc.project.name, 150)],
        [t("common.phase"), doc.phase ? i18n.phase(doc.phase) : ""],
        [t("extension.version", { version: doc.version ?? 1 }), doc.date ? t("extension.updated", { date: i18n.date(doc.date) }) : ""],
      ]),
    ],
    [openUrlAction(t("common.open"), `/documents/${encodeURIComponent(doc.project.id)}`)],
  );
}

export function documentPreview(i18n: BotI18n, doc: DocumentSummary): ThumbnailPreview {
  const kind = doc.kind === "annex" ? i18n.t("extension.annex") : i18n.t("extension.deliverable");
  return { title: doc.title, text: `${kind} · ${doc.project.name}` };
}

/** Carte PROJECTOR générique (lien non reconnu ou non visible : aucune donnée exposée). */
export function genericProjectorCard(i18n: BotI18n, path = "/"): AdaptiveCard {
  return adaptiveCard(
    [header("PROJECTOR", i18n.t("common.tagline"))],
    [openUrlAction(i18n.t("common.openProjector"), path)],
  );
}

export function genericPreview(i18n: BotI18n): ThumbnailPreview {
  return { title: "PROJECTOR", text: i18n.t("common.tagline") };
}

// ─── Messages proactifs (canaux de projet) ─────────────────────────────────

export function phaseChangeCard(
  i18n: BotI18n,
  project: Project,
  info: { fromPhase: HermesPhaseId; toPhase?: HermesPhaseId; actorName: string },
): AdaptiveCard {
  const { t } = i18n;
  const name = safe(project.name, 150);
  return adaptiveCard(
    [
      header(t("proactive.phaseTitle"), name),
      textBlock(
        info.toPhase && info.toPhase !== info.fromPhase
          ? t("proactive.phaseText", { project: name, to: i18n.phase(info.toPhase) })
          : t("proactive.phaseClosedText", { project: name, from: i18n.phase(info.fromPhase) }),
        { weight: "Bolder" },
      ),
      factSet([
        [t("proactive.phaseFrom"), i18n.phase(info.fromPhase)],
        [t("proactive.phaseTo"), info.toPhase && info.toPhase !== info.fromPhase ? i18n.phase(info.toPhase) : ""],
        [t("proactive.approvedBy"), safe(info.actorName, 120)],
        [t("common.progress"), `${Math.round(project.progress)} %`],
      ]),
    ],
    [openUrlAction(t("common.openProject"), projectPath(project))],
  );
}

function reasonsBlock(i18n: BotI18n, reasons: string[]): Record<string, unknown>[] {
  if (reasons.length === 0) return [];
  return [
    textBlock(i18n.t("proactive.reasons"), { weight: "Bolder", spacing: "Medium" }),
    textBlock(reasons.slice(0, 8).map((reason) => `- ${safe(reason, 200).replace(/\n/g, " ")}`).join("\n"), {
      spacing: "Small",
    }),
  ];
}

export function weatherAlertCard(i18n: BotI18n, project: Project, reasons: string[]): AdaptiveCard {
  const { t } = i18n;
  const name = safe(project.name, 150);
  return adaptiveCard(
    [
      {
        type: "Container",
        style: "attention",
        bleed: true,
        items: [header(t("proactive.weatherTitle"), name)],
      },
      textBlock(t("proactive.weatherText", { project: name }), { weight: "Bolder", color: "Attention" }),
      ...reasonsBlock(i18n, reasons),
      factSet([
        [t("common.phase"), i18n.phase(project.currentPhase)],
        [t("common.progress"), `${Math.round(project.progress)} %`],
        [t("status.chef"), safe(project.chefDeProjet, 120)],
      ]),
    ],
    [openUrlAction(t("common.openProject"), projectPath(project))],
  );
}

export function weeklySummaryCard(
  i18n: BotI18n,
  input: { project: Project; tasks: Task[]; weather: CardWeatherTone; reasons: string[] },
  today: string,
): AdaptiveCard {
  const { t } = i18n;
  const { project, tasks, weather } = input;
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const open = tasks.filter((task) => task.status !== "termine");
  const overdue = open.filter((task) => isOverdue(task, today));
  const completedWeek = tasks.filter(
    (task) => task.status === "termine" && task.completedAt && task.completedAt.slice(0, 10) >= weekAgo,
  );
  const nextDue = open
    .filter((task) => task.dueDate && !isOverdue(task, today))
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 3);
  const name = safe(project.name, 150);
  return adaptiveCard(
    [
      header(t("proactive.weeklyTitle"), `${name} · ${t("proactive.weeklyWeek", { date: i18n.date(today) })}`),
      textBlock(`${t("status.weather")} : ${t(`weather.${weather}`)}`, {
        weight: "Bolder",
        color: weatherColor(weather),
      }),
      factSet([
        [t("common.phase"), i18n.phase(project.currentPhase)],
        [t("common.progress"), `${Math.round(project.progress)} %`],
        [t("proactive.openTasks"), String(open.length)],
        [t("common.overdue"), String(overdue.length)],
        [t("proactive.completedWeek"), String(completedWeek.length)],
      ]),
      ...reasonsBlock(i18n, input.reasons),
      ...(nextDue.length > 0
        ? [
            textBlock(t("proactive.nextDue"), { weight: "Bolder", spacing: "Medium" }),
            factSet(nextDue.map((task) => [i18n.date(task.dueDate), safe(task.title, 150)])),
          ]
        : []),
    ],
    [openUrlAction(t("common.openProject"), projectPath(project))],
  );
}
