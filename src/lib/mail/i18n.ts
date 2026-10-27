import type { Locale } from "@/lib/i18n/config";
import { interpolate, type TranslationValues } from "@/lib/i18n/translate";
import type { NotificationKind } from "@/types";

/**
 * Textes propres aux e-mails (gabarit commun, libellés des blocs d'informations).
 * Les contenus métier (invitation, notifications) restent dans `email.*` / `notifications.*`
 * des dictionnaires principaux.
 */
const fr = {
  layout: {
    linkFallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    openPortal: "Ouvrir PROJECTOR",
    preferences: "Gérer mes préférences de notification",
    defaultReason:
      "Ce message a été envoyé automatiquement par PROJECTOR. Merci de ne pas y répondre directement.",
  },
  details: {
    project: "Projet",
    phase: "Phase",
    task: "Tâche",
    document: "Document",
    amount: "Montant",
    actor: "Auteur",
    account: "Compte",
    email: "E-mail",
    role: "Rôle",
    invitedBy: "Invité par",
    validUntil: "Valable jusqu'au",
    sender: "Expéditeur",
    sentAt: "Envoyé le",
    language: "Langue",
    portal: "Portail",
  },
  invitation: {
    title: "Invitation à rejoindre PROJECTOR",
    preheader: "{inviter} vous invite à rejoindre PROJECTOR. Lien valable jusqu'au {date}.",
    reason: "Vous recevez ce message car {inviter} vous a invité à rejoindre PROJECTOR.",
  },
  notification: {
    cta: {
      task_assigned: "Voir mes tâches",
      phase_submitted: "Examiner la demande",
      phase_approved: "Ouvrir le projet",
      phase_rejected: "Ouvrir le projet",
      budget_revision_requested: "Examiner la révision",
      budget_revision_approved: "Ouvrir le projet",
      budget_approval_required: "Valider le budget",
      document_pv_pending: "Ouvrir le dossier projet",
      invitation_accepted: "Voir l'administration",
      task_overdue: "Voir mes tâches",
      report_available: "Ouvrir les rapports",
    },
  },
  test: {
    title: "Test d'envoi réussi",
    intro: "Ce message confirme que PROJECTOR peut envoyer des e-mails avec la nouvelle mise en forme.",
    reason:
      "Vous recevez ce message car un test d'envoi a été lancé depuis l'administration de PROJECTOR.",
  },
} as const;

