"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/client";
import { getTimeTranslator, timeErrorMessage } from "@/lib/time-tracking/i18n";
import { formatDuration } from "@/lib/time-tracking/duration";
import { toIntlLocale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/utils";

export function useTimeI18n() {
  const { locale } = useI18n();
  return useMemo(() => {
    const tt = getTimeTranslator(locale);
    const numberFmt = new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 1 });
    return {
      locale,
      tt,
      date: (iso: string) => formatDate(iso, locale),
      duration: formatDuration,
      hours: (value: number) => `${numberFmt.format(value)} h`,
      colon: locale === "fr" ? " : " : ": ",
      dateTime: (iso: string) =>
        new Date(iso).toLocaleString(toIntlLocale(locale), { dateStyle: "short", timeStyle: "short" }),
      errorMessage: (payload: { code?: string; error?: string } | null | undefined) =>
        timeErrorMessage(tt, payload),
    };
  }, [locale]);
}

export type TimeI18n = ReturnType<typeof useTimeI18n>;
