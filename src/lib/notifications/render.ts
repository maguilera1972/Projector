import { toIntlLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import type { Notification } from "@/types";

/** Traduit une notification dans la langue du destinataire (repli : texte figé). */
export function renderNotification(
  notification: Notification,
  locale: Locale,
): Notification {
  if (!notification.params) return notification;

  const t = getTranslator(locale);
  const params = { ...notification.params };

  if (typeof params.phase === "string") {
    params.phase = tDynamic(t, `enums.phase.${params.phase}`);
  }
  if (typeof params.amount === "number") {
    params.amount = params.amount.toLocaleString(toIntlLocale(locale));
  }
  if (typeof params.role === "string") {
    params.role = tDynamic(t, `enums.role.${params.role}`);
  }

  return {
    ...notification,
    title: tDynamic(t, `notifications.kinds.${notification.kind}.title`, params),
    message: tDynamic(t, `notifications.kinds.${notification.kind}.message`, params),
  };
}