type DeepStringify<T> = {
  -readonly [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type MailMessages = DeepStringify<typeof fr>;

const en: MailMessages = {
  layout: {
    linkFallback: "If the button does not work, copy this link into your browser:",
    openPortal: "Open PROJECTOR",
    preferences: "Manage my notification preferences",
    defaultReason:
      "This message was sent automatically by PROJECTOR. Please do not reply to it directly.",
  },
  details: {
    project: "Project",
    phase: "Phase",
    task: "Task",
    document: "Document",
    amount: "Amount",
    actor: "By",
    account: "Account",
    email: "Email",
    role: "Role",
    invitedBy: "Invited by",
    validUntil: "Valid until",
    sender: "Sender",
    sentAt: "Sent on",
    language: "Language",
    portal: "Portal",
  },
  invitation: {
    title: "Invitation to join PROJECTOR",
    preheader: "{inviter} invites you to join PROJECTOR. Link valid until {date}.",
    reason: "You are receiving this message because {inviter} invited you to join PROJECTOR.",
  },
  notification: {
    cta: {
      task_assigned: "View my tasks",
      phase_submitted: "Review the request",
      phase_approved: "Open the project",
      phase_rejected: "Open the project",
      budget_revision_requested: "Review the revision",
      budget_revision_approved: "Open the project",
      budget_approval_required: "Approve the budget",
      document_pv_pending: "Open the project folder",
      invitation_accepted: "Open administration",
      task_overdue: "View my tasks",
      report_available: "Open reports",
    },
  },
  test: {
    title: "Test email delivered",
    intro: "This message confirms that PROJECTOR can send emails with the new layout.",
    reason:
      "You are receiving this message because a test email was triggered from the PROJECTOR administration.",
  },
};

const de: MailMessages = {
  layout: {
    linkFallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    openPortal: "PROJECTOR öffnen",
    preferences: "Benachrichtigungseinstellungen verwalten",
    defaultReason:
      "Diese Nachricht wurde automatisch von PROJECTOR versendet. Bitte antworten Sie nicht direkt darauf.",
  },
  details: {
    project: "Projekt",
    phase: "Phase",
    task: "Aufgabe",
    document: "Dokument",
    amount: "Betrag",
    actor: "Ausgelöst von",
    account: "Konto",
    email: "E-Mail",
    role: "Rolle",
    invitedBy: "Eingeladen von",
    validUntil: "Gültig bis",
    sender: "Absender",
    sentAt: "Gesendet am",
    language: "Sprache",
    portal: "Portal",
  },
  invitation: {
    title: "Einladung zu PROJECTOR",
    preheader: "{inviter} lädt Sie zu PROJECTOR ein. Der Link ist gültig bis {date}.",
    reason: "Sie erhalten diese Nachricht, weil {inviter} Sie zu PROJECTOR eingeladen hat.",
  },
  notification: {
    cta: {
      task_assigned: "Meine Aufgaben anzeigen",
      phase_submitted: "Anfrage prüfen",
      phase_approved: "Projekt öffnen",
      phase_rejected: "Projekt öffnen",
      budget_revision_requested: "Revision prüfen",
      budget_revision_approved: "Projekt öffnen",
      budget_approval_required: "Budget freigeben",
      document_pv_pending: "Projektdossier öffnen",
      invitation_accepted: "Administration öffnen",
      task_overdue: "Meine Aufgaben anzeigen",
      report_available: "Berichte öffnen",
    },
  },
  test: {
    title: "Testversand erfolgreich",
    intro: "Diese Nachricht bestätigt, dass PROJECTOR E-Mails im neuen Layout versenden kann.",
    reason:
      "Sie erhalten diese Nachricht, weil in der PROJECTOR-Administration ein Testversand ausgelöst wurde.",
  },
};

const it: MailMessages = {
  layout: {
    linkFallback: "Se il pulsante non funziona, copi questo link nel suo browser:",
    openPortal: "Apri PROJECTOR",
    preferences: "Gestisci le preferenze di notifica",
    defaultReason:
      "Questo messaggio è stato inviato automaticamente da PROJECTOR. La preghiamo di non rispondere direttamente.",
  },
  details: {
    project: "Progetto",
    phase: "Fase",
    task: "Attività",
    document: "Documento",
    amount: "Importo",
    actor: "Autore",
    account: "Account",
    email: "E-mail",
    role: "Ruolo",
    invitedBy: "Invitato da",
    validUntil: "Valido fino al",
    sender: "Mittente",
    sentAt: "Inviato il",
    language: "Lingua",
    portal: "Portale",
  },
  invitation: {
    title: "Invito a unirsi a PROJECTOR",
    preheader: "{inviter} la invita su PROJECTOR. Link valido fino al {date}.",
    reason: "Riceve questo messaggio perché {inviter} l'ha invitata a unirsi a PROJECTOR.",
  },
  notification: {
    cta: {
      task_assigned: "Vedi le mie attività",
      phase_submitted: "Esamina la richiesta",
      phase_approved: "Apri il progetto",
      phase_rejected: "Apri il progetto",
      budget_revision_requested: "Esamina la revisione",
      budget_revision_approved: "Apri il progetto",
      budget_approval_required: "Approva il budget",
      document_pv_pending: "Apri il dossier di progetto",
      invitation_accepted: "Apri l'amministrazione",
      task_overdue: "Vedi le mie attività",
      report_available: "Apri i report",
    },
  },
  test: {
    title: "Invio di prova riuscito",
    intro: "Questo messaggio conferma che PROJECTOR può inviare e-mail con la nuova impaginazione.",
    reason:
      "Riceve questo messaggio perché è stato avviato un invio di prova dall'amministrazione di PROJECTOR.",
  },
};

const es: MailMessages = {
  layout: {
    linkFallback: "Si el botón no funciona, copie este enlace en su navegador:",
    openPortal: "Abrir PROJECTOR",
    preferences: "Gestionar mis preferencias de notificación",
    defaultReason:
      "Este mensaje ha sido enviado automáticamente por PROJECTOR. Por favor, no responda directamente.",
  },
  details: {
    project: "Proyecto",
    phase: "Fase",
    task: "Tarea",
    document: "Documento",
    amount: "Importe",
    actor: "Autor",
    account: "Cuenta",
    email: "Correo",
    role: "Rol",
    invitedBy: "Invitado por",
    validUntil: "Válido hasta",
    sender: "Remitente",
    sentAt: "Enviado el",
    language: "Idioma",
    portal: "Portal",
  },
  invitation: {
    title: "Invitación a unirse a PROJECTOR",
    preheader: "{inviter} le invita a PROJECTOR. Enlace válido hasta el {date}.",
    reason: "Recibe este mensaje porque {inviter} le ha invitado a unirse a PROJECTOR.",
  },
  notification: {
    cta: {
      task_assigned: "Ver mis tareas",
      phase_submitted: "Revisar la solicitud",
      phase_approved: "Abrir el proyecto",
      phase_rejected: "Abrir el proyecto",
      budget_revision_requested: "Revisar la revisión",
      budget_revision_approved: "Abrir el proyecto",
      budget_approval_required: "Validar el presupuesto",
      document_pv_pending: "Abrir el expediente del proyecto",
      invitation_accepted: "Abrir la administración",
      task_overdue: "Ver mis tareas",
      report_available: "Abrir los informes",
    },
  },
  test: {
    title: "Envío de prueba correcto",
    intro: "Este mensaje confirma que PROJECTOR puede enviar correos con el nuevo diseño.",
    reason:
      "Recibe este mensaje porque se ha lanzado un envío de prueba desde la administración de PROJECTOR.",
  },
};

const MAIL_DICTIONARIES: Record<Locale, MailMessages> = { fr, en, it, es, de };

type MailPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${MailPaths<T[K]>}`;
}[keyof T & string];

export type MailMessageKey = MailPaths<MailMessages>;

export type MailTranslator = (key: MailMessageKey, values?: TranslationValues) => string;

function lookup(messages: MailMessages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function getMailTranslator(locale: Locale): MailTranslator {
  const messages = MAIL_DICTIONARIES[locale] ?? fr;
  return (key, values) =>
    interpolate(lookup(messages, key) ?? lookup(fr, key) ?? key, values);
}

export function notificationCtaKey(kind: NotificationKind): MailMessageKey {
  return `notification.cta.${kind}`;
}
