import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import registryData from "../../../reference-data/hermes/template-registry.json";
import { localizeScenario } from "@/lib/hermes/i18n";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import { isWordTemplateAvailable } from "@/lib/documents/hermes-templates";
import {
  buildDocumentMarkdown,
  parseDocumentMarkdown,
} from "@/lib/documents/document-editor";
import { resolveWordTemplateFile } from "@/lib/documents/templates";
import type {
  DocumentLocale,
  GeneratedDocument,
  HermesPhaseId,
  PhaseValidation,
  Project,
  Task,
} from "@/types";

export interface HermesWordTemplateEntry {
  id: string;
  wordFile: string;
  outcomeKeysFr: string[];
  phases: HermesPhaseId[];
  titleFr: string;
  titleEn: string;
}

const registry = registryData as { templates: HermesWordTemplateEntry[] };

export function listWordTemplateRegistry(): HermesWordTemplateEntry[] {
  return registry.templates;
}

export function getWordTemplateById(
  id: string,
): HermesWordTemplateEntry | undefined {
  return registry.templates.find((entry) => entry.id === id);
}

export function findWordTemplateForOutcome(
  outcomeKey: string,
  phase: HermesPhaseId,
): HermesWordTemplateEntry | undefined {
  return registry.templates.find(
    (entry) =>
      entry.outcomeKeysFr.includes(outcomeKey) &&
      entry.phases.includes(phase),
  );
}

function buildTasksList(
  tasks: Task[],
  phase: HermesPhaseId,
  locale: DocumentLocale,
): string {
  const t = getTranslator(locale);
  const phaseTasks = tasks.filter((task) => task.phase === phase);
  if (phaseTasks.length === 0) {
    return `(${t("docs.noTasks")})`;
  }
  return phaseTasks
    .map((task) => {
      const status = tDynamic(t, `enums.taskStatus.${task.status}`);
      return `- ${task.title} (${task.progress ?? 0} % — ${status})`;
    })
    .join("\n");
}

export interface GenerateDocxInput {
  wordFile: string;
  project: Project & { portfolioName?: string; code?: string };
  validation: PhaseValidation;
  meta: {
    version: number;
    generatedByName: string;
    phaseLabel?: string;
    milestone?: string;
    scenarioLabel?: string;
    approachLabel?: string;
    tasksList?: string;
    classification?: string;
    documentStatus?: string;
    contexteOverride?: string;
    descriptionOverride?: string;
  };
}

export async function generateHermesDocxBuffer(
  input: GenerateDocxInput,
): Promise<Buffer> {
  const scriptPath = path.join(process.cwd(), "scripts/hermes/generate_docx.py");

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8") || "Génération Word impossible.",
        ),
      );
    });

    proc.stdin.write(Buffer.from(JSON.stringify(input), "utf8"));
    proc.stdin.end();
  });
}

export function getGeneratedDocumentsProjectDir(projectId: string): string {
  return path.join(process.cwd(), "generated-documents", projectId);
}

export function getGeneratedDocxPath(
  projectId: string,
  documentId: string,
): string {
  return path.join(
    getGeneratedDocumentsProjectDir(projectId),
    `${documentId}.docx`,
  );
}

export async function deleteProjectGeneratedDocxFiles(
  projectId: string,
): Promise<void> {
  try {
    await rm(getGeneratedDocumentsProjectDir(projectId), {
      recursive: true,
      force: true,
    });
  } catch (error) {
    console.warn(`deleteProjectGeneratedDocxFiles(${projectId}):`, error);
  }
}

export async function writeGeneratedDocx(
  projectId: string,
  documentId: string,
  buffer: Buffer,
): Promise<string> {
  const filePath = getGeneratedDocxPath(projectId, documentId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return filePath;
}

export async function readGeneratedDocx(
  projectId: string,
  documentId: string,
): Promise<Buffer | null> {
  try {
    return await readFile(getGeneratedDocxPath(projectId, documentId));
  } catch {
    return null;
  }
}

const DOCX_MAX_BYTES = 25 * 1024 * 1024;

/** Ne pas écraser un Word importé manuellement lors d'une régénération automatique. */
export function shouldAutoRegenerateDocx(document: GeneratedDocument): boolean {
  return document.docxSource !== "uploaded";
}

export function isValidDocxBuffer(buffer: Buffer): boolean {
  if (buffer.length < 200 || buffer.length > DOCX_MAX_BYTES) return false;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString("binary");
  return (
    sample.includes("[Content_Types].xml") ||
    sample.includes("word/document.xml") ||
    sample.includes("word/")
  );
}

export function getDocxMaxUploadBytes(): number {
  return DOCX_MAX_BYTES;
}

export async function convertDocxToHtml(docx: Buffer): Promise<string> {
  const scriptPath = path.join(
    process.cwd(),
    "scripts/hermes/docx_to_html.py",
  );

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8") ||
            "Conversion aperçu Word impossible.",
        ),
      );
    });

    proc.stdin.write(docx);
    proc.stdin.end();
  });
}

