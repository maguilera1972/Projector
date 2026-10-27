#!/usr/bin/env node
/**
 * Génère les icônes de l'application Teams PROJECTOR à partir du logo (anneaux « circuit ») :
 *   teams-app/color.png   192×192, fond marine #1e293b, dégradé #7dd3fc → #818cf8 → #a855f7
 *   teams-app/outline.png 32×32, uniquement blanc (#FFFFFF) + transparence
 *
 * Rendu SVG via sharp (librsvg, déjà présent dans node_modules avec Next.js) ;
 * repli sans dépendance (rastérisation sur-échantillonnée + encodeur PNG zlib) si sharp est absent
 * ou si l'option --fallback est passée.
 *
 * Usage : node scripts/teams/generate-icons.mjs [--fallback] [--out <dossier>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT_DIR = outIndex >= 0 && args[outIndex + 1] ? resolve(args[outIndex + 1]) : join(ROOT, "teams-app");
const FORCE_FALLBACK = args.includes("--fallback");

const NAVY = "#1e293b";
const STOPS = ["#7dd3fc", "#818cf8", "#a855f7"];

// Logo en unités 0–100 (repris de src/components/ui/logo.tsx).
const COLOR_SHAPES = [
  { type: "ring", r: 46, w: 3, dash: [60, 20, 40, 15, 50, 25], opacity: 1 },
  { type: "ring", r: 36, w: 2.5, dash: [45, 18, 35, 12, 40, 20], opacity: 0.85 },
  { type: "ring", r: 26, w: 2, dash: [30, 15, 25, 10, 30, 15], opacity: 0.7 },
  { type: "line", x1: 50, y1: 4, x2: 50, y2: 20, w: 2.5 },
  { type: "line", x1: 96, y1: 50, x2: 80, y2: 50, w: 2.5 },
  { type: "line", x1: 50, y1: 96, x2: 50, y2: 80, w: 2.5 },
  { type: "line", x1: 4, y1: 50, x2: 20, y2: 50, w: 2.5 },
  { type: "disc", r: 10 },
];

// Variante épaissie pour rester lisible à 32 px.
const OUTLINE_SHAPES = [
  { type: "ring", r: 41, w: 9, dash: [70, 22, 55, 18, 60, 33], opacity: 1 },
  { type: "ring", r: 23, w: 8, dash: [44, 14, 40, 12], opacity: 1 },
  { type: "disc", r: 9 },
];

function shapesToSvg(shapes, paint) {
  return shapes
    .map((shape) => {
      switch (shape.type) {
        case "ring":
          return `<circle cx="50" cy="50" r="${shape.r}" stroke="${paint}" stroke-width="${shape.w}" fill="none" stroke-dasharray="${shape.dash.join(" ")}" stroke-linecap="round" opacity="${shape.opacity}"/>`;
        case "line":
          return `<path d="M ${shape.x1} ${shape.y1} L ${shape.x2} ${shape.y2}" stroke="${paint}" stroke-width="${shape.w}" stroke-linecap="round"/>`;
        case "disc":
          return `<circle cx="50" cy="50" r="${shape.r}" fill="${paint}"/>`;
        default:
          throw new Error(`Forme inconnue : ${shape.type}`);
      }
    })
    .join("");
}

function colorSvg() {
  const stops = STOPS.map((color, i) => `<stop offset="${(i * 100) / (STOPS.length - 1)}%" stop-color="${color}"/>`).join("");
  // Symbole de 120 px centré : zone sûre recommandée par Teams pour l'icône couleur.
  // Dégradé en unités utilisateur : un trait vertical (boîte de largeur nulle) serait sinon invisible.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="100" y2="50">${stops}</linearGradient></defs>
<rect width="192" height="192" fill="${NAVY}"/>
<g transform="translate(36 36) scale(1.2)">${shapesToSvg(COLOR_SHAPES, "url(#g)")}</g>
</svg>`;
}

function outlineSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 100 100">${shapesToSvg(OUTLINE_SHAPES, "#FFFFFF")}</svg>`;
}

// ─── Repli sans dépendance ────────────────────────────────────────────────

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function gradientAt(t) {
  const colors = STOPS.map(hexToRgb);
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return colors[index].map((c, k) => c + (colors[index + 1][k] - c) * local);
}

function dashOn(shape, x, y) {
  const angle = (Math.atan2(y - 50, x - 50) + 2 * Math.PI) % (2 * Math.PI);
  const total = shape.dash.reduce((sum, v) => sum + v, 0);
  let position = (angle * shape.r) % total;
  for (let i = 0; i < shape.dash.length; i += 1) {
    if (position < shape.dash[i]) return i % 2 === 0;
    position -= shape.dash[i];
  }
  return false;
}

/** Couverture d'un point (unités 0–100) ; le dégradé suit l'abscisse du logo entier. */
function hit(shape, x, y) {
  switch (shape.type) {
    case "ring": {
      const d = Math.hypot(x - 50, y - 50);
      if (Math.abs(d - shape.r) > shape.w / 2 || !dashOn(shape, x, y)) return null;
      return { t: x / 100, opacity: shape.opacity };
    }
    case "line": {
      const dx = shape.x2 - shape.x1;
      const dy = shape.y2 - shape.y1;
      const len2 = dx * dx + dy * dy;
      const u = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / len2));
      if (Math.hypot(x - (shape.x1 + u * dx), y - (shape.y1 + u * dy)) > shape.w / 2) return null;
      return { t: x / 100, opacity: 1 };
    }
    case "disc": {
      if (Math.hypot(x - 50, y - 50) > shape.r) return null;
      return { t: x / 100, opacity: 1 };
    }
    default:
      throw new Error(`Forme inconnue : ${shape.type}`);
  }
}

