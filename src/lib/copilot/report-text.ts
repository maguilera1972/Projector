import type { ReportBlock, ReportCell, ReportDocument } from "@/lib/reports/types";

/** Conversion d'un rapport PROJECTOR en Markdown compact (Copilot, Microsoft Search). */

function cellText(cell: ReportCell): string {
  const text = typeof cell === "string" ? cell : cell.text;
  return text.replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim() || "—";
}

function blockToMarkdown(block: ReportBlock): string[] {
  switch (block.kind) {
    case "kpis":
      return block.items.map(
        (item) => `- **${item.label}** : ${item.value}${item.hint ? ` (${item.hint})` : ""}`,
      );
    case "keyValues":
      return block.items.map((item) => `- **${item.label}** : ${item.value}`);
    case "weather":
      return block.items.map(
        (item) =>
          `- **${item.dimension}** : ${item.label}${item.reasons.length > 0 ? ` — ${item.reasons.join(" ; ")}` : ""}`,
      );
    case "progress":
      return block.rows.map(
        (row) =>
          `- ${row.label} : ${row.valueLabel ?? `${Math.round(row.value)} %`}${row.detail ? ` (${row.detail})` : ""}`,
      );
    case "bars":
      return block.rows.map((row, rowIndex) => {
        const values = block.series
          .map((series, index) => {
            const formatted = block.formatted[rowIndex]?.[index];
            return formatted ? `${series.label} ${formatted}` : null;
          })
          .filter(Boolean);
        return `- ${row.label} : ${values.join(" · ")}${row.detail ? ` (${row.detail})` : ""}`;
      });
    case "stack":
      return [
        ...block.segments.map((segment) => `- ${segment.label} : ${segment.value}`),
        ...(block.caption ? [block.caption] : []),
      ];
    case "table": {
      if (block.rows.length === 0) return block.empty ? [block.empty] : [];
      const header = block.columns.map((column) => cellText(column.label));
      return [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...block.rows.map((row) => `| ${row.map(cellText).join(" | ")} |`),
      ];
    }
    case "alerts":
      return block.items.map((item) => `- ⚠ ${item.text}`);
    case "paragraph":
      return [block.text];
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

export interface ReportMarkdownOptions {
  /** Inclure la ligne « généré le … » (exclue de l'index pour garder une empreinte stable). */
  includeGeneratedAt?: boolean;
  url?: string;
}

export function reportToMarkdown(document: ReportDocument, options: ReportMarkdownOptions = {}): string {
  const lines: string[] = [`# ${document.title} — ${document.scopeLabel}`];
  if (document.subtitle && document.subtitle !== document.scopeLabel) lines.push(document.subtitle);
  lines.push(`${document.labels.period} : ${document.periodLabel}`);
  if (options.includeGeneratedAt !== false) lines.push(document.generatedAtLabel);
  if (options.url) lines.push(options.url);
  for (const section of document.sections) {
    lines.push("", `## ${section.title}`);
    if (section.description) lines.push(section.description);
    for (const block of section.blocks) {
      const blockLines = blockToMarkdown(block);
      if (blockLines.length > 0) lines.push("", ...blockLines);
    }
  }
  return lines.join("\n").trim();
}
