/**
 * Métriques des polices standard PDF (Helvetica / Helvetica-Bold, encodage WinAnsi)
 * et encodage des chaînes Unicode — nécessaires pour mesurer, couper et aligner le texte.
 */

export type FontId = "regular" | "bold";

// Largeurs AFM (1/1000 em) pour les codes 32 à 126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Caractères Unicode → code WinAnsi (plage 0x80–0x9F et substitutions). */
const WIN_ANSI: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f, "−": 0x96, "\u202f": 0x20, "\u2009": 0x20, "\u00a0": 0x20,
  "\u2007": 0x20, "\u2011": 0x2d, "\u2010": 0x2d,
};

const SPECIAL_WIDTHS: Record<number, [number, number]> = {
  0x80: [556, 556], 0x85: [1000, 1000], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500],
  0x94: [333, 500], 0x95: [350, 350], 0x96: [556, 556], 0x97: [1000, 1000], 0x8c: [1000, 1000],
  0x9c: [944, 944], 0xab: [556, 556], 0xbb: [556, 556], 0xb0: [400, 400], 0xb7: [278, 278],
  0xd7: [584, 584], 0xdf: [611, 611], 0xe6: [889, 889], 0xc6: [1000, 1000], 0xa9: [737, 737],
};

/** Caractères rendus avec la police Symbol (absents de WinAnsi). */
export const SYMBOL_CHARS: Record<string, { code: number; width: number }> = {
  "→": { code: 0xae, width: 987 },
  "←": { code: 0xac, width: 987 },
  "≥": { code: 0xb3, width: 549 },
  "≤": { code: 0xa3, width: 549 },
};

export function winAnsiCode(char: string): number {
  const mapped = WIN_ANSI[char];
  if (mapped !== undefined) return mapped;
  const code = char.codePointAt(0) ?? 63;
  if (code >= 32 && code <= 126) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return 63; // « ? »
}

function codeWidth(code: number, font: FontId): number {
  const table = font === "bold" ? HELVETICA_BOLD : HELVETICA;
  if (code >= 32 && code <= 126) return table[code - 32]!;
  const special = SPECIAL_WIDTHS[code];
  if (special) return font === "bold" ? special[1] : special[0];
  if (code >= 0xc0) {
    const base = String.fromCharCode(code).normalize("NFD")[0] ?? "";
    const baseCode = base.charCodeAt(0);
    if (baseCode >= 32 && baseCode <= 126) return table[baseCode - 32]!;
  }
  return 556;
}

export interface TextRun {
  symbol: boolean;
  codes: number[];
}

export function toRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const char of text.replace(/[\r\n\t]+/g, " ")) {
    const symbol = SYMBOL_CHARS[char];
    const isSymbol = Boolean(symbol);
    const code = symbol ? symbol.code : winAnsiCode(char);
    const last = runs[runs.length - 1];
    if (last && last.symbol === isSymbol) last.codes.push(code);
    else runs.push({ symbol: isSymbol, codes: [code] });
  }
  return runs;
}

export function measureText(text: string, font: FontId, size: number): number {
  let total = 0;
  for (const char of text) {
    const symbol = SYMBOL_CHARS[char];
    total += symbol ? symbol.width : codeWidth(winAnsiCode(char), font);
  }
  return (total * size) / 1000;
}

/** Chaîne littérale PDF à partir de codes 8 bits (octal pour les codes non ASCII). */
export function pdfLiteral(codes: number[]): string {
  let out = "(";
  for (const code of codes) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}
