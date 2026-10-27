#!/usr/bin/env node
/**
 * Génère des aperçus HTML / texte de tous les e-mails PROJECTOR (aucun envoi).
 *   node scripts/render-email-previews.mjs [fr,de,...]
 * Sortie : .local/email-previews/<type>.<locale>.html|.txt + index.html
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PROJECTOR_PUBLIC_URL ??= "https://projector.aguilera.ch";
// Logo copié à côté des aperçus (chemin relatif) : affichable sans déploiement.
process.env.PROJECTOR_MAIL_ASSETS_URL ??= ".";

const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { EMAIL_PREVIEW_TYPES, renderEmailPreview } = await jiti.import(
  path.join(root, "src/lib/mail/previews.ts"),
);
const { EMAIL_LOGO_PATH } = await jiti.import(path.join(root, "src/lib/mail/layout.ts"));

const locales = (process.argv[2] ?? "fr,en,it,es,de").split(",").map((value) => value.trim());
const outDir = path.join(root, ".local", "email-previews");
await mkdir(path.join(outDir, path.dirname(EMAIL_LOGO_PATH)), { recursive: true });
await copyFile(path.join(root, "public", EMAIL_LOGO_PATH), path.join(outDir, EMAIL_LOGO_PATH));

const rows = [];
for (const type of EMAIL_PREVIEW_TYPES) {
  const cells = [];
  for (const locale of locales) {
    const { subject, html, text } = renderEmailPreview(type, locale);
    const base = `${type}.${locale}`;
    await writeFile(path.join(outDir, `${base}.html`), html);
    await writeFile(path.join(outDir, `${base}.txt`), `Subject: ${subject}\n\n${text}`);
    cells.push(`<a href="${base}.html">${locale}</a> (<a href="${base}.txt">txt</a>)`);
  }
  rows.push(`<tr><td>${type}</td><td>${cells.join(" · ")}</td></tr>`);
}

await writeFile(
  path.join(outDir, "index.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PROJECTOR — e-mails</title></head><body style="font-family:sans-serif;padding:24px"><h1>PROJECTOR — e-mails</h1><table cellpadding="6">${rows.join("")}</table></body></html>`,
);
console.log(`${EMAIL_PREVIEW_TYPES.length * locales.length} aperçus écrits dans ${path.relative(root, outDir)}/`);
