import type { Locale } from "@/lib/i18n/config";
import { renderEmail, type RenderedEmail } from "@/lib/mail/layout";
import { buildInvitationEmail, buildNotificationEmail, buildTestEmail } from "@/lib/mail/templates";
import { renderNotification } from "@/lib/notifications/render";
import type { InvitationSummary, Notification, NotificationKind, NotificationParams } from "@/types";

/** Données fictives pour prévisualiser les e-mails (aucun envoi). */
const NOTIFICATION_SAMPLES: Record<
  NotificationKind,
  { params: NotificationParams; href: string; projectId?: string }
> = {
  task_assigned: {
    params: { taskTitle: "Rédiger le cahier des charges", projectName: "Refonte du portail <RH>" },
    href: "/taches",
    projectId: "demo-project",
  },
  phase_submitted: {
    params: { actorName: "Claire Martin", phase: "conception", projectName: "Refonte du portail <RH>" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  phase_approved: {
    params: { actorName: "Paul Keller", phase: "initialisation", projectName: "Migration ERP" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  phase_rejected: {
    params: { actorName: "Paul Keller", phase: "realisation", projectName: "Migration ERP" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  budget_revision_requested: {
    params: { actorName: "Claire Martin", amount: 185000, projectName: "Migration ERP" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  budget_revision_approved: {
    params: { actorName: "Paul Keller", amount: 185000, projectName: "Migration ERP" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  budget_approval_required: {
    params: { projectName: "Migration ERP" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  document_pv_pending: {
    params: { documentTitle: "PV séance de pilotage n° 4", projectName: "Migration ERP" },
    href: "/projets/demo-project",
    projectId: "demo-project",
  },
  invitation_accepted: {
    params: { name: "Lena Huber", email: "lena.huber@example.com", role: "guest" },
    href: "/parametres/administration",
  },
};

export const EMAIL_PREVIEW_TYPES = [
  "invitation",
  "test",
  "generic",
  ...(Object.keys(NOTIFICATION_SAMPLES) as NotificationKind[]),
] as const;

export type EmailPreviewType = (typeof EMAIL_PREVIEW_TYPES)[number];

export function isEmailPreviewType(value: unknown): value is EmailPreviewType {
  return typeof value === "string" && (EMAIL_PREVIEW_TYPES as readonly string[]).includes(value);
}

function sampleInvitation(locale: Locale): InvitationSummary {
  const now = Date.now();
  return {
    id: "preview",
    email: "lena.huber@example.com",
    name: "Lena Huber",
    role: "guest",
    permissions: [],
    locale,
    message:
      "Bonjour Lena,\nmerci de rejoindre le projet <Migration ERP> & de relire les livrables.\n<script>alert('xss')</script>",
    invitedBy: "preview-admin",
    invitedByName: "Michel Aguilera",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    status: "pending",
  };
}

export function renderEmailPreview(type: EmailPreviewType, locale: Locale): RenderedEmail {
  if (type === "invitation") return buildInvitationEmail(sampleInvitation(locale), "preview-token");
  if (type === "test") return buildTestEmail(locale);
  if (type === "generic") {
    return renderEmail({
      locale,
      title: "Rapport d'avancement — Migration ERP",
      preheader: "Exemple de gabarit générique (rapport, rappel…).",
      greeting: "Bonjour Lena,",
      intro: "Claire Martin vous transmet le rapport d'avancement mensuel.",
      paragraphs: ["Le PDF est joint à ce message. Ce gabarit montre tous les blocs disponibles."],
      quote: { label: "Commentaire :", text: "Merci de valider avant vendredi <b>svp</b>." },
      details: [
        { label: "Projet", value: "Migration ERP", url: "/projets/demo-project" },
        { label: "Phase", value: "Conception" },
        { label: "Échéance", value: "15 novembre 2026" },
      ],
      cta: { label: "Ouvrir le rapport", url: "/rapports" },
      notes: ["Ce lien nécessite une connexion à PROJECTOR."],
    });
  }

  const sample = NOTIFICATION_SAMPLES[type];
  const notification: Notification = {
    id: "preview",
    userId: "preview",
    kind: type,
    title: type,
    message: type,
    params: sample.params,
    href: sample.href,
    projectId: sample.projectId,
    createdAt: new Date().toISOString(),
  };
  return buildNotificationEmail(renderNotification(notification, locale), "Lena Huber", locale);
}
