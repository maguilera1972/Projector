#!/usr/bin/env bash
# Construit le paquet d'application Microsoft Teams PROJECTOR :
#   dist/teams-app/projector-teams.zip  (manifest.json, color.png, outline.png à la racine)
# Avec l'agent Copilot (--with-copilot ou TEAMS_OAUTH_REFERENCE_ID défini) : ajoute
# teams-app/copilot/{declarativeAgent.json, ai-plugin.json, openapi.json, instruction*.txt},
# substitue {{OAUTH_REFERENCE_ID}} et déclare copilotAgents dans le manifeste.
#
# Variables (l'environnement prime ; sinon lues dans .env.local, clés listées uniquement) :
#   TEAMS_APP_ID               ID du manifeste (défaut : celui de teams-app/manifest.json)
#   TEAMS_APP_VERSION          Version du paquet (à incrémenter à chaque mise à jour dans Teams)
#   TEAMS_BOT_APP_ID           ID d'application du bot (défaut : celui du manifeste)
#   TEAMS_PUBLIC_HOST          Hôte public (défaut : hôte de PROJECTOR_PUBLIC_URL, sinon projector.aguilera.ch)
#   TEAMS_OAUTH_REFERENCE_ID   ID d'inscription OAuth (Teams Developer Portal) du plug-in API Copilot
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/teams-app"
OUT_DIR="$ROOT/dist/teams-app"
WITH_COPILOT=0
CHECK_SCHEMA=1
WITHOUT_BOT="${TEAMS_WITHOUT_BOT:-0}"
SCHEMA_URL="https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json"

