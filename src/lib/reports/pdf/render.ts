import type {
  ReportBlock,
  ReportCell,
  ReportDocument,
  ReportTone,
} from "../types";
import type { FontId } from "./fonts";
import { PAGE_HEIGHT, PAGE_WIDTH, PdfCanvas } from "./writer";

const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 58;
const CONTENT_TOP = HEADER_HEIGHT + 26;
const FOOTER_TOP = PAGE_HEIGHT - 34;
const CONTENT_BOTTOM = FOOTER_TOP - 14;

const C = {
  navy: "#1e293b",
  navyDark: "#0f172a",
  navyLight: "#334155",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  surface: "#f8fafc",
  track: "#e2e8f0",
  white: "#ffffff",
  cyan: "#7dd3fc",
};

const TONE: Record<ReportTone, { main: string; text: string; bg: string }> = {
  green: { main: "#10b981", text: "#047857", bg: "#ecfdf5" },
  orange: { main: "#f59e0b", text: "#b45309", bg: "#fffbeb" },
  red: { main: "#ef4444", text: "#b91c1c", bg: "#fef2f2" },
  neutral: { main: "#94a3b8", text: "#475569", bg: "#f1f5f9" },
  brand: { main: "#818cf8", text: "#4f46e5", bg: "#eef2ff" },
};

class ReportPdfRenderer {
  private canvas: PdfCanvas;
  private y = CONTENT_TOP;

  constructor(private readonly doc: ReportDocument) {
    this.canvas = new PdfCanvas();
  }

  render(): Buffer {
    this.newPage();
    this.titleBlock();
    for (const section of this.doc.sections) {
      this.sectionTitle(section.title, section.description);
      for (const block of section.blocks) {
        this.block(block);
        this.y += 10;
      }
      this.y += 8;
    }
    this.footers();
    return this.canvas.toBuffer({
      title: `${this.doc.title} — ${this.doc.scopeLabel}`,
      author: this.doc.generatedBy,
      lang: this.doc.locale,
    });
  }

  /* ---------------- pages ---------------- */

