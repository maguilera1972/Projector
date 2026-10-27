#!/usr/bin/env bash
# Publie les changements locaux vers GitLab (Aguilera_Lab/Projector).
#
# Usage :
#   scripts/publish-to-gitlab.sh [--dry-run] ["Message de commit"] [-- chemin...]
#
#   --dry-run   Affiche ce qui serait commité / poussé, sans rien modifier.
#   -- chemins  Ne stage que ces chemins (sinon : tous les changements, hors exclusions).
#
# Auth : variable GITLAB_TOKEN, ou fichier ~/.config/gitlab/personal_access_token
# (jamais dans le dépôt). Le jeton est transmis à git via variables d'environnement
# (en-tête HTTP one-shot) : rien n'est écrit dans .git/config.
#
# Avant de lancer le script, ajouter une entrée dans CHANGELOG.md (section du jour).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="gitlab.aguilera.ch"
REMOTE_URL="https://${HOST}/Aguilera_Lab/Projector.git"
REPO_WEB="https://${HOST}/Aguilera_Lab/Projector"
BRANCH="main"
TOKEN_FILE="${HOME}/.config/gitlab/personal_access_token"
EXCLUDES=(.env.local '.env*.local' .local/ data/ generated-documents/ uploads/)

DRY_RUN=0
MSG=""
PATHS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run|-n) DRY_RUN=1; shift ;;
    --) shift; PATHS=("$@"); break ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) MSG="$1"; shift ;;
  esac
done
MSG="${MSG:-Update PROJECTOR application changes.}"

if [[ -n "${GITLAB_TOKEN:-}" ]]; then
  TOKEN="$GITLAB_TOKEN"
elif [[ -f "$TOKEN_FILE" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
else
  echo "Erreur: aucun jeton. Définir GITLAB_TOKEN ou créer $TOKEN_FILE (chmod 600)" >&2
  exit 1
fi
if [[ -z "$TOKEN" ]]; then
  echo "Erreur: jeton vide." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "Erreur: branche courante '$CURRENT_BRANCH' (attendu : $BRANCH)." >&2
  exit 1
fi

git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE_URL"
git remote set-url origin "$REMOTE_URL"

# En-tête d'auth one-shot, uniquement pour ce processus (non persisté, absent de argv).
AUTH_B64="$(printf 'oauth2:%s' "$TOKEN" | base64 | tr -d '\n')"
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="http.https://${HOST}/.extraHeader"
export GIT_CONFIG_VALUE_0="Authorization: Basic ${AUTH_B64}"
unset TOKEN AUTH_B64

PUSH_OPTS=(-c http.postBuffer=524288000 -c http.version=HTTP/1.1)

stage() {
  if [[ ${#PATHS[@]} -gt 0 ]]; then
    local p
    for p in "${PATHS[@]}"; do
      if [[ -e "$p" ]]; then
        git add -A -- "$p"
      else
        git rm -r -q --cached --ignore-unmatch -- "$p"
      fi
    done
  else
    git add -A
  fi
  git reset -q HEAD -- "${EXCLUDES[@]}" 2>/dev/null || true
}

if [[ $DRY_RUN -eq 1 ]]; then
  echo "== Dry-run : fichiers qui seraient commités =="
  if [[ ${#PATHS[@]} -gt 0 ]]; then
    for p in "${PATHS[@]}"; do
      if [[ -e "$p" ]]; then git add --dry-run -A -- "$p"; else echo "remove '$p'"; fi
    done
  else
    git add --dry-run -A || true
  fi
  echo "== Message : $MSG"
  [[ -n "$(git status --porcelain -- CHANGELOG.md)" ]] \
    || echo "Attention : CHANGELOG.md n'a pas été modifié."
  echo "== Push (dry-run) vers $REMOTE_URL ($BRANCH)"
  git "${PUSH_OPTS[@]}" push --dry-run origin "HEAD:${BRANCH}"
  exit 0
fi

stage
# En mode chemins ciblés, le commit ne contient que ces chemins (pas le reste de l'index).
SCOPE=()
[[ ${#PATHS[@]} -gt 0 ]] && SCOPE=(-- "${PATHS[@]}")
if git diff --cached --quiet "${SCOPE[@]}"; then
  echo "Rien à committer (après filtrage des exclusions)."
else
  git diff --cached --quiet -- CHANGELOG.md \
    && echo "Attention : CHANGELOG.md n'est pas inclus dans ce commit." >&2
  AUTHOR_NAME="${GIT_AUTHOR_NAME:-Michel}"
  AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-michel@aguilera.ch}"
  git -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" commit -m "$MSG" "${SCOPE[@]}"
fi

git fetch -q origin "$BRANCH" || true
if git rev-parse -q --verify "origin/${BRANCH}" >/dev/null \
   && [[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/${BRANCH}")" ]]; then
  echo "Rien à pousser : origin/${BRANCH} est à jour."
  exit 0
fi

git "${PUSH_OPTS[@]}" push origin "HEAD:${BRANCH}"
git branch -u "origin/${BRANCH}" "$BRANCH" >/dev/null 2>&1 || true

echo "Publié : $REPO_WEB"
echo "Commit : $REPO_WEB/-/commit/$(git rev-parse HEAD)"
