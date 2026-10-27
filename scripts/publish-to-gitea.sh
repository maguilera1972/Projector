#!/usr/bin/env bash
# Miroir optionnel (legacy) vers Gitea (Aguilera_Lab/Projector) via le remote « gitea ».
# La publication principale se fait désormais sur GitLab : scripts/publish-to-gitlab.sh
# Auth : variable GITEA_TOKEN, ou fichier .local/gitea-token (non versionné).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE_URL="https://git.aguilera.ch/Aguilera_Lab/Projector.git"
REPO_WEB="https://git.aguilera.ch/Aguilera_Lab/Projector"
TOKEN_FILE="$ROOT/.local/gitea-token"

if [[ -n "${GITEA_TOKEN:-}" ]]; then
  TOKEN="$GITEA_TOKEN"
elif [[ -f "$TOKEN_FILE" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
else
  echo "Erreur: aucun jeton. Définir GITEA_TOKEN ou créer $TOKEN_FILE" >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Erreur: jeton vide." >&2
  exit 1
fi

git remote get-url gitea >/dev/null 2>&1 || git remote add gitea "$REMOTE_URL"
git remote set-url gitea "$REMOTE_URL"

if git diff --quiet && git diff --cached --quiet && [[ -z "$(git status --porcelain)" ]]; then
  echo "Rien à publier (arbre de travail propre)."
  exit 0
fi

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  MSG="Update PROJECTOR application changes."
fi

git add -A
# Sécurité : ne jamais inclure secrets / runtime
git reset HEAD -- .env.local .env*.local .local/ data/ generated-documents/ 2>/dev/null || true

if git diff --cached --quiet; then
  echo "Rien à committer après filtrage des fichiers exclus."
  exit 0
fi

AUTHOR_NAME="${GIT_AUTHOR_NAME:-Michel}"
AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-michel@aguilera.ch}"

git -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" commit -m "$MSG"

AUTH_PUSH="https://Michel:${TOKEN}@git.aguilera.ch/Aguilera_Lab/Projector.git"
git -c http.postBuffer=524288000 -c http.version=HTTP/1.1 push "$AUTH_PUSH" HEAD:main

git remote set-url gitea "$REMOTE_URL"
git fetch gitea

echo "Publié : $REPO_WEB"
echo "Commit : $(git rev-parse --short HEAD)"
