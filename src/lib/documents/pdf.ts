/** Générateur PDF texte (PDF 1.4) — sans dépendance externe, pagination multi-pages. */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 50;
const START_Y = 800;
const LINE_HEIGHT = 14;
const BOTTOM_MARGIN = 50;
const MAX_LINE_WIDTH = 90;
const LINES_PER_PAGE = Math.floor((START_Y - BOTTOM_MARGIN) / LINE_HEIGHT);

export interface PdfDocumentSection {
  title: string;
  contentMarkdown: string;
}

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x00-\x7F]/g, "?");
}

function wrapLine(line: string, maxLen = MAX_LINE_WIDTH): string[] {
  if (line.length <= maxLen) return [line];
  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen) {
      if (current) lines.push(current);
      current = word.length > maxLen ? word.slice(0, maxLen) : word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function markdownToDisplayLines(
  title: string,
  markdown: string,
): string[] {
  const rawLines = markdown.split("\n");
  const displayLines: string[] = [title, ""];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      displayLines.push("");
      continue;
    }
    if (trimmed.startsWith("# ")) {
      displayLines.push("", trimmed.slice(2).toUpperCase(), "");
      continue;
    }
    if (trimmed.startsWith("## ")) {
      displayLines.push("", trimmed.slice(3), "");
      continue;
    }
    if (trimmed.startsWith("---")) {
      displayLines.push("----------------------------------------");
      continue;
    }
    const plain = trimmed
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^-\s+/, "• ");
    for (const wrapped of wrapLine(plain)) {
      displayLines.push(wrapped);
    }
  }

  return displayLines;
}

function chunkLines(lines: string[]): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) {
    pages.push([" "]);
  }
  return pages;
}

function buildPageStream(lines: string[]): string {
  const streamParts = ["BT", "/F1 10 Tf", `${LINE_HEIGHT} TL`];
  let first = true;

  for (const line of lines) {
    const escaped = escapePdfText(line || " ");
    if (first) {
      streamParts.push(`${MARGIN_LEFT} ${START_Y} Td (${escaped}) Tj`);
      first = false;
    } else {
      streamParts.push(`T* (${escaped}) Tj`);
    }
  }
  streamParts.push("ET");
  return streamParts.join("\n");
}

function buildPdfFromPageLines(pagesLines: string[][]): Buffer {
  const pageCount = pagesLines.length;
  const fontObjNum = 2 + pageCount * 2 + 1;
  const objects: string[] = [];

  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");

  const pageObjectNumbers: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i * 2;
    const contentObjNum = pageObjNum + 1;
    pageObjectNumbers.push(pageObjNum);

    const stream = buildPageStream(pagesLines[i]!);
    const streamLength = Buffer.byteLength(stream, "utf8");

    objects.push(
      `${pageObjNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >> endobj`,
    );
    objects.push(
      `${contentObjNum} 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj`,
    );
  }

  objects.splice(
    1,
    0,
    `2 0 obj << /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >> endobj`,
  );

  objects.push(
    `${fontObjNum} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${obj}\n`;
  }

  const totalObjects = objects.length + 1;
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${totalObjects}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < totalObjects; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${totalObjects} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function markdownToPdfBuffer(
  title: string,
  markdown: string,
): Promise<Buffer> {
  const lines = markdownToDisplayLines(title, markdown);
  return Promise.resolve(buildPdfFromPageLines(chunkLines(lines)));
}

export function documentsToPdfBuffer(
  sections: PdfDocumentSection[],
  options?: { coverTitle?: string; coverSubtitle?: string },
): Promise<Buffer> {
  const allLines: string[] = [];

  if (options?.coverTitle) {
    allLines.push(options.coverTitle.toUpperCase(), "");
    if (options.coverSubtitle) {
      allLines.push(options.coverSubtitle, "");
    }
    allLines.push(
      `Nombre de documents : ${sections.length}`,
      "",
      "Sommaire",
      "",
    );
    sections.forEach((section, index) => {
      allLines.push(`${index + 1}. ${section.title}`);
    });
    allLines.push("", "========================================", "");
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    if (i > 0 || options?.coverTitle) {
      allLines.push("", "========================================", "");
    }
    allLines.push(...markdownToDisplayLines(section.title, section.contentMarkdown));
  }

  return Promise.resolve(buildPdfFromPageLines(chunkLines(allLines)));
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "document"
  );
}

export function buildPdfFilename(title: string, version: number): string {
  return `${slugify(title)}-v${version}.pdf`;
}

export function buildProjectPdfFilename(projectName: string): string {
  return `${slugify(projectName)}-documents-hermes.pdf`;
}

export function buildAllDocumentsPdfFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `projector-documents-hermes-${date}.pdf`;
}
