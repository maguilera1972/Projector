import { createHash, randomBytes } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

/**
 * Stockage des documents annexes : PROJECTOR_UPLOADS_DIR, sinon dossier « uploads »
 * à côté de la base JSON active (donc writable, y compris en repli .local/projector-data).
 */

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORED_NAME_PATTERN = /^v\d+-[A-Za-z0-9_-]{16,}\.[a-z0-9]{1,8}$/;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  vsdx: "application/vnd.ms-visio.drawing",
  mpp: "application/vnd.ms-project",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
};

export const ALLOWED_ANNEX_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);

export function getUploadMaxBytes(): number {
  const mb = Number(process.env.PROJECTOR_UPLOAD_MAX_MB ?? "25");
  return Math.round((Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024);
}

export function getUploadsRoot(dbFile: string): string {
  const configured = process.env.PROJECTOR_UPLOADS_DIR?.trim();
  return path.resolve(configured || path.join(path.dirname(dbFile), "uploads"));
}

export function getFileExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

export function isAllowedAnnexFile(fileName: string): boolean {
  return getFileExtension(fileName) in MIME_BY_EXTENSION;
}

export function mimeTypeForFile(fileName: string): string {
  return MIME_BY_EXTENSION[getFileExtension(fileName)] ?? "application/octet-stream";
}

/** Nom d'affichage sûr : sans chemin, sans caractères de contrôle ni séparateurs. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "document";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "document";
}

function annexDir(root: string, projectId: string, documentId: string): string {
  if (!ID_PATTERN.test(projectId) || !ID_PATTERN.test(documentId)) {
    throw new Error("Identifiant invalide.");
  }
  const dir = path.resolve(root, "annexes", projectId, documentId);
  if (!dir.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("Chemin invalide.");
  }
  return dir;
}

function annexFilePath(
  root: string,
  projectId: string,
  documentId: string,
  storedName: string,
): string {
  if (!STORED_NAME_PATTERN.test(storedName)) throw new Error("Nom de fichier invalide.");
  return path.join(annexDir(root, projectId, documentId), storedName);
}

export async function saveAnnexFile(
  root: string,
  projectId: string,
  documentId: string,
  version: number,
  originalName: string,
  data: Buffer,
): Promise<{ storedName: string; sha256: string }> {
  const extension = getFileExtension(originalName) || "bin";
  const storedName = `v${version}-${randomBytes(12).toString("base64url")}.${extension}`;
  const dir = annexDir(root, projectId, documentId);
  await mkdir(dir, { recursive: true, mode: 0o750 });
  await writeFile(path.join(dir, storedName), data, { mode: 0o640, flag: "wx" });
  return { storedName, sha256: createHash("sha256").update(data).digest("hex") };
}

export async function readAnnexFile(
  root: string,
  projectId: string,
  documentId: string,
  storedName: string,
): Promise<Buffer> {
  return readFile(annexFilePath(root, projectId, documentId, storedName));
}

export async function removeAnnexFile(
  root: string,
  projectId: string,
  documentId: string,
  storedName: string,
): Promise<void> {
  await rm(annexFilePath(root, projectId, documentId, storedName), { force: true });
}

/** En-tête Content-Disposition (RFC 6266 / 5987) avec repli ASCII. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Supprime définitivement les fichiers annexes d'un projet supprimé. */
export async function removeProjectAnnexFiles(root: string, projectId: string): Promise<void> {
  if (!ID_PATTERN.test(projectId)) return;
  const dir = path.resolve(root, "annexes", projectId);
  if (!dir.startsWith(path.resolve(root) + path.sep)) return;
  await rm(dir, { recursive: true, force: true });
}
