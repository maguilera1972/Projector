import { createHash } from "node:crypto";
import { listActivities, listProjects, listTasks, listUsers } from "@/lib/db/store";
import { localizeTask } from "@/lib/hermes/i18n";
import { normalizeLocale } from "@/lib/i18n/config";
import { absoluteUrl } from "@/lib/integrations/config";
import { buildReport } from "@/lib/reports/builders";
import type { BudgetRevision, PhaseValidation } from "@/types";
import { createAclContext, projectAcl, type ExternalAclEntry } from "./acl";
import {
  lastModifiedOf,
  loadProjectInsights,
  nextMilestones,
  overdueTasks,
  personName,
  projectReportsUrl,
  projectUrl,
  type InsightDataset,
  type ProjectInsight,
} from "./insights";
import { createLabelKit, type LabelKit } from "./labels";
import { reportToMarkdown } from "./report-text";
import { toGraphDateTime, type ConnectorItemProperties } from "./schema";

/** Éléments externes indexés par le connecteur (texte brut, français par défaut). */

export interface ExternalItemPayload {
  id: string;
  acl: ExternalAclEntry[];
  properties: ConnectorItemProperties;
  content: { type: "text"; value: string };
}

export interface ConnectorItemsBuild {
  items: ExternalItemPayload[];
  /** Éléments non indexés (motif), p. ex. ACL vide sans groupe de repli. */
  skipped: string[];
}

const MAX_CONTENT_CHARS = 200_000;
const ICON_PATH = "/brand/projector-logo-email.png";

export function itemHash(item: ExternalItemPayload): string {
  return createHash("sha256")
    .update(JSON.stringify({ acl: item.acl, properties: item.properties, content: item.content }))
    .digest("hex");
}

interface BuildContext {
  kit: LabelKit;
  insights: InsightDataset;
}

function name(ctx: BuildContext, id: string | undefined, designated?: string): string {
  return personName(ctx.insights.userById, id, designated) || designated?.trim() || id || "";
}