/** Rastérise en RGBA (sur-échantillonnage 4×4). `transform` : pixel → unités logo. */
function rasterize({ size, shapes, background, white, transform }) {
  const data = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const [x, y] = transform(px + (sx + 0.5) / ss, py + (sy + 0.5) / ss);
          let color = background ? hexToRgb(background) : [0, 0, 0];
          let alpha = background ? 1 : 0;
          for (const shape of shapes) {
            const result = hit(shape, x, y);
            if (!result) continue;
            const src = white ? [255, 255, 255] : gradientAt(result.t);
            const sa = result.opacity;
            const outA = sa + alpha * (1 - sa);
            color = color.map((c, k) => (src[k] * sa + c * alpha * (1 - sa)) / (outA || 1));
            alpha = outA;
          }
          r += color[0] * alpha;
          g += color[1] * alpha;
          b += color[2] * alpha;
          a += alpha;
        }
      }
      const offset = (py * size + px) * 4;
      const n = ss * ss;
      data[offset] = a ? Math.round(r / a) : 0;
      data[offset + 1] = a ? Math.round(g / a) : 0;
      data[offset + 2] = a ? Math.round(b / a) : 0;
      data[offset + 3] = Math.round((a / n) * 255);
    }
  }
  return data;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Force le blanc pur sur tous les pixels (seule l'opacité varie). */
function whitenRgba(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
  }
  return rgba;
}

async function loadSharp() {
  if (FORCE_FALLBACK) return null;
  try {
    const module = await import("sharp");
    return module.default;
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const sharp = await loadSharp();
  let color;
  let outline;

  if (sharp) {
    color = await sharp(Buffer.from(colorSvg())).resize(192, 192).png({ compressionLevel: 9 }).toBuffer();
    const { data } = await sharp(Buffer.from(outlineSvg()), { density: 72 })
      .resize(32, 32)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    outline = encodePng(whitenRgba(Buffer.from(data)), 32);
    console.log("Rendu : sharp (librsvg).");
  } else {
    const colorPixels = rasterize({
      size: 192,
      shapes: COLOR_SHAPES,
      background: NAVY,
      white: false,
      transform: (x, y) => [(x - 36) / 1.2, (y - 36) / 1.2],
    });
    color = encodePng(colorPixels, 192);
    const outlinePixels = rasterize({
      size: 32,
      shapes: OUTLINE_SHAPES,
      background: null,
      white: true,
      transform: (x, y) => [(x * 100) / 32, (y * 100) / 32],
    });
    outline = encodePng(whitenRgba(outlinePixels), 32);
    console.log("Rendu : repli sans dépendance (sharp indisponible ou --fallback).");
  }

  writeFileSync(join(OUT_DIR, "color.png"), color);
  writeFileSync(join(OUT_DIR, "outline.png"), outline);
  console.log(`Icônes écrites : ${join(OUT_DIR, "color.png")} (192×192), ${join(OUT_DIR, "outline.png")} (32×32)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
