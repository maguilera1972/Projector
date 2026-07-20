#!/bin/bash
# Redémarre PROJECTOR proprement (un seul serveur sur le port 3000)
set -e
cd "$(dirname "$0")"

echo "→ Arrêt des serveurs Next.js existants..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2

if ss -tln | grep -q ':3000 '; then
  echo "⚠ Le port 3000 est encore occupé. Exécutez : sudo kill \$(sudo lsof -t -i:3000)"
  exit 1
fi

echo "→ Démarrage sur http://0.0.0.0:3000"
echo "  Accès réseau : http://$(hostname -I | awk '{print $1}'):3000"
npm run dev
