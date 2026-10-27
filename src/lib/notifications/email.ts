import { isUserActive, type DbUser } from "@/lib/auth/permissions";
import { normalizeLocale } from "@/lib/i18n/config";
import { isMailConfigured, sendMail } from "@/lib/mail/graph";
import { buildNotificationEmail } from "@/lib/mail/templates";
import { drainPendingNotificationEmails } from "@/lib/notifications/dispatch";
import { renderNotification } from "@/lib/notifications/render";

/**
 * Envoie (en arrière-plan) les notifications créées depuis le dernier enregistrement
 * aux destinataires ayant activé les e-mails. N'interrompt jamais la requête appelante.
 */
export function flushNotificationEmails(users: DbUser[]): void {
  const pending = drainPendingNotificationEmails();
  if (pending.length === 0 || !isMailConfigured()) return;

  const byId = new Map(users.map((user) => [user.id, user]));

  for (const notification of pending) {
    const recipient = byId.get(notification.userId);
    if (!recipient || !isUserActive(recipient)) continue;
    if (recipient.emailNotifications === false) continue;

    const locale = normalizeLocale(recipient.locale);
    const rendered = renderNotification(notification, locale);
    const { subject, html, text } = buildNotificationEmail(rendered, recipient.name, locale);

    void sendMail({ to: recipient.email, subject, html, text }).then((result) => {
      if (!result.ok) {
        console.warn(
          `[mail] Notification ${notification.kind} non envoyée à ${recipient.email} : ${result.error}`,
        );
      }
    });
  }
}
