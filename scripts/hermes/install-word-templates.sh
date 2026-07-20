#!/usr/bin/env bash
# Télécharge les gabarits HERMES 5.1 FR officiels dans reference-data/hermes/word-templates/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="$ROOT/reference-data/hermes/word-templates"
ZIP_URL="https://www.hermes.admin.ch/_Resources/Persistent/d/d/9/a/dd9ae3f9f57f3fd4a409d7184da6ffb8db493025/pjm-51-fr.zip"
TMP="$(mktemp /tmp/pjm-51-fr.XXXXXX.zip)"

mkdir -p "$TARGET"
echo "Téléchargement des gabarits HERMES 5.1 (FR)…"
curl -fsSL "$ZIP_URL" -o "$TMP"
python3 -c "import zipfile; zipfile.ZipFile('$TMP').extractall('$TARGET')"
rm -f "$TMP"
echo "Extraction terminée dans $TARGET"
python3 "$ROOT/scripts/hermes/verify-word-templates.py"
