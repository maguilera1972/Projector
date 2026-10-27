/**
 * Reconnaissance des commandes texte du bot (FR/EN/IT/ES/DE, sans tenir compte des accents ni de la casse).
 */

export type BotCommand =
  | { kind: "myTasks" }
  | { kind: "status"; query: string }
  | { kind: "decisions" }
  | { kind: "help" }
  | { kind: "unknown"; text: string };

/** Minuscules, sans accents, espaces normalisés (comparaison tolérante). */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texte saisi sans mentions `<at>…</at>`, balises HTML ni entités usuelles. */
export function cleanMessageText(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/<at[^>]*>[\s\S]*?<\/at>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const MY_TASKS = [
  "mes taches",
  "taches",
  "my tasks",
  "tasks",
  "my open tasks",
  "le mie attivita",
  "mie attivita",
  "attivita",
  "mis tareas",
  "tareas",
  "meine aufgaben",
  "aufgaben",
];

const DECISIONS = [
  "decisions en attente",
  "decisions",
  "mes decisions",
  "pending decisions",
  "my decisions",
  "approvals",
  "decisioni in sospeso",
  "decisioni",
  "decisiones pendientes",
  "decisiones",
  "offene entscheidungen",
  "entscheidungen",
];

const HELP = ["aide", "help", "aiuto", "ayuda", "hilfe", "?", "menu", "start", "bonjour", "hello", "hi", "salut", "hallo", "ciao", "hola"];

const STATUS_PREFIXES = ["etat", "statut", "status", "stato", "estado"];

/** Mots de liaison ignorés entre la commande « état » et le nom du projet. */
const STATUS_FILLERS = [
  "du projet",
  "de projet",
  "projet",
  "of project",
  "of",
  "project",
  "del progetto",
  "progetto",
  "del proyecto",
  "proyecto",
  "des projekts",
  "projekt",
  "von",
  "du",
  "de",
  "del",
  "des",
];

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[\s.!?;:]+$/u, "");
}

export function parseCommand(rawText: string): BotCommand {
  const text = stripTrailingPunctuation(cleanMessageText(rawText));
  const normalized = normalizeText(text);
  if (!normalized || HELP.includes(normalized)) return { kind: "help" };
  if (MY_TASKS.includes(normalized)) return { kind: "myTasks" };
  if (DECISIONS.includes(normalized)) return { kind: "decisions" };

  const words = text.split(" ");
  const first = normalizeText(words[0] ?? "");
  if (STATUS_PREFIXES.includes(first)) {
    let rest = words.slice(1).join(" ").trim();
    for (let pass = 0; pass < 3; pass += 1) {
      const candidate = normalizeText(rest);
      const filler = STATUS_FILLERS.find((item) => candidate.startsWith(`${item} `));
      if (!filler) break;
      rest = rest.split(" ").slice(filler.split(" ").length).join(" ").trim();
    }
    return { kind: "status", query: rest.replace(/^["«“]+|["»”]+$/g, "").trim() };
  }
  return { kind: "unknown", text };
}
