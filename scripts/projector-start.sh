#!/usr/bin/env bash
# Lance PROJECTOR en production (port 3001 — tunnel Cloudflare).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV=production
export PORT="${PORT:-3001}"

# Charge .env.local si présent (sans écraser l'environnement déjà défini).
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

exec "$ROOT/node_modules/.bin/next" start -H 0.0.0.0 -p "$PORT"
