#!/usr/bin/env bash
# Publie les changements locaux vers Gitea (Aguilera_Lab/Projector).
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

git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE_URL"
git remote set-url origin "$REMOTE_URL"

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

git remote set-url origin "$REMOTE_URL"
git fetch origin
git branch -u origin/main main 2>/dev/null || true

echo "Publié : $REPO_WEB"
echo "Commit : $(git rev-parse --short HEAD)"
