import { getPublicUrl } from "@/lib/env";
import { LOCALE_NATIVE_NAMES, toIntlLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import { getMailSender } from "@/lib/mail/graph";
import { getMailTranslator, notificationCtaKey } from "@/lib/mail/i18n";
import { absoluteUrl, renderEmail, type EmailDetail, type RenderedEmail } from "@/lib/mail/layout";
import { localizeNotificationParams } from "@/lib/notifications/render";
import type { InvitationSummary, Notification } from "@/types";

const TIME_ZONE = "Europe/Zurich";

export function buildInvitationEmail(
  invitation: InvitationSummary,
  token: string,
): RenderedEmail {
  const locale = invitation.locale;
  const t = getTranslator(locale);
  const tm = getMailTranslator(locale);
  const role = tDynamic(t, `enums.role.${invitation.role}`);
  const link = absoluteUrl(`/invitation/${encodeURIComponent(token)}`);
  const expires = new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "long",
    timeZone: TIME_ZONE,
  }).format(new Date(invitation.expiresAt));
  const inviter = invitation.invitedByName;

  return renderEmail({
    locale,
    subject: t("email.invitation.subject", { inviter }),
    title: tm("invitation.title"),
    preheader: tm("invitation.preheader", { inviter, date: expires }),
    greeting: invitation.name
      ? t("email.greetingName", { name: invitation.name })
      : t("email.greeting"),
    intro: t("email.invitation.body", { inviter, role }),
    quote: invitation.message?.trim()
      ? { label: t("email.invitation.personalMessage"), text: invitation.message }
      : undefined,
    details: [
      { label: tm("details.invitedBy"), value: inviter },
      { label: tm("details.role"), value: role },
      { label: tm("details.email"), value: invitation.email },
      { label: tm("details.validUntil"), value: expires },
    ],
    cta: { label: t("email.invitation.cta"), url: link },
    notes: [t("email.invitation.ignore")],
    footerNote: tm("invitation.reason", { inviter }),
    preferencesLink: false,
  });
}

/** Lignes « clé / valeur » d'une notification à partir de ses paramètres traduits. */
function notificationDetails(notification: Notification, locale: Locale): EmailDetail[] {
  if (!notification.params) return [];
  const tm = getMailTranslator(locale);
  const params = localizeNotificationParams(notification.params, locale);
  const text = (value: string | number | undefined) =>
    value === undefined ? "" : String(value);
  const details: EmailDetail[] = [];

  if (params.projectName !== undefined) {
    details.push({
      label: tm("details.project"),
      value: text(params.projectName),
      url: notification.projectId
        ? `/projets/${encodeURIComponent(notification.projectId)}`
        : undefined,
    });
  }
  if (params.phase !== undefined) details.push({ label: tm("details.phase"), value: text(params.phase) });
  if (params.taskTitle !== undefined) {
    details.push({ label: tm("details.task"), value: text(params.taskTitle) });
  }
  if (params.documentTitle !== undefined) {
    details.push({ label: tm("details.document"), value: text(params.documentTitle) });
  }
  const amount = notification.params.amount;
  if (typeof amount === "number") {
    details.push({
      label: tm("details.amount"),
      value: new Intl.NumberFormat(toIntlLocale(locale), {
        style: "currency",
        currency: "CHF",
        maximumFractionDigits: 0,
      }).format(amount),
    });
  }
  if (params.actorName !== undefined) {
    details.push({ label: tm("details.actor"), value: text(params.actorName) });
  }
  if (params.name !== undefined) details.push({ label: tm("details.account"), value: text(params.name) });
  if (params.email !== undefined) details.push({ label: tm("details.email"), value: text(params.email) });
  if (params.role !== undefined) details.push({ label: tm("details.role"), value: text(params.role) });
  return details;
}

/** `notification` doit déjà être traduite (`renderNotification`) dans `locale`. */
export function buildNotificationEmail(
  notification: Notification,
  recipientName: string,
  locale: Locale,
): RenderedEmail {
  const t = getTranslator(locale);
  const tm = getMailTranslator(locale);

  return renderEmail({
    locale,
    subject: t("email.notification.subject", { title: notification.title }),
    title: notification.title,
    preheader: notification.message,
    greeting: t("email.greetingName", { name: recipientName }),
    intro: notification.message,
    details: notificationDetails(notification, locale),
    cta: notification.href
      ? {
          label: notification.params
            ? tm(notificationCtaKey(notification.kind))
            : t("email.notification.cta"),
          url: notification.href,
        }
      : undefined,
    footerNote: t("email.notification.reason"),
  });
}

export function buildTestEmail(locale: Locale): RenderedEmail {
  const t = getTranslator(locale);
  const tm = getMailTranslator(locale);
  const portal = `${getPublicUrl().replace(/\/$/, "")}/`;
  const sentAt = new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date());

  return renderEmail({
    locale,
    subject: t("email.test.subject"),
    title: tm("test.title"),
    intro: t("email.test.body"),
    paragraphs: [tm("test.intro")],
    details: [
      { label: tm("details.sender"), value: getMailSender() ?? "—" },
      { label: tm("details.sentAt"), value: sentAt },
      { label: tm("details.language"), value: LOCALE_NATIVE_NAMES[locale] },
      { label: tm("details.portal"), value: portal, url: portal },
    ],
    cta: { label: tm("layout.openPortal"), url: portal },
    ctaLinkFallback: false,
    footerNote: tm("test.reason"),
  });
}
