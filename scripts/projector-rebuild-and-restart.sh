#!/usr/bin/env bash
# Rebuild + redémarrage du service PROJECTOR (après mise à jour système / code).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Build production…"
npm run build

echo "==> Redémarrage du service systemd…"
systemctl --user restart projector.service
sleep 2
systemctl --user --no-pager status projector.service | head -15

echo "==> Contrôle HTTP local…"
code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3001/login || true)"
if [[ "$code" == "200" ]]; then
  echo "OK — http://127.0.0.1:3001/login → $code"
else
  echo "ATTENTION — login local a répondu: $code" >&2
  exit 1
fi
