import { toIntlLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import type { Notification, NotificationParams } from "@/types";

/** Traduit les paramètres d'une notification (phase, rôle, montant) dans la langue cible. */
export function localizeNotificationParams(
  params: NotificationParams,
  locale: Locale,
): NotificationParams {
  const t = getTranslator(locale);
  const localized = { ...params };

  if (typeof localized.phase === "string") {
    localized.phase = tDynamic(t, `enums.phase.${localized.phase}`);
  }
  if (typeof localized.amount === "number") {
    localized.amount = localized.amount.toLocaleString(toIntlLocale(locale));
  }
  if (typeof localized.role === "string") {
    localized.role = tDynamic(t, `enums.role.${localized.role}`);
  }
  return localized;
}

/** Traduit une notification dans la langue du destinataire (repli : texte figé). */
export function renderNotification(
  notification: Notification,
  locale: Locale,
): Notification {
  if (!notification.params) return notification;

  const t = getTranslator(locale);
  const params = localizeNotificationParams(notification.params, locale);

  return {
    ...notification,
    title: tDynamic(t, `notifications.kinds.${notification.kind}.title`, params),
    message: tDynamic(t, `notifications.kinds.${notification.kind}.message`, params),
  };
}