usage() {
  cat <<'USAGE'
Usage : scripts/teams/build-teams-app.sh [--with-copilot] [--without-bot] [--out <dossier>] [--no-schema]

  --with-copilot  Inclut l'agent déclaratif Copilot (teams-app/copilot/*).
                  Implicite si TEAMS_OAUTH_REFERENCE_ID est défini.
  --without-bot   Paquet sans bot ni extension de messagerie (projector-teams-sans-bot.zip) :
                  tant que la ressource Azure Bot n'existe pas, Teams ne peut pas créer la
                  conversation du bot et refuse l'installation et les notifications
                  (« CreateThreadS2SRequest »). Onglets, SSO et flux d'activité restent inclus.
  --out <dossier> Dossier de sortie (défaut : dist/teams-app).
  --no-schema     Ne valide pas le manifeste contre le schéma Microsoft (hors ligne).

Exemples :
  bash scripts/teams/build-teams-app.sh
  TEAMS_APP_VERSION=1.0.1 TEAMS_OAUTH_REFERENCE_ID=<id> bash scripts/teams/build-teams-app.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-copilot) WITH_COPILOT=1 ;;
    --without-bot) WITHOUT_BOT=1 ;;
    --no-schema) CHECK_SCHEMA=0 ;;
    --out)
      [[ $# -ge 2 ]] || { echo "Erreur : --out exige un dossier." >&2; exit 64; }
      OUT_DIR="$(mkdir -p "$2" && cd "$2" && pwd)"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; usage >&2; exit 64 ;;
  esac
  shift
done

# Lecture ciblée de .env.local (jamais de source complet : les secrets restent hors du shell).
env_from_file() {
  local key="$1" file="$ROOT/.env.local"
  [[ -f "$file" ]] || return 0
  grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 | sed -E "s/^[[:space:]]*${key}=//; s/^[\"']//; s/[\"'][[:space:]]*$//" || true
}
for key in TEAMS_APP_ID TEAMS_APP_VERSION TEAMS_BOT_APP_ID TEAMS_PUBLIC_HOST TEAMS_OAUTH_REFERENCE_ID PROJECTOR_PUBLIC_URL; do
  if [[ -z "${!key:-}" ]]; then
    value="$(env_from_file "$key")"
    if [[ -n "$value" ]]; then export "$key=$value"; fi
  fi
done

if [[ -z "${TEAMS_PUBLIC_HOST:-}" && -n "${PROJECTOR_PUBLIC_URL:-}" ]]; then
  TEAMS_PUBLIC_HOST="$(node -e 'try { console.log(new URL(process.argv[1]).host) } catch { }' "$PROJECTOR_PUBLIC_URL")"
fi
export TEAMS_PUBLIC_HOST="${TEAMS_PUBLIC_HOST:-projector.aguilera.ch}"
if [[ -n "${TEAMS_OAUTH_REFERENCE_ID:-}" ]]; then WITH_COPILOT=1; fi

command -v node >/dev/null || { echo "Erreur : node est requis." >&2; exit 69; }
for file in manifest.json color.png outline.png; do
  [[ -f "$SRC/$file" ]] || {
    echo "Erreur : $SRC/$file introuvable (icônes : node scripts/teams/generate-icons.mjs)." >&2
    exit 66
  }
done

STAGE="$OUT_DIR/package"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp "$SRC/color.png" "$SRC/outline.png" "$STAGE/"

if [[ "$WITH_COPILOT" == 1 ]]; then
  COPILOT_DIR="$SRC/copilot"
  missing=()
  for file in declarativeAgent.json ai-plugin.json openapi.json; do
    [[ -f "$COPILOT_DIR/$file" ]] || missing+=("teams-app/copilot/$file")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Erreur : agent Copilot demandé mais fichiers absents : ${missing[*]}" >&2
    echo "         Générez-les (lot Copilot) ou construisez sans --with-copilot / TEAMS_OAUTH_REFERENCE_ID." >&2
    exit 66
  fi
  cp "$COPILOT_DIR/declarativeAgent.json" "$COPILOT_DIR/ai-plugin.json" "$COPILOT_DIR/openapi.json" "$STAGE/"
  shopt -s nullglob
  for file in "$COPILOT_DIR"/instruction*.txt; do cp "$file" "$STAGE/"; done
  shopt -u nullglob
  if [[ -z "${TEAMS_OAUTH_REFERENCE_ID:-}" ]]; then
    echo "Avertissement : TEAMS_OAUTH_REFERENCE_ID absent — {{OAUTH_REFERENCE_ID}} reste non substitué," >&2
    echo "                l'authentification du plug-in API Copilot échouera tant qu'il n'est pas défini." >&2
  fi
fi

# Manifeste : surcharges (ID, version, bot, hôte), copilotAgents, substitutions et validations.
SRC="$SRC" STAGE="$STAGE" WITH_COPILOT="$WITH_COPILOT" WITHOUT_BOT="$WITHOUT_BOT" node <<'NODE'
const fs = require("fs");
const path = require("path");

const src = process.env.SRC;
const stage = process.env.STAGE;
const withCopilot = process.env.WITH_COPILOT === "1";
const DEFAULT_HOST = "projector.aguilera.ch";
const host = process.env.TEAMS_PUBLIC_HOST || DEFAULT_HOST;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message) => {
  console.error(`Erreur : ${message}`);
  process.exit(65);
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${path.basename(file)} n'est pas un JSON valide (${error.message}).`);
  }
};
const replaceHost = (text) => (host === DEFAULT_HOST ? text : text.split(DEFAULT_HOST).join(host));

const manifest = JSON.parse(replaceHost(JSON.stringify(readJson(path.join(src, "manifest.json")))));
if (process.env.TEAMS_APP_ID) manifest.id = process.env.TEAMS_APP_ID;
if (process.env.TEAMS_APP_VERSION) manifest.version = process.env.TEAMS_APP_VERSION;
if (process.env.TEAMS_BOT_APP_ID) {
  for (const bot of manifest.bots ?? []) bot.botId = process.env.TEAMS_BOT_APP_ID;
  for (const extension of manifest.composeExtensions ?? []) extension.botId = process.env.TEAMS_BOT_APP_ID;
}

if (process.env.WITHOUT_BOT === "1") {
  delete manifest.bots;
  delete manifest.composeExtensions;
}

if (withCopilot) {
  manifest.copilotAgents = {
    declarativeAgents: [{ id: "projectorAgent", file: "declarativeAgent.json" }],
  };
  const reference = process.env.TEAMS_OAUTH_REFERENCE_ID ?? "";
  for (const name of fs.readdirSync(stage)) {
    if (!/\.(json|txt)$/.test(name)) continue;
    const file = path.join(stage, name);
    let text = replaceHost(fs.readFileSync(file, "utf8"));
    if (reference) text = text.split("{{OAUTH_REFERENCE_ID}}").join(reference);
    fs.writeFileSync(file, text);
    if (name.endsWith(".json")) readJson(file);
  }
}