  private newPage(): void {
    this.canvas.addPage();
    const c = this.canvas;
    c.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, { fill: C.navyDark });
    c.gradientRect(0, HEADER_HEIGHT, PAGE_WIDTH, 3);
    c.brandLogo(MARGIN, 14, 0.62);
    const right = PAGE_WIDTH - MARGIN;
    const maxWidth = CONTENT_WIDTH - 215;
    c.text(c.fit(this.doc.title, maxWidth, "bold", 11), right - maxWidth, 27, {
      font: "bold",
      size: 11,
      color: C.white,
      align: "right",
      width: maxWidth,
    });
    c.text(c.fit(this.doc.scopeLabel, maxWidth, "regular", 8.5), right - maxWidth, 41, {
      size: 8.5,
      color: C.cyan,
      align: "right",
      width: maxWidth,
    });
    this.y = CONTENT_TOP;
  }

  private ensure(height: number): void {
    if (this.y + height > CONTENT_BOTTOM) this.newPage();
  }

  private footers(): void {
    const total = this.canvas.pageCount;
    for (let index = 0; index < total; index++) {
      this.canvas.line(MARGIN, FOOTER_TOP, PAGE_WIDTH - MARGIN, FOOTER_TOP, C.border, 0.6, index);
      const left = `${this.doc.labels.confidential} · ${this.doc.generatedAtLabel}`;
      this.canvas.text(this.canvas.fit(left, CONTENT_WIDTH - 90, "regular", 7), MARGIN, FOOTER_TOP + 13, { size: 7, color: C.muted }, index);
      const page = this.doc.labels.page.replace("{page}", String(index + 1)).replace("{total}", String(total));
      this.canvas.text(page, PAGE_WIDTH - MARGIN - 90, FOOTER_TOP + 13, {
        size: 7,
        color: C.muted,
        align: "right",
        width: 90,
      }, index);
    }
  }

  /* ---------------- titres ---------------- */

  private titleBlock(): void {
    const c = this.canvas;
    const titleLines = c.wrap(this.doc.title, CONTENT_WIDTH, "bold", 20);
    for (const line of titleLines) {
      c.text(line, MARGIN, this.y + 16, { font: "bold", size: 20, color: C.navy });
      this.y += 24;
    }
    for (const line of c.wrap(this.doc.subtitle, CONTENT_WIDTH, "regular", 11)) {
      c.text(line, MARGIN, this.y + 10, { size: 11, color: C.navyLight });
      this.y += 15;
    }
    this.y += 4;
    const colon = this.doc.locale === "fr" ? " : " : ": ";
    const meta = `${this.doc.labels.period}${colon}${this.doc.periodLabel}   ·   ${this.doc.generatedAtLabel}`;
    for (const line of c.wrap(meta, CONTENT_WIDTH, "regular", 8.5)) {
      c.text(line, MARGIN, this.y + 8, { size: 8.5, color: C.muted });
      this.y += 12;
    }
    this.y += 14;
  }

  private sectionTitle(title: string, description?: string): void {
    const c = this.canvas;
    this.ensure(60);
    c.gradientRect(MARGIN, this.y, 3.5, 15);
    c.text(c.fit(title, CONTENT_WIDTH - 12, "bold", 13), MARGIN + 10, this.y + 12, {
      font: "bold",
      size: 13,
      color: C.navy,
    });
    this.y += 20;
    if (description) {
      c.text(c.fit(description, CONTENT_WIDTH - 10, "regular", 8), MARGIN + 10, this.y + 6, { size: 8, color: C.muted });
      this.y += 12;
    }
    this.y += 4;
  }

  /* ---------------- blocs ---------------- */

  private block(block: ReportBlock): void {
    switch (block.kind) {
      case "kpis":
        return this.kpis(block.items);
      case "keyValues":
        return this.keyValues(block.items);
      case "weather":
        return this.weather(block.items);
      case "progress":
        return this.progress(block.rows);
      case "bars":
        return this.bars(block);
      case "stack":
        return this.stack(block);
      case "table":
        return this.table(block);
      case "alerts":
        return this.alerts(block.items);
      case "paragraph":
        return this.paragraph(block.text, block.muted);
    }
  }

  private kpis(items: Extract<ReportBlock, { kind: "kpis" }>["items"]): void {
    const c = this.canvas;
    const perRow = items.length === 4 ? 4 : 3;
    const gap = 8;
    const w = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
    const h = 54;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(h + gap);
      items.slice(i, i + perRow).forEach((item, index) => {
        const x = MARGIN + index * (w + gap);
        const tone = TONE[item.tone ?? "neutral"];
        c.rect(x, this.y, w, h, { fill: C.surface, stroke: C.border, radius: 6 });
        c.rect(x, this.y + 8, 3, h - 16, { fill: item.tone ? tone.main : C.border, radius: 1.5 });
        c.text(c.fit(item.label, w - 20, "regular", 7.5), x + 11, this.y + 15, { size: 7.5, color: C.muted });
        c.text(c.fit(item.value, w - 20, "bold", 14), x + 11, this.y + 34, {
          font: "bold",
          size: 14,
          color: item.tone ? tone.text : C.text,
        });
        if (item.hint) {
          c.text(c.fit(item.hint, w - 20, "regular", 7), x + 11, this.y + 46, { size: 7, color: C.muted });
        }
      });
      this.y += h + gap;
    }
    this.y -= gap;
  }

  private keyValues(items: { label: string; value: string }[]): void {
    const c = this.canvas;
    const colW = (CONTENT_WIDTH - 16) / 2;
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      const heights = pair.map((item) => c.wrap(item.value, colW, "bold", 9).length);
      const h = 12 + Math.max(...heights) * 11 + 4;
      this.ensure(h);
      pair.forEach((item, index) => {
        const x = MARGIN + index * (colW + 16);
        c.text(c.fit(item.label, colW, "regular", 7.5), x, this.y + 8, { size: 7.5, color: C.muted });
        c.wrap(item.value, colW, "bold", 9).forEach((line, lineIndex) => {
          c.text(line, x, this.y + 20 + lineIndex * 11, { font: "bold", size: 9, color: C.text });
        });
      });
      c.line(MARGIN, this.y + h, MARGIN + CONTENT_WIDTH, this.y + h, C.border, 0.4);
      this.y += h + 4;
    }
  }

  private weather(items: Extract<ReportBlock, { kind: "weather" }>["items"]): void {
    const c = this.canvas;
    const gap = 8;
    const w = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
    const reasonLines = items.map((item) =>
      item.reasons.flatMap((reason) => c.wrap(`• ${reason}`, w - 18, "regular", 7)),
    );
    const h = 44 + Math.max(0, ...reasonLines.map((lines) => lines.length)) * 9 + 6;
    this.ensure(h);
    items.forEach((item, index) => {
      const x = MARGIN + index * (w + gap);
      const tone = TONE[item.tone];
      c.rect(x, this.y, w, h, { fill: tone.bg, stroke: C.border, radius: 6 });
      c.circle(x + 17, this.y + 18, 7, tone.main);
      c.text(c.fit(item.dimension, w - 36, "bold", 8.5), x + 30, this.y + 15, { font: "bold", size: 8.5, color: C.text });
      c.text(c.fit(item.label, w - 36, "bold", 8), x + 30, this.y + 26, { font: "bold", size: 8, color: tone.text });
      reasonLines[index]!.forEach((line, lineIndex) => {
        c.text(line, x + 9, this.y + 44 + lineIndex * 9, { size: 7, color: C.navyLight });
      });
    });
    this.y += h;
  }

  private progress(rows: Extract<ReportBlock, { kind: "progress" }>["rows"]): void {
    const c = this.canvas;
    const labelW = 175;
    const valueW = 38;
    const barX = MARGIN + labelW + 8;
    const barW = CONTENT_WIDTH - labelW - valueW - 16;
    for (const row of rows) {
      const h = row.detail ? 26 : 18;
      this.ensure(h);
      const tone = TONE[row.tone ?? "brand"];
      c.text(c.fit(row.label, labelW, "bold", 8.5), MARGIN, this.y + 9, { font: "bold", size: 8.5, color: C.text });
      if (row.detail) {
        c.text(c.fit(row.detail, labelW, "regular", 7), MARGIN, this.y + 19, { size: 7, color: C.muted });
      }
      const barTop = this.y + (row.detail ? 7 : 4);
      c.rect(barX, barTop, barW, 8, { fill: C.track, radius: 4 });
      const value = Math.max(0, Math.min(100, row.value));
      if (value > 0) {
        const fillW = Math.max(8, (barW * value) / 100);
        if (row.tone === "brand" || !row.tone) c.gradientRect(barX, barTop, fillW, 8);
        else c.rect(barX, barTop, fillW, 8, { fill: tone.main, radius: 4 });
      }
      c.text(row.valueLabel ?? `${Math.round(value)} %`, barX + barW + 8, barTop + 7, {
        font: "bold",
        size: 8.5,
        color: C.text,
        align: "right",
        width: valueW,
      });
      this.y += h + 4;
    }
  }

  private legend(entries: { label: string; color: string; suffix?: string }[]): void {
    const c = this.canvas;
    let x = MARGIN;
    this.ensure(14);
    for (const entry of entries) {
      const text = entry.suffix ? `${entry.label} ${entry.suffix}` : entry.label;
      const width = c.measure(text, "regular", 7.5) + 22;
      if (x + width > MARGIN + CONTENT_WIDTH) {
        x = MARGIN;
        this.y += 12;
        this.ensure(14);
      }
      c.rect(x, this.y + 2, 8, 8, { fill: entry.color, radius: 2 });
      c.text(text, x + 12, this.y + 9, { size: 7.5, color: C.navyLight });
      x += width;
    }
    this.y += 16;
  }

  private bars(block: Extract<ReportBlock, { kind: "bars" }>): void {
    const c = this.canvas;
    this.legend(block.series.map((series) => ({ label: series.label, color: series.color })));
    const max = Math.max(1, ...block.rows.flatMap((row) => row.values.map((value) => value ?? 0)));
    const labelW = 150;
    const valueW = 82;
    const barX = MARGIN + labelW + 8;
    const barW = CONTENT_WIDTH - labelW - valueW - 16;
    block.rows.forEach((row, rowIndex) => {
      const h = block.series.length * 11 + 8;
      this.ensure(h);
      c.text(c.fit(row.label, labelW, "bold", 8.5), MARGIN, this.y + 9, { font: "bold", size: 8.5, color: C.text });
      block.series.forEach((series, index) => {
        const value = row.values[index];
        const top = this.y + index * 11 + 2;
        c.rect(barX, top, barW, 7, { fill: C.surface, radius: 3 });
        if (value !== null && value !== undefined && value > 0) {
          c.rect(barX, top, Math.max(4, (barW * value) / max), 7, { fill: series.color, radius: 3 });
        }
        const formatted = block.formatted[rowIndex]?.[index] ?? "—";
        c.text(formatted, barX + barW + 8, top + 6.5, {
          size: 7.5,
          color: C.navyLight,
          align: "right",
          width: valueW,
        });
      });
      this.y += h;
    });
  }

  private stack(block: Extract<ReportBlock, { kind: "stack" }>): void {
    const c = this.canvas;
    this.ensure(46);
    const h = 16;
    c.rect(MARGIN, this.y, CONTENT_WIDTH, h, { fill: C.track, radius: 5 });
    if (block.total > 0) {
      let x = MARGIN;
      for (const segment of block.segments) {
        if (segment.value <= 0) continue;
        const w = (CONTENT_WIDTH * segment.value) / block.total;
        c.rect(x, this.y, w, h, { fill: segment.color });
        if (w > 18) {
          c.text(String(segment.value), x, this.y + 11.5, {
            font: "bold",
            size: 8,
            color: C.white,
            align: "center",
            width: w,
          });
        }
        x += w;
      }
    }
    this.y += h + 8;
    this.legend(
      block.segments.map((segment) => ({
        label: segment.label,
        color: segment.color,
        suffix: `${segment.value}${block.total > 0 ? ` (${Math.round((segment.value / block.total) * 100)} %)` : ""}`,
      })),
    );
    if (block.caption) {
      c.text(block.caption, MARGIN, this.y + 4, { size: 7.5, color: C.muted });
      this.y += 10;
    }
  }

  private cellText(value: ReportCell): { text: string; tone?: ReportTone; bold?: boolean } {
    return typeof value === "string" ? { text: value } : value;
  }

  private table(block: Extract<ReportBlock, { kind: "table" }>): void {
    const c = this.canvas;
    const totalWeight = block.columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
    const widths = block.columns.map((column) => (CONTENT_WIDTH * (column.width ?? 1)) / totalWeight);
    const pad = 5;
    const size = 7.8;
    const lineH = 9.5;

    const header = () => {
      const headerLines = block.columns.map((column, index) => {
        const width = widths[index]! - pad * 2;
        const splitsWord = column.label
          .split(/\s+/)
          .some((word) => c.measure(word, "bold", 7.5) > width);
        return splitsWord
          ? [c.fit(column.label, width, "bold", 7.5)]
          : c.wrap(column.label, width, "bold", 7.5).slice(0, 2);
      });
      const h = 8 + Math.max(...headerLines.map((lines) => lines.length)) * 9;
      this.ensure(h + 20);
      c.rect(MARGIN, this.y, CONTENT_WIDTH, h, { fill: C.navyLight, radius: 3 });
      let x = MARGIN;
      block.columns.forEach((column, index) => {
        headerLines[index]!.forEach((line, lineIndex) => {
          c.text(line, x + pad, this.y + 11 + lineIndex * 9, {
            font: "bold",
            size: 7.5,
            color: C.white,
            align: column.align,
            width: widths[index]! - pad * 2,
          });
        });
        x += widths[index]!;
      });
      this.y += h;
    };

    header();
    if (block.rows.length === 0) {
      this.ensure(22);
      c.rect(MARGIN, this.y, CONTENT_WIDTH, 20, { fill: C.surface });
      c.text(block.empty ?? "—", MARGIN + pad, this.y + 13, { size: 8, color: C.muted });
      this.y += 20;
      return;
    }

    block.rows.forEach((row, rowIndex) => {
      const cells = row.map((value) => this.cellText(value));
      const lines = cells.map((value, index) => {
        const font: FontId = value.bold || value.tone ? "bold" : "regular";
        return c.wrap(value.text, widths[index]! - pad * 2, font, size).slice(0, 6);
      });
      const h = 7 + Math.max(...lines.map((cellLines) => cellLines.length)) * lineH;
      if (this.y + h > CONTENT_BOTTOM) {
        this.newPage();
        header();
      }
      if (rowIndex % 2 === 1) c.rect(MARGIN, this.y, CONTENT_WIDTH, h, { fill: C.surface });
      let x = MARGIN;
      cells.forEach((value, index) => {
        const column = block.columns[index];
        const tone = value.tone ? TONE[value.tone] : null;
        const font: FontId = value.bold || value.tone ? "bold" : "regular";
        const dotted = Boolean(tone) && value.tone !== "brand";
        if (dotted) {
          const dotX =
            column?.align === "right"
              ? x + widths[index]! - pad - c.measure(lines[index]![0] ?? "", font, size) - 6
              : x + pad + 2.5;
          c.circle(dotX, this.y + 8.6, 2.5, tone!.main);
        }
        const offset = dotted && column?.align !== "right" ? 8 : 0;
        lines[index]!.forEach((line, lineIndex) => {
          c.text(line, x + pad + offset, this.y + 11 + lineIndex * lineH, {
            font,
            size,
            color: tone ? tone.text : C.text,
            align: column?.align,
            width: widths[index]! - pad * 2 - offset,
          });
        });
        x += widths[index]!;
      });
      c.line(MARGIN, this.y + h, MARGIN + CONTENT_WIDTH, this.y + h, C.border, 0.4);
      this.y += h;
    });
  }

  private alerts(items: { tone: ReportTone; text: string }[]): void {
    const c = this.canvas;
    for (const item of items) {
      const tone = TONE[item.tone];
      const lines = c.wrap(item.text, CONTENT_WIDTH - 26, "regular", 8.5);
      const h = 10 + lines.length * 11;
      this.ensure(h + 4);
      c.rect(MARGIN, this.y, CONTENT_WIDTH, h, { fill: tone.bg, radius: 5 });
      c.rect(MARGIN, this.y, 3.5, h, { fill: tone.main, radius: 1.5 });
      lines.forEach((line, index) => {
        c.text(line, MARGIN + 14, this.y + 13 + index * 11, { size: 8.5, color: tone.text });
      });
      this.y += h + 5;
    }
  }

  private paragraph(text: string, muted?: boolean): void {
    const c = this.canvas;
    for (const line of c.wrap(text, CONTENT_WIDTH, "regular", 8.5)) {
      this.ensure(12);
      c.text(line, MARGIN, this.y + 9, { size: 8.5, color: muted ? C.muted : C.text });
      this.y += 12;
    }
  }
}

export function renderReportPdf(doc: ReportDocument): Buffer {
  return new ReportPdfRenderer(doc).render();
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 50) || "rapport"
  );
}

export function buildReportPdfFilename(doc: ReportDocument): string {
  return `projector-${slugify(doc.title)}-${slugify(doc.scopeLabel)}-${doc.generatedAt.slice(0, 10)}.pdf`;
}
