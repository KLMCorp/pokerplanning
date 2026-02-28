#!/bin/sh
set -e

# =============================================================================
# Poker Planning - Docker Entrypoint
# =============================================================================
# Lance deux serveurs dans un même container :
#   1. Socket.IO / Express (port $PORT, défaut 3001)
#   2. Next.js standalone (port 3000, forcé via PORT=3000)
#
# IMPORTANT : Next.js standalone lit process.env.PORT pour choisir son port.
# Comme PORT=3001 est défini pour Socket.IO, on le surcharge à 3000
# uniquement pour le processus Next.js (variable inline devant la commande).
#
# Signal handling : SIGTERM/SIGINT sont propagés aux deux processus fils
# pour un arrêt propre (graceful shutdown).
# =============================================================================

echo "=================================================="
echo "  Poker Planning - Starting..."
echo "=================================================="
echo ""
echo "Configuration:"
echo "  APP_URL: ${APP_URL:-not set}"
echo "  SMTP_HOST: ${SMTP_HOST:-not configured}"
echo "  NEXT_PUBLIC_SOCKET_URL: ${NEXT_PUBLIC_SOCKET_URL:-not set}"
echo ""

# Trap les signaux pour un arrêt propre des deux processus
cleanup() {
  echo "Shutting down..."
  kill "$SOCKET_PID" "$NEXT_PID" 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup SIGTERM SIGINT

# 1. Démarrer le serveur Socket.IO en arrière-plan
#    Lit PORT depuis l'env (défaut 3001 dans le Dockerfile)
echo "Starting Socket.IO server on port ${PORT:-3001}..."
node dist/server/index.js &
SOCKET_PID=$!

# Attendre que le serveur Socket.IO soit prêt avant de lancer Next.js
sleep 2

# 2. Démarrer le serveur Next.js standalone
#    PORT=3000 : surcharge locale pour éviter le conflit avec Socket.IO
#    HOSTNAME=0.0.0.0 : écouter sur toutes les interfaces (nécessaire dans Docker)
echo "Starting Next.js server on port 3000..."
PORT=3000 HOSTNAME=0.0.0.0 node server.js &
NEXT_PID=$!

# Attendre que l'un des deux processus se termine
# Note : `wait` sans -n car Alpine utilise BusyBox ash (pas bash)
wait
