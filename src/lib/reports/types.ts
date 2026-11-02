import type { Locale } from "@/lib/i18n/config";

export const REPORT_TYPES = [
  "status",
  "budget",
  "decisions",
  "portfolio",
  "resources",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** Portée d'un rapport : un projet, un portfolio ou tous les projets accessibles. */
export type ReportScope =
  | { kind: "project"; projectId: string }
  | { kind: "portfolio"; portfolioId: string }
  | { kind: "all" };

export interface ReportParams {
  type: ReportType;
  scope: ReportScope;
  /** Période (AAAA-MM-JJ, bornes incluses) appliquée aux journaux et échéances. */
  from?: string;
  to?: string;
  locale: Locale;
}

/** Types de rapport limités à un projet unique. */
export const PROJECT_ONLY_REPORTS: ReportType[] = ["status", "budget"];

export function isReportType(value: unknown): value is ReportType {
  return typeof value === "string" && (REPORT_TYPES as readonly string[]).includes(value);
}

export type ReportTone = "green" | "orange" | "red" | "neutral" | "brand";

export interface ReportKpi {
  label: string;
  value: string;
  hint?: string;
  tone?: ReportTone;
}

export interface ReportProgressRow {
  label: string;
  /** 0–100 */
  value: number;
  /** Libellé affiché à droite de la barre (défaut : « value % »). */
  valueLabel?: string;
  detail?: string;
  tone?: ReportTone;
}

export interface ReportBarSeries {
  key: string;
  label: string;
  color: string;
}

export interface ReportBarRow {
  label: string;
  values: (number | null)[];
  detail?: string;
}

export interface ReportStackSegment {
  label: string;
  value: number;
  color: string;
}

export type ReportCell = string | { text: string; tone?: ReportTone; bold?: boolean };

export interface ReportTableColumn {
  label: string;
  align?: "left" | "right" | "center";
  /** Largeur relative (PDF et aperçu). */
  width?: number;
}

export interface ReportLineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  /** Une valeur par point de l'axe X (null = pas de valeur). */
  values: (number | null)[];
}

export interface ReportWeather {
  dimension: string;
  tone: ReportTone;
  label: string;
  reasons: string[];
}

export type ReportBlock =
  | { kind: "kpis"; items: ReportKpi[] }
  | { kind: "keyValues"; items: { label: string; value: string }[] }
  | { kind: "weather"; items: ReportWeather[] }
  | { kind: "progress"; rows: ReportProgressRow[] }
  | {
      kind: "bars";
      series: ReportBarSeries[];
      rows: ReportBarRow[];
      /** Formatage déjà appliqué côté serveur, par valeur. */
      formatted: (string | null)[][];
    }
  | { kind: "stack"; segments: ReportStackSegment[]; total: number; caption?: string }
  | {
      kind: "lineChart";
      /** Libellés de l'axe X (un par point). */
      labels: string[];
      series: ReportLineSeries[];
      /** Unité affichée sur l'axe Y (ex. « h »). */
      unit: string;
      /** Repère vertical (ex. aujourd'hui). */
      marker?: { index: number; label: string };
      /** Ligne horizontale de référence (ex. budget heures). */
      reference?: { value: number; label: string; color: string };
      caption?: string;
    }
  | { kind: "table"; columns: ReportTableColumn[]; rows: ReportCell[][]; empty?: string }
  | { kind: "alerts"; items: { tone: ReportTone; text: string }[] }
  | { kind: "paragraph"; text: string; muted?: boolean };

export interface ReportSection {
  title: string;
  description?: string;
  blocks: ReportBlock[];
}

export interface ReportDocument {
  type: ReportType;
  locale: Locale;
  title: string;
  subtitle: string;
  /** Nom du projet, du portfolio ou « Tous les projets ». */
  scopeLabel: string;
  periodLabel: string;
  generatedAt: string;
  generatedAtLabel: string;
  generatedBy: string;
  projectIds: string[];
  sections: ReportSection[];
  /** Libellés génériques (en-tête / pied de page PDF). */
  labels: {
    generatedOn: string;
    page: string;
    confidential: string;
    scope: string;
    period: string;
  };
}

export interface ReportRecipient {
  userId?: string;
  name: string;
  email: string;
  locale: Locale;
  roles: string[];
}
