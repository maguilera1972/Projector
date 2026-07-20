import { existsSync } from "node:fs";
import path from "node:path";
import registryData from "../../../reference-data/hermes/template-registry.json";

export interface HermesWordTemplateRegistryEntry {
  id: string;
  wordFile: string;
  outcomeKeysFr: string[];
  phases: string[];
  titleFr: string;
  titleEn: string;
}

const registry = registryData as {
  version: string;
  templatesDir: string;
  templates: HermesWordTemplateRegistryEntry[];
};

export const HERMES_WORD_TEMPLATES_DIR = path.join(
  process.cwd(),
  registry.templatesDir ?? "reference-data/hermes/word-templates",
);

export function getWordTemplateRegistry(): HermesWordTemplateRegistryEntry[] {
  return registry.templates;
}

export function getWordTemplatePath(wordFile: string): string {
  return path.join(HERMES_WORD_TEMPLATES_DIR, wordFile);
}

export function isWordTemplateAvailable(wordFile: string): boolean {
  const filePath = getWordTemplatePath(wordFile);
  return existsSync(filePath);
}

export function listMissingWordTemplates(): string[] {
  return registry.templates
    .map((entry) => entry.wordFile)
    .filter((wordFile) => !isWordTemplateAvailable(wordFile));
}

export function getRegistryEntryByWordFile(
  wordFile: string,
): HermesWordTemplateRegistryEntry | undefined {
  return registry.templates.find((entry) => entry.wordFile === wordFile);
}

export function getRegistryEntryByTemplateId(
  templateId: string,
): HermesWordTemplateRegistryEntry | undefined {
  return registry.templates.find((entry) => entry.id === templateId);
}

export const HERMES_TEMPLATES_VERSION = registry.version;
