/** Découpe / reconstruit le markdown pour l'édition alignée sur le gabarit Word HERMES. */

export interface DocumentEditorFields {
  /** Métadonnées auto-générées (lecture seule à l'édition). */
  preamble: string;
  /** Section Contexte du modèle Word. */
  contexte: string;
  /** Section Description du modèle Word. */
  description: string;
}

const CONTEXTE_HEADING = "## Contexte";
const DESCRIPTION_HEADING = "## Description";

function stripPlaceholder(text: string): string {
  return text
    .replace(/^\*\[à compléter\]\*[^\n]*/gm, "")
    .replace(/^Généré le .+$/gm, "")
    .trim();
}

function extractSection(markdown: string, heading: string): string | undefined {
  const pattern = new RegExp(
    `${heading.replace("#", "\\#")}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`,
  );
  const match = markdown.match(pattern);
  return match?.[1]?.trim();
}

function extractPreamble(markdown: string): string {
  const firstSection = markdown.search(/\n## /);
  if (firstSection === -1) {
    const dash = markdown.indexOf("\n---\n");
    return dash === -1 ? markdown.trim() : markdown.slice(0, dash).trim();
  }
  return markdown.slice(0, firstSection).trim();
}

/** Extrait les champs éditoriaux depuis le markdown stocké. */
export function parseDocumentMarkdown(markdown: string): DocumentEditorFields {
  const contexteFromHeading = extractSection(markdown, CONTEXTE_HEADING);
  const descriptionFromHeading = extractSection(markdown, DESCRIPTION_HEADING);

  if (contexteFromHeading !== undefined || descriptionFromHeading !== undefined) {
    return {
      preamble: extractPreamble(markdown),
      contexte: contexteFromHeading ?? "",
      description: descriptionFromHeading ?? "",
    };
  }

  const parts = markdown.split(/\n---\n/);
  const preamble = parts[0]?.trim() ?? "";
  const complement = stripPlaceholder(parts.slice(1).join("\n---\n"));

  return {
    preamble,
    contexte: complement,
    description: complement,
  };
}

/** Reconstruit le markdown persisté à partir des champs éditoriaux. */
export function buildDocumentMarkdown(fields: DocumentEditorFields): string {
  const sections = [fields.preamble.trim()];

  if (fields.contexte.trim()) {
    sections.push(`${CONTEXTE_HEADING}\n${fields.contexte.trim()}`);
  }

  if (fields.description.trim()) {
    sections.push(`${DESCRIPTION_HEADING}\n${fields.description.trim()}`);
  }

  if (!fields.contexte.trim() && !fields.description.trim()) {
    sections.push("---\n*[à compléter]*");
  }

  return sections.filter(Boolean).join("\n\n");
}