export async function ensureGeneratedDocxBuffer(
  document: GeneratedDocument,
  project: Project & { portfolioName?: string },
  validation: PhaseValidation,
  tasks: Task[],
  actorName: string,
): Promise<Buffer | null> {
  let docx = await readGeneratedDocx(document.projectId, document.id);
  if (docx) return docx;

  if (!resolveWordTemplateFile(document)) return null;
  if (!isWordTemplateAvailable(resolveWordTemplateFile(document)!)) return null;

  const ok = await regenerateGeneratedDocumentDocx(
    document,
    project,
    validation,
    tasks,
    actorName,
  );
  if (!ok) return null;
  return readGeneratedDocx(document.projectId, document.id);
}

export function buildDocxPayload(
  wordFile: string,
  project: Project & { portfolioName?: string },
  fromPhase: HermesPhaseId,
  validation: PhaseValidation,
  tasks: Task[],
  locale: DocumentLocale,
  version: number,
  generatedByName: string,
  milestone?: string,
  contentMarkdown?: string,
): GenerateDocxInput {
  const t = getTranslator(locale);
  const scenario = localizeScenario(project.scenarioId, locale);

  const editorial = contentMarkdown
    ? parseDocumentMarkdown(contentMarkdown)
    : { contexte: "", description: "" };

  return {
    wordFile,
    project: {
      ...project,
      code: project.id.slice(0, 8).toUpperCase(),
    },
    validation,
    meta: {
      version,
      generatedByName,
      phaseLabel: tDynamic(t, `enums.phase.${fromPhase}`),
      milestone,
      scenarioLabel: scenario?.label,
      approachLabel: tDynamic(t, `enums.approach.${project.approach}`),
      tasksList: buildTasksList(tasks, fromPhase, locale),
      classification: "Interne",
      documentStatus: "Final",
      contexteOverride: editorial.contexte.trim() || undefined,
      descriptionOverride: editorial.description.trim() || undefined,
    },
  };
}

/** Extrait le texte éditorial du markdown pour injection dans le gabarit Word. */
export function extractDescriptionForWordTemplate(markdown: string): string {
  const body: string[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("---") ||
      /^\*\*Projet\s*:/i.test(trimmed) ||
      /^\*\*Phase\s*:/i.test(trimmed) ||
      /^\*\*Transition\s*:/i.test(trimmed)
    ) {
      continue;
    }
    body.push(
      trimmed
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1"),
    );
    if (body.join("\n").length > 4000) break;
  }
  return body.join("\n").trim();
}

export async function regenerateGeneratedDocumentDocx(
  document: GeneratedDocument,
  project: Project & { portfolioName?: string },
  validation: PhaseValidation,
  tasks: Task[],
  actorName: string,
): Promise<boolean> {
  const wordFile = resolveWordTemplateFile(document);
  if (!wordFile) return false;
  if (!isWordTemplateAvailable(wordFile)) return false;

  try {
    const payload = buildDocxPayload(
      wordFile,
      project,
      document.phase,
      validation,
      tasks,
      document.locale,
      document.version,
      actorName,
      document.milestone,
      document.contentMarkdown,
    );
    const buffer = await generateHermesDocxBuffer(payload);
    await writeGeneratedDocx(project.id, document.id, buffer);
    return true;
  } catch (error) {
    console.error("regenerateGeneratedDocumentDocx:", error);
    return false;
  }
}

export interface DocumentPreviewDraft {
  title?: string;
  contexte?: string;
  description?: string;
  contentMarkdown?: string;
}

export async function renderDocumentPreviewHtml(
  document: GeneratedDocument,
  project: Project & { portfolioName?: string },
  validation: PhaseValidation,
  tasks: Task[],
  actorName: string,
  draft?: DocumentPreviewDraft,
): Promise<string> {
  const wordFile = resolveWordTemplateFile(document);
  if (!wordFile) {
    throw new Error("Gabarit Word introuvable pour ce document.");
  }
  if (!isWordTemplateAvailable(wordFile)) {
    throw new Error(`Gabarit Word introuvable : ${wordFile}`);
  }

  const contentMarkdown =
    draft?.contentMarkdown ??
    (draft?.contexte !== undefined || draft?.description !== undefined
      ? buildDocumentMarkdown({
          preamble: parseDocumentMarkdown(document.contentMarkdown).preamble,
          contexte: draft.contexte ?? "",
          description: draft.description ?? "",
        })
      : document.contentMarkdown);

  const payload = buildDocxPayload(
    wordFile,
    project,
    document.phase,
    validation,
    tasks,
    document.locale,
    document.version,
    actorName,
    document.milestone,
    contentMarkdown,
  );

  const docx = await generateHermesDocxBuffer(payload);
  return convertDocxToHtml(docx);
}

export function buildDocxFilename(title: string, version: number): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${slug || "document"}-v${version}.docx`;
}