// Contrôles structurels (le schéma complet est vérifié ensuite si possible).
if (!guid.test(manifest.id)) fail(`id du manifeste invalide : ${manifest.id}`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`version invalide : ${manifest.version}`);
for (const bot of manifest.bots ?? []) if (!guid.test(bot.botId)) fail(`botId invalide : ${bot.botId}`);
if (manifest.name.short.length > 30) fail("name.short dépasse 30 caractères.");
if (manifest.description.short.length > 80) fail("description.short dépasse 80 caractères.");
for (const list of manifest.bots?.[0]?.commandLists ?? []) {
  for (const command of list.commands) {
    if (command.title.length > 32 || command.description.length > 128) {
      fail(`commande de bot trop longue : ${command.title}`);
    }
  }
}
const pngSize = (file) => {
  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32BE(0) !== 0x89504e47) fail(`${path.basename(file)} n'est pas un PNG.`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
};
const [cw, ch] = pngSize(path.join(stage, manifest.icons.color));
if (cw !== 192 || ch !== 192) fail(`icône couleur ${cw}×${ch} (192×192 attendu).`);
const [ow, oh] = pngSize(path.join(stage, manifest.icons.outline));
if (ow !== 32 || oh !== 32) fail(`icône contour ${ow}×${oh} (32×32 attendu).`);
for (const agent of manifest.copilotAgents?.declarativeAgents ?? []) {
  if (!fs.existsSync(path.join(stage, agent.file))) fail(`fichier d'agent absent : ${agent.file}`);
}

fs.writeFileSync(path.join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Manifeste : id ${manifest.id}, version ${manifest.version}, hôte ${host}` +
    (withCopilot ? ", agent Copilot inclus" : "") +
    (process.env.WITHOUT_BOT === "1" ? ", sans bot" : ""),
);
NODE

if [[ "$CHECK_SCHEMA" == 1 ]]; then
  if python3 -c "import jsonschema" 2>/dev/null && command -v curl >/dev/null; then
    SCHEMA_FILE="$OUT_DIR/.manifest.schema.json"
    if [[ -s "$SCHEMA_FILE" ]] || curl -fsS --max-time 20 -o "$SCHEMA_FILE" "$SCHEMA_URL"; then
      python3 - "$SCHEMA_FILE" "$STAGE/manifest.json" <<'PY'
import json, sys
import jsonschema

schema = json.load(open(sys.argv[1], encoding="utf-8"))
manifest = json.load(open(sys.argv[2], encoding="utf-8"))
errors = list(jsonschema.Draft4Validator(schema).iter_errors(manifest))
for error in errors:
    print(f"  - {'/'.join(str(p) for p in error.path) or '(racine)'} : {error.message}", file=sys.stderr)
if errors:
    print(f"Erreur : manifeste non conforme au schéma v1.19 ({len(errors)} erreur(s)).", file=sys.stderr)
    sys.exit(65)
print("Schéma Teams v1.19 : conforme.")
PY
    else
      echo "Avertissement : schéma Microsoft injoignable, validation complète ignorée." >&2
    fi
  else
    echo "Info : python3-jsonschema ou curl absent, validation du schéma ignorée."
  fi
fi

ZIP="$OUT_DIR/projector-teams$([[ "$WITHOUT_BOT" == 1 ]] && echo "-sans-bot").zip"
rm -f "$ZIP"
if command -v zip >/dev/null; then
  (cd "$STAGE" && zip -q -X -r "$ZIP" .)
else
  python3 - "$STAGE" "$ZIP" <<'PY'
import os, sys, zipfile

stage, target = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(os.listdir(stage)):
        archive.write(os.path.join(stage, name), arcname=name)
PY
fi

echo "Paquet Teams : $ZIP"
python3 - "$ZIP" <<'PY'
import sys, zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    for info in archive.infolist():
        print(f"  {info.file_size:>8}  {info.filename}")
PY