function clean(lines: (string | false | undefined | null)[]): string {
  return lines
    .filter((line): line is string => typeof line === "string")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

function baseProperties(ctx: BuildContext, insight: ProjectInsight): Omit<ConnectorItemProperties, "title" | "itemType" | "url" | "lastModified"> {
  const { project, portfolio } = insight.data;
  const { kit } = ctx;
  return {
    projectId: project.id,
    projectName: project.name,
    projectUrl: projectUrl(project.id),
    phase: kit.phase(project.currentPhase),
    approach: kit.approach(project.approach),
    weather: kit.tone(insight.health.overall),
    chef: name(ctx, project.chefDeProjetId, project.chefDeProjet) || undefined,
    mandant: name(ctx, project.mandantUserId, project.mandant) || undefined,
    portfolio: portfolio?.name,
    iconUrl: absoluteUrl(ICON_PATH),
  };
}

function weatherLines(ctx: BuildContext, insight: ProjectInsight): string[] {
  const { kit } = ctx;
  const { health } = insight;
  return [
    `Météo globale : ${kit.tone(health.overall)}`,
    `- ${kit.rt("weather.schedule")} : ${kit.tone(health.schedule.tone)} — ${health.schedule.reasons.join(" ; ")}`,
    `- ${kit.rt("weather.budget")} : ${kit.tone(health.budget.tone)} — ${health.budget.reasons.join(" ; ")}`,
    `- ${kit.rt("weather.decisions")} : ${kit.tone(health.decisions.tone)} — ${health.decisions.reasons.join(" ; ")}`,
  ];
}

function projectItem(ctx: BuildContext, insight: ProjectInsight, acl: ExternalAclEntry[]): ExternalItemPayload {
  const { kit } = ctx;
  const { project, tasks, validations, revisions, portfolio } = insight.data;
  const open = tasks.filter((task) => task.status !== "termine");
  const done = tasks.length - open.length;
  const overdue = overdueTasks(tasks, kit.today);
  const blocked = open.filter((task) => task.status === "bloque");
  const pendingGate = validations.find((validation) => validation.status === "submitted");
  const pendingRevisions = revisions.filter((revision) => revision.status === "pending_mandant");
  const milestones = nextMilestones(insight.data, kit);
  const url = projectUrl(project.id);
  const chef = name(ctx, project.chefDeProjetId, project.chefDeProjet);
  const mandant = name(ctx, project.mandantUserId, project.mandant);
  const taskLocale = normalizeLocale(project.documentLocale);

  const content = clean([
    `Projet PROJECTOR (HERMES 5.1) : ${project.name}`,
    `Identifiant : ${project.id}`,
    `Statut : ${kit.projectStatus(project.status)} · Phase actuelle : ${kit.phase(project.currentPhase)} · Approche : ${kit.approach(project.approach)}`,
    `Avancement : ${Math.round(project.progress)} %`,
    `Chef de projet : ${chef || "non désigné"} · Mandant : ${mandant || "non désigné"}`,
    portfolio && `Portfolio : ${portfolio.name}`,
    `Dates : ${kit.fmt.date(project.startDate)} → ${kit.fmt.date(project.endDate)}`,
    `Budget : ${kit.fmt.chf(project.budget)} (${kit.budgetStatus(project.budgetStatus)})${project.budgetHours ? ` · forfait ${project.budgetHours} h` : ""}`,
    "",
    ...weatherLines(ctx, insight),
    "",
    `Tâches : ${done} / ${tasks.length} terminées · ${open.length} ouvertes · ${overdue.length} en retard · ${blocked.length} bloquées`,
    ...(overdue.length > 0
      ? [
          "Tâches en retard :",
          ...overdue
            .slice(0, 15)
            .map(
              (task) =>
                `- ${localizeTask(task, taskLocale).title} (échéance ${kit.fmt.date(task.dueDate)}, ${kit.taskStatus(task.status)}${task.assigneeId ? `, ${name(ctx, task.assigneeId)}` : ""})`,
            ),
        ]
      : []),
    ...(blocked.length > 0
      ? ["Tâches bloquées :", ...blocked.slice(0, 10).map((task) => `- ${localizeTask(task, taskLocale).title}`)]
      : []),
    "",
    "Décisions en attente :",
    pendingGate
      ? `- Validation de phase ${kit.phase(pendingGate.fromPhase)} → ${kit.phase(pendingGate.toPhase)} soumise le ${kit.fmt.date(pendingGate.submittedAt)}, en attente du mandant`
      : undefined,
    ...pendingRevisions.map(
      (revision) =>
        `- Révision budgétaire à ${kit.fmt.chf(revision.amountCHF)} demandée le ${kit.fmt.date(revision.requestedAt)}${revision.reason ? ` (${revision.reason})` : ""}`,
    ),
    !pendingGate && pendingRevisions.length === 0 ? "- Aucune" : undefined,
    ...(milestones.length > 0
      ? [
          "",
          "Prochaines échéances :",
          ...milestones.map((milestone) => `- ${milestone.label}${milestone.date ? ` : ${kit.fmt.date(milestone.date)}` : ""}`),
        ]
      : []),
    ...(project.description?.trim() ? ["", "Description :", project.description.trim()] : []),
    "",
    `Lien : ${url}`,
    `Rapport de statut : ${projectReportsUrl(project.id)}`,
  ]);

  return {
    id: `project-${project.id}`,
    acl,
    content: { type: "text", value: content },
    properties: {
      ...baseProperties(ctx, insight),
      title: project.name,
      itemType: "project",
      status: kit.projectStatus(project.status),
      progress: Math.round(project.progress),
      startDate: toGraphDateTime(project.startDate),
      endDate: toGraphDateTime(project.endDate),
      budget: project.budget,
      summary: (project.description?.trim() || `${kit.projectStatus(project.status)} · ${kit.phase(project.currentPhase)} · ${Math.round(project.progress)} %`).slice(0, 1000),
      url,
      createdBy: name(ctx, project.createdBy) || undefined,
      createdDateTime: toGraphDateTime(project.createdAt),
      lastModified: lastModifiedOf(insight.data),
    },
  };
}

function decisionItem(
  ctx: BuildContext,
  insight: ProjectInsight,
  validation: PhaseValidation,
  acl: ExternalAclEntry[],
): ExternalItemPayload {
  const { kit } = ctx;
  const { project } = insight.data;
  const passage = `${kit.phase(validation.fromPhase)} → ${kit.phase(validation.toPhase)}`;
  const status = kit.validationStatus(validation.status);
  const checklist = validation.checklistSnapshot ?? [];
  const ok = checklist.filter((item) => item.status === "ok").length;
  const notOk = checklist.filter((item) => item.status !== "ok");
  const title = `Décision de phase ${passage} — ${project.name} (${status})`;

  const content = clean([
    `Décision de phase (quality gate HERMES) du projet ${project.name}`,
    `Passage : ${passage}`,
    `Statut : ${status}`,
    `Mode : ${validation.mode === "session" ? `en séance${validation.sessionDate ? ` du ${kit.fmt.date(validation.sessionDate)}` : ""}` : "en ligne"}`,
    `Soumise par ${name(ctx, validation.submittedBy)} le ${kit.fmt.date(validation.submittedAt)}`,
    validation.submitComment?.trim() && `Commentaire de soumission : ${validation.submitComment.trim()}`,
    checklist.length > 0 && `Checklist : ${ok} / ${checklist.length} critères remplis`,
    ...notOk.map((item) => `- ${item.label} : ${item.status === "blocked" ? "bloquant" : "en attente"}${item.detail ? ` (${item.detail})` : ""}`),
    validation.status === "approved" &&
      `Approuvée par ${name(ctx, validation.approvedBy)} le ${kit.fmt.date(validation.approvedAt)}${validation.signatureText ? ` — signature : ${validation.signatureText}` : ""}`,
    validation.status === "rejected" &&
      `Refusée par ${name(ctx, validation.rejectedBy)} le ${kit.fmt.date(validation.rejectedAt)}${validation.rejectionComment ? ` — motif : ${validation.rejectionComment}` : ""}`,
    validation.status === "submitted" && "En attente de la décision du mandant.",
    `Lien : ${projectUrl(project.id)}`,
  ]);

  return {
    id: `decision-${validation.id}`,
    acl,
    content: { type: "text", value: content },
    properties: {
      ...baseProperties(ctx, insight),
      title,
      itemType: "decision",
      status,
      phase: kit.phase(validation.fromPhase),
      summary: `${passage} · ${status}${validation.rejectionComment ? ` · ${validation.rejectionComment}` : ""}`.slice(0, 1000),
      url: projectUrl(project.id),
      createdBy: name(ctx, validation.submittedBy) || undefined,
      createdDateTime: toGraphDateTime(validation.submittedAt),
      lastModified:
        toGraphDateTime(validation.approvedAt ?? validation.rejectedAt ?? validation.submittedAt) ??
        new Date(0).toISOString(),
    },
  };
}

function budgetItem(
  ctx: BuildContext,
  insight: ProjectInsight,
  revision: BudgetRevision,
  acl: ExternalAclEntry[],
): ExternalItemPayload {
  const { kit } = ctx;
  const { project } = insight.data;
  const status = kit.revisionStatus(revision.status);
  const title = `Révision budgétaire ${kit.fmt.chf(revision.amountCHF)} — ${project.name} (${status})`;

  const content = clean([
    `Révision budgétaire du projet ${project.name}`,
    `Montant demandé : ${kit.fmt.chf(revision.amountCHF)}`,
    revision.hoursForfait !== undefined && `Forfait heures : ${revision.hoursForfait} h`,
    `Budget actuel du projet : ${kit.fmt.chf(project.budget)} (${kit.budgetStatus(project.budgetStatus)})`,
    revision.reason?.trim() && `Motif : ${revision.reason.trim()}`,
    `Statut : ${status}`,
    `Demandée par ${name(ctx, revision.requestedBy)} le ${kit.fmt.date(revision.requestedAt)}`,
    revision.status === "approved" &&
      `Approuvée par ${name(ctx, revision.approvedBy)} le ${kit.fmt.date(revision.approvedAt)}${revision.signatureText ? ` — signature : ${revision.signatureText}` : ""}`,
    revision.status === "rejected" && revision.rejectionComment && `Motif du refus : ${revision.rejectionComment}`,
    revision.status === "pending_mandant" && "En attente de la décision du mandant.",
    `Lien : ${projectUrl(project.id)}`,
  ]);

  return {
    id: `budget-${revision.id}`,
    acl,
    content: { type: "text", value: content },
    properties: {
      ...baseProperties(ctx, insight),
      title,
      itemType: "budgetRevision",
      status,
      budget: revision.amountCHF,
      summary: `${kit.fmt.chf(revision.amountCHF)} · ${status}${revision.reason ? ` · ${revision.reason}` : ""}`.slice(0, 1000),
      url: projectUrl(project.id),
      createdBy: name(ctx, revision.requestedBy) || undefined,
      createdDateTime: toGraphDateTime(revision.requestedAt),
      lastModified: toGraphDateTime(revision.approvedAt ?? revision.requestedAt) ?? new Date(0).toISOString(),
    },
  };
}

function reportItem(ctx: BuildContext, insight: ProjectInsight, acl: ExternalAclEntry[]): ExternalItemPayload {
  const { kit, insights } = ctx;
  const { project, portfolio } = insight.data;
  const reportUrl = projectReportsUrl(project.id);
  const document = buildReport({
    params: { type: "status", scope: { kind: "project", projectId: project.id }, locale: kit.locale },
    dataset: {
      projects: [insight.data],
      users: insights.dataset.users,
      resourceProfiles: insights.dataset.resourceProfiles,
    },
    portfolio,
    generatedBy: "PROJECTOR",
  });

  return {
    id: `report-${project.id}`,
    acl,
    content: {
      type: "text",
      value: clean([reportToMarkdown(document, { includeGeneratedAt: false, url: reportUrl })]),
    },
    properties: {
      ...baseProperties(ctx, insight),
      title: `${document.title} — ${project.name}`,
      itemType: "report",
      status: kit.projectStatus(project.status),
      progress: Math.round(project.progress),
      summary: `${document.title} · ${kit.tone(insight.health.overall)} · ${Math.round(project.progress)} %`,
      url: reportUrl,
      createdBy: "PROJECTOR",
      lastModified: lastModifiedOf(insight.data),
    },
  };
}

/** Construit tous les éléments à indexer (projets, décisions de phase, révisions budgétaires, rapports). */
export async function buildConnectorItems(): Promise<ConnectorItemsBuild> {
  const kit = createLabelKit("fr");
  const [projects, users, tasks, activities] = await Promise.all([
    listProjects(),
    listUsers(),
    listTasks(),
    listActivities(),
  ]);
  const insights = await loadProjectInsights(projects, kit);
  const aclContext = createAclContext(users, insights.portfolios, tasks, activities);
  const ctx: BuildContext = { kit, insights };

  const items: ExternalItemPayload[] = [];
  const skipped: string[] = [];
  for (const project of projects) {
    const insight = insights.byProjectId.get(project.id);
    if (!insight) continue;
    const acl = projectAcl(aclContext, project);
    if (acl.length === 0) {
      skipped.push(`project-${project.id} (« ${project.name} ») : aucun destinataire autorisé (ACL vide, pas de groupe de repli).`);
      continue;
    }
    items.push(projectItem(ctx, insight, acl));
    for (const validation of insight.data.validations) items.push(decisionItem(ctx, insight, validation, acl));
    for (const revision of insight.data.revisions) items.push(budgetItem(ctx, insight, revision, acl));
    try {
      items.push(reportItem(ctx, insight, acl));
    } catch (error) {
      skipped.push(`report-${project.id} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { items, skipped };
}
