import { DEFAULT_LOCALE, isLocale, normalizeLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic, type Translator } from "@/lib/i18n/translate";
import { createFormatter, todayIso, type ReportFormatter } from "@/lib/reports/format";
import { toneLabel } from "@/lib/reports/health";
import { getReportTranslator, rtDynamic, type ReportTranslator } from "@/lib/reports/i18n";
import type { ReportTone } from "@/lib/reports/types";
import type {
  BudgetRevisionStatus,
  BudgetStatus,
  HermesApproach,
  HermesPhaseId,
  PhaseValidationStatus,
  ProjectStatus,
  TaskStatus,
} from "@/types";

/** Libellés lisibles (langue donnée) des énumérations PROJECTOR, pour Copilot et le connecteur Graph. */
export interface LabelKit {
  locale: Locale;
  t: Translator;
  rt: ReportTranslator;
  fmt: ReportFormatter;
  today: string;
  projectStatus(status: ProjectStatus): string;
  taskStatus(status: TaskStatus): string;
  phase(phase: HermesPhaseId): string;
  approach(approach: HermesApproach): string;
  budgetStatus(status: BudgetStatus): string;
  validationStatus(status: PhaseValidationStatus): string;
  revisionStatus(status: BudgetRevisionStatus): string;
  tone(tone: ReportTone): string;
}

export function createLabelKit(locale: Locale = DEFAULT_LOCALE): LabelKit {
  const t = getTranslator(locale);
  const rt = getReportTranslator(locale);
  return {
    locale,
    t,
    rt,
    fmt: createFormatter(locale, rt("common.none")),
    today: todayIso(),
    projectStatus: (status) => tDynamic(t, `enums.projectStatus.${status}`),
    taskStatus: (status) => tDynamic(t, `enums.taskStatus.${status}`),
    phase: (phase) => tDynamic(t, `enums.phase.${phase}`),
    approach: (approach) => tDynamic(t, `enums.approach.${approach}`),
    budgetStatus: (status) => tDynamic(t, `enums.budgetStatus.${status}`),
    validationStatus: (status) => rtDynamic(rt, `decisions.valStatus.${status}`),
    revisionStatus: (status) => rtDynamic(rt, `budget.revStatus.${status}`),
    tone: (tone) => toneLabel(rt, tone),
  };
}

/** Langue demandée (`?locale=`), sinon langue de l'utilisateur, sinon français. */
export function resolveLocale(requested: string | null | undefined, userLocale?: string): Locale {
  if (isLocale(requested)) return requested;
  return normalizeLocale(userLocale);
}
