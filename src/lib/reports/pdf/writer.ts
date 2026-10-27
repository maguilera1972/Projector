import { deflateSync } from "zlib";
import { measureText, pdfLiteral, toRuns, type FontId } from "./fonts";

/**
 * Petit moteur PDF 1.4 vectoriel sans dépendance (même approche que `lib/documents/pdf.ts`,
 * enrichi : couleurs, formes, dégradé et logo vectoriel de la marque, polices WinAnsi accentuées).
 * Coordonnées exprimées depuis le coin supérieur gauche, en points (A4 = 595 × 842).
 */

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export interface TextOptions {
  font?: FontId;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  /** Largeur de la zone pour l'alignement centre / droite. */
  width?: number;
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function rgb(hex: string): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

const BRAND_SHADING_FUNCTION =
  "<< /FunctionType 3 /Domain [0 1] /Bounds [0.5] /Encode [0 1 0 1] /Functions [ << /FunctionType 2 /Domain [0 1] /N 1 /C0 [0.490 0.827 0.988] /C1 [0.506 0.549 0.973] >> << /FunctionType 2 /Domain [0 1] /N 1 /C0 [0.506 0.549 0.973] /C1 [0.659 0.333 0.969] >> ] >>";

export class PdfCanvas {
  private pages: string[][] = [];
  /** Étendue horizontale (espace page) du dégradé utilisé pour peindre le logo. */
  private logoGradient: [number, number] | null = null;

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): number {
    this.pages.push([]);
    return this.pages.length - 1;
  }

  private ops(pageIndex?: number): string[] {
    const index = pageIndex ?? this.pages.length - 1;
    if (index < 0) throw new Error("Aucune page PDF.");
    return this.pages[index]!;
  }

  private y(top: number, height = 0): number {
    return PAGE_HEIGHT - top - height;
  }

  rect(
    x: number,
    top: number,
    w: number,
    h: number,
    style: { fill?: string; stroke?: string; lineWidth?: number; radius?: number },
    pageIndex?: number,
  ): void {
    const ops = this.ops(pageIndex);
    const parts: string[] = ["q"];
    if (style.fill) parts.push(`${rgb(style.fill)} rg`);
    if (style.stroke) parts.push(`${rgb(style.stroke)} RG ${n(style.lineWidth ?? 0.5)} w`);
    const r = Math.min(style.radius ?? 0, w / 2, h / 2);
    const bottom = this.y(top, h);
    if (r > 0) {
      const k = r * 0.5523;
      const x1 = x + w;
      const y1 = bottom + h;
      parts.push(
        `${n(x + r)} ${n(bottom)} m`,
        `${n(x1 - r)} ${n(bottom)} l`,
        `${n(x1 - r + k)} ${n(bottom)} ${n(x1)} ${n(bottom + r - k)} ${n(x1)} ${n(bottom + r)} c`,
        `${n(x1)} ${n(y1 - r)} l`,
        `${n(x1)} ${n(y1 - r + k)} ${n(x1 - r + k)} ${n(y1)} ${n(x1 - r)} ${n(y1)} c`,
        `${n(x + r)} ${n(y1)} l`,
        `${n(x + r - k)} ${n(y1)} ${n(x)} ${n(y1 - r + k)} ${n(x)} ${n(y1 - r)} c`,
        `${n(x)} ${n(bottom + r)} l`,
        `${n(x)} ${n(bottom + r - k)} ${n(x + r - k)} ${n(bottom)} ${n(x + r)} ${n(bottom)} c`,
        "h",
      );
    } else {
      parts.push(`${n(x)} ${n(bottom)} ${n(w)} ${n(h)} re`);
    }
    parts.push(style.fill && style.stroke ? "B" : style.fill ? "f" : "S", "Q");
    ops.push(parts.join("\n"));
  }

  circle(cx: number, cy: number, r: number, fill: string, pageIndex?: number): void {
    const k = r * 0.5523;
    const y = this.y(cy);
    this.ops(pageIndex).push(
      [
        "q",
        `${rgb(fill)} rg`,
        `${n(cx + r)} ${n(y)} m`,
        `${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c`,
        `${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c`,
        `${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c`,
        `${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c`,
        "f",
        "Q",
      ].join("\n"),
    );
  }

  line(x1: number, top1: number, x2: number, top2: number, color: string, width = 0.5, pageIndex?: number): void {
    this.ops(pageIndex).push(
      `q ${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(this.y(top1))} m ${n(x2)} ${n(this.y(top2))} l S Q`,
    );
  }

  /** Rectangle rempli avec le dégradé de la marque (cyan → indigo → violet). */
  gradientRect(x: number, top: number, w: number, h: number, pageIndex?: number): void {
    const bottom = this.y(top, h);
    this.ops(pageIndex).push(
      `q ${n(x)} ${n(bottom)} ${n(w)} ${n(h)} re W n ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(bottom)} cm /Sh1 sh Q`,
    );
  }

  private circlePath(cx: number, cy: number, r: number): string {
    const k = r * 0.5523;
    return [
      `${n(cx + r)} ${n(cy)} m`,
      `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
      `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
      `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
      `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
    ].join(" ");
  }

  /**
   * Logo PROJECTOR vectoriel (reprise de `reference-data/brand/projector-logo.svg`, viewBox 320 × 48) :
   * anneaux en pointillés, connexions et texte peints avec le dégradé de la marque.
   * Doit être dessiné au même emplacement sur chaque page (le dégradé est défini en espace page).
   */
  brandLogo(x: number, top: number, scale: number, pageIndex?: number): { width: number; height: number } {
    const width = 320 * scale;
    this.logoGradient = [x, x + width];
    const cx = x + 24 * scale;
    const cy = this.y(top + 24 * scale);
    const s = (value: number) => n(value * scale);
    const ring = (r: number, lineWidth: number, dash: number[]) =>
      `${n(lineWidth * scale)} w [${dash.map(s).join(" ")}] 0 d ${this.circlePath(cx, cy, r * scale)} S`;
    const spoke = (x1: number, y1: number, x2: number, y2: number) =>
      `${n(cx + x1 * scale)} ${n(cy - y1 * scale)} m ${n(cx + x2 * scale)} ${n(cy - y2 * scale)} l S`;
    const fontSize = 22 * scale;
    const text = pdfLiteral(toRuns("PROJECTOR")[0]!.codes);
    this.ops(pageIndex).push(
      [
        "q",
        "/Pattern CS /PBrand SCN /Pattern cs /PBrand scn 1 J",
        ring(20, 2.2, [26, 8, 18, 6, 22, 10]),
        ring(15, 1.8, [20, 6, 14, 5, 18, 8]),
        ring(10, 1.4, [14, 5, 10, 4, 12, 6]),
        `[] 0 d ${n(2 * scale)} w`,
        spoke(0, -20, 0, -12),
        spoke(20, 0, 12, 0),
        spoke(0, 20, 0, 12),
        spoke(-20, 0, -12, 0),
        `${this.circlePath(cx, cy, 4.5 * scale)} f`,
        `BT /F2 ${n(fontSize)} Tf ${n(3 * scale)} Tc ${n(x + 58 * scale)} ${n(this.y(top + 32 * scale))} Td ${text} Tj ET`,
        "Q",
      ].join("\n"),
    );
    return { width, height: 48 * scale };
  }

  measure(text: string, font: FontId = "regular", size = 9): number {
    return measureText(text, font, size);
  }

  /** Tronque le texte avec « … » pour tenir dans la largeur. */
  fit(text: string, maxWidth: number, font: FontId = "regular", size = 9): string {
    if (this.measure(text, font, size) <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && this.measure(`${out}…`, font, size) > maxWidth) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
  }

  wrap(text: string, maxWidth: number, font: FontId = "regular", size = 9): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split(/\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (this.measure(candidate, font, size) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) lines.push(current);
        if (this.measure(word, font, size) <= maxWidth) {
          current = word;
        } else {
          let chunk = "";
          for (const char of word) {
            if (this.measure(chunk + char, font, size) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk += char;
            }
          }
          current = chunk;
        }
      }
      lines.push(current);
    }
    return lines.length > 0 ? lines : [""];
  }

  /** Écrit une ligne de texte ; `top` = ligne de base mesurée depuis le haut de la page. */
  text(text: string, x: number, baseline: number, options: TextOptions = {}, pageIndex?: number): void {
    const font = options.font ?? "regular";
    const size = options.size ?? 9;
    let left = x;
    if (options.align && options.align !== "left" && options.width !== undefined) {
      const width = this.measure(text, font, size);
      left = options.align === "right" ? x + options.width - width : x + (options.width - width) / 2;
    }
    const fontName = font === "bold" ? "F2" : "F1";
    const parts = ["BT", `${rgb(options.color ?? "#0f172a")} rg`, `${n(left)} ${n(this.y(baseline))} Td`];
    for (const run of toRuns(text)) {
      parts.push(`/${run.symbol ? "F3" : fontName} ${n(size)} Tf ${pdfLiteral(run.codes)} Tj`);
    }
    parts.push("ET");
    this.ops(pageIndex).push(parts.join("\n"));
  }

  toBuffer(meta: { title: string; author?: string; lang?: string }): Buffer {
    const objects: (string | Buffer)[] = [];
    const reserve = (): number => {
      objects.push("");
      return objects.length;
    };
    const set = (num: number, value: string | Buffer) => {
      objects[num - 1] = value;
    };

    const catalog = reserve();
    const pagesRoot = reserve();
    const fontRegular = reserve();
    const fontBold = reserve();
    const fontSymbol = reserve();
    const shading = reserve();
    const info = reserve();
    const pattern = reserve();

    set(fontRegular, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    set(fontBold, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    set(fontSymbol, "<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>");
    set(
      shading,
      `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 1 0] /Extend [true true] /Function ${BRAND_SHADING_FUNCTION} >>`,
    );
    const [gx0, gx1] = this.logoGradient ?? [0, PAGE_WIDTH];
    set(
      pattern,
      `<< /Type /Pattern /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${n(gx0)} 0 ${n(gx1)} 0] /Extend [true true] /Function ${BRAND_SHADING_FUNCTION} >> >>`,
    );

    const resources = `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontSymbol} 0 R >> /Shading << /Sh1 ${shading} 0 R >> /Pattern << /PBrand ${pattern} 0 R >> >>`;

    const pageNums: number[] = [];
    for (const ops of this.pages) {
      const content = deflateSync(Buffer.from(ops.join("\n"), "latin1"));
      const contentObj = reserve();
      set(
        contentObj,
        Buffer.concat([
          Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
          content,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
      const pageObj = reserve();
      set(
        pageObj,
        `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${n(PAGE_WIDTH)} ${n(PAGE_HEIGHT)}] /Contents ${contentObj} 0 R /Resources ${resources} >>`,
      );
      pageNums.push(pageObj);
    }

    set(pagesRoot, `<< /Type /Pages /Kids [${pageNums.map((num) => `${num} 0 R`).join(" ")}] /Count ${pageNums.length} >>`);
    set(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R${meta.lang ? ` /Lang ${pdfLiteral(toRuns(meta.lang)[0]?.codes ?? [])}` : ""} >>`);
    const infoString = (value: string) => pdfLiteral(toRuns(value).flatMap((run) => run.codes));
    const now = new Date();
    const pdfDate = `D:${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
    set(
      info,
      `<< /Title ${infoString(meta.title)} /Producer (PROJECTOR) /Creator (PROJECTOR Rapports)${meta.author ? ` /Author ${infoString(meta.author)}` : ""} /CreationDate (${pdfDate}) >>`,
    );

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets: number[] = [];
    let length = chunks[0]!.length;
    objects.forEach((object, index) => {
      offsets.push(length);
      const body = typeof object === "string" ? Buffer.from(object, "latin1") : object;
      const chunk = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
        body,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
      chunks.push(chunk);
      length += chunk.length;
    });

    const xref = [
      "xref",
      `0 ${objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
      "trailer",
      `<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>`,
      "startxref",
      String(length),
      "%%EOF",
    ].join("\n");
    chunks.push(Buffer.from(`${xref}\n`, "latin1"));
    return Buffer.concat(chunks);
  }
}
