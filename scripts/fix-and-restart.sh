#!/bin/bash
# À exécuter UNE FOIS sur la machine (demande le mot de passe sudo) :
#   cd /home/projector/projector && sudo ./scripts/fix-and-restart.sh

set -e
cd "$(dirname "$0")/.."

echo "→ Arrêt des serveurs Next.js..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2

# Forcer l'arrêt si le port 3000 reste occupé
if ss -tln | grep -q ':3000 '; then
  PIDS=$(lsof -t -i:3000 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    kill -9 $PIDS 2>/dev/null || true
  fi
fi

echo "→ Correction des permissions (root → projector)..."
chown -R projector:projector .next node_modules data 2>/dev/null || true

echo "→ Nettoyage du cache de développement..."
rm -rf .next/dev/lock .next/dev 2>/dev/null || true

echo ""
echo "✓ Terminé. Relancez en tant qu'utilisateur projector (PAS root) :"
echo "  cd /home/projector/projector"
echo "  npm run dev"
echo ""
echo "  URL : http://$(hostname -I | awk '{print $1}'):3000/login"
