#!/usr/bin/env bash
# Copie les gabarits Word HERMES depuis un dossier source vers reference-data/hermes/word-templates/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="$ROOT/reference-data/hermes/word-templates"
SOURCE="${1:-}"

if [[ -z "$SOURCE" || ! -d "$SOURCE" ]]; then
  echo "Usage: $0 /chemin/vers/dossier/hermes"
  echo "Exemple: npm run hermes:templates:import -- ~/Downloads/hermes"
  exit 1
fi

mkdir -p "$TARGET"
count=0
shopt -s nullglob nocaseglob
for f in "$SOURCE"/*.dotx "$SOURCE"/*.docx; do
  base="$(basename "$f")"
  cp -f "$f" "$TARGET/$base"
  echo "  + $base"
  count=$((count + 1))
done

if [[ "$count" -eq 0 ]]; then
  echo "Aucun fichier .dotx/.docx trouvé dans $SOURCE"
  exit 1
fi

echo ""
echo "$count fichier(s) copié(s) vers $TARGET"
python3 "$ROOT/scripts/hermes/verify-word-templates.py"
