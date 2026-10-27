import type { Translator } from "@/lib/i18n/translate";
import type { AnnexFileInput } from "@/lib/db/store";
import {
  ALLOWED_ANNEX_EXTENSIONS,
  getUploadMaxBytes,
  isAllowedAnnexFile,
  mimeTypeForFile,
  sanitizeFileName,
} from "@/lib/documents/annex-storage";

/** Lit et valide le fichier d'un formulaire multipart (extension autorisée, taille maximale). */
export async function readUploadedFile(
  form: FormData,
  t: Translator,
): Promise<{ file: AnnexFileInput } | { error: string; status: number }> {
  const entry = form.get("file");
  if (!entry || typeof entry === "string") {
    return { error: t("annexes.errorNoFile"), status: 400 };
  }

  const originalName = sanitizeFileName(entry.name || "document");
  if (!isAllowedAnnexFile(originalName)) {
    return {
      error: t("annexes.errorType", { types: ALLOWED_ANNEX_EXTENSIONS.join(", ") }),
      status: 415,
    };
  }

  const maxBytes = getUploadMaxBytes();
  if (entry.size > maxBytes) {
    return {
      error: t("annexes.errorSize", { max: Math.round(maxBytes / 1024 / 1024) }),
      status: 413,
    };
  }
  if (entry.size === 0) {
    return { error: t("annexes.errorEmpty"), status: 400 };
  }

  const data = Buffer.from(await entry.arrayBuffer());
  return { file: { originalName, mimeType: mimeTypeForFile(originalName), data } };
}
