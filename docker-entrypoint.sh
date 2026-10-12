#!/bin/sh
# =============================================================================
# Poker Planning - Docker Entrypoint (BusyBox ash : pas de bash)
# =============================================================================
# Lance deux serveurs dans un même container :
#   1. Socket.IO / Express (port $PORT, défaut 3001)
#   2. Next.js standalone (port 3000, forcé via PORT=3000), lancé seulement
#      une fois /health du serveur Socket.IO joignable
#
# IMPORTANT : Next.js standalone lit process.env.PORT pour choisir son port.
# Comme PORT=3001 est défini pour Socket.IO, on le surcharge à 3000
# uniquement pour le processus Next.js (variable inline devant la commande).
#
# Supervision : si l'un des deux processus s'arrête, l'autre est arrêté et le
# container sort avec le code 1 (restart: unless-stopped le relance).
# SIGTERM/SIGINT : propagés aux deux processus (SIGKILL après 7 s), sortie 0.
#
# Attentes en `sleep 1 & wait $!` (et non `sleep 1`) : un sleep au premier plan
# retarderait le traitement des signaux jusqu'à sa fin.
# =============================================================================
set -u

SOCKET_PORT="${PORT:-3001}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT_SECONDS:-60}"
case "$STARTUP_TIMEOUT" in
  ''|*[!0-9]*|??????????*)
    echo "[entrypoint] STARTUP_TIMEOUT_SECONDS invalide ('$STARTUP_TIMEOUT'), 60 utilisé" >&2
    STARTUP_TIMEOUT=60
    ;;
esac

# Compat : les anciennes instructions passaient -e NEXT_PUBLIC_SOCKET_URL au docker run
if [ -z "${SOCKET_URL:-}" ] && [ -n "${NEXT_PUBLIC_SOCKET_URL:-}" ]; then
  SOCKET_URL="$NEXT_PUBLIC_SOCKET_URL"
  export SOCKET_URL
fi

# localhost désigne la machine du NAVIGATEUR, pas le container
socket_url_lower=$(printf '%s' "${SOCKET_URL:-}" | tr 'A-Z' 'a-z')
case "$socket_url_lower" in
  *://localhost|*://localhost[:/]*|*://127.*|*://0.0.0.0*|*://\[::1\]*)
    echo "[entrypoint] ATTENTION : SOCKET_URL=${SOCKET_URL} ne fonctionne que pour un navigateur lancé sur l'hôte du container." >&2
    echo "[entrypoint] Retirer SOCKET_URL / NEXT_PUBLIC_SOCKET_URL pour utiliser l'hôte de la page (port 3001), ou indiquer l'IP/DNS du serveur." >&2
    ;;
esac

echo "=================================================="
echo "  Poker Planning - Starting..."
echo "=================================================="
echo ""
echo "Configuration:"
echo "  APP_URL: ${APP_URL:-not set}"
echo "  SOCKET_URL: ${SOCKET_URL:-not set (client: page host:3001 if http on :3000, else page origin)}"
echo "  ALLOW_UPLOADS: ${ALLOW_UPLOADS:-true}"
echo "  SMTP_HOST: ${SMTP_HOST:-not configured}"
echo ""

SOCKET_PID=""
NEXT_PID=""
SHUTTING_DOWN=0

# Arrête les deux processus puis sort avec le code $1.
# Délai de grâce 7 s : au-delà des 5 s du gracefulShutdown d'Express, en deçà des
# 10 s de `docker stop` (sinon Docker envoie SIGKILL avant nous : exit 137).
terminate_all() {
  if [ "$SHUTTING_DOWN" = 1 ]; then
    return
  fi
  SHUTTING_DOWN=1
  for pid in $SOCKET_PID $NEXT_PID; do
    kill -TERM "$pid" 2>/dev/null
  done
  i=0
  while [ "$i" -lt 70 ]; do
    alive=0
    for pid in $SOCKET_PID $NEXT_PID; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
      fi
    done
    if [ "$alive" = 0 ]; then
      break
    fi
    sleep 0.1
    i=$((i + 1))
  done
  for pid in $SOCKET_PID $NEXT_PID; do
    kill -KILL "$pid" 2>/dev/null
  done
  wait $SOCKET_PID $NEXT_PID 2>/dev/null
  echo "[entrypoint] Stopped (exit code $1)"
  exit "$1"
}

on_signal() {
  echo "[entrypoint] Signal received, shutting down..."
  terminate_all 0
}
trap on_signal TERM INT

# 1. Serveur Socket.IO (lit PORT, 3001 par défaut dans le Dockerfile)
echo "Starting Socket.IO server on port ${SOCKET_PORT}..."
node dist/server/index.js &
SOCKET_PID=$!

# 127.0.0.1 et non localhost : BusyBox wget résout localhost en ::1 sans repli IPv4
echo "Waiting for http://127.0.0.1:${SOCKET_PORT}/health (timeout ${STARTUP_TIMEOUT}s)..."
i=0
until wget -q -T 2 --spider "http://127.0.0.1:${SOCKET_PORT}/health" 2>/dev/null; do
  if ! kill -0 "$SOCKET_PID" 2>/dev/null; then
    echo "[entrypoint] Socket.IO server exited during startup" >&2
    terminate_all 1
  fi
  if [ "$i" -ge "$STARTUP_TIMEOUT" ]; then
    echo "[entrypoint] Socket.IO server not healthy after ${STARTUP_TIMEOUT}s" >&2
    terminate_all 1
  fi
  sleep 1 & wait $!
  i=$((i + 1))
done
echo "Socket.IO server is healthy."

# 2. Serveur Next.js standalone
#    PORT=3000 : surcharge locale pour éviter le conflit avec Socket.IO
#    HOSTNAME=0.0.0.0 : Docker définit HOSTNAME (id du container), il faut le surcharger
echo "Starting Next.js server on port 3000..."
PORT=3000 HOSTNAME=0.0.0.0 node server.js &
NEXT_PID=$!

# Supervision : scrute les deux PID chaque seconde (un `wait` sans argument attendrait les deux)
while :; do
  if ! kill -0 "$SOCKET_PID" 2>/dev/null; then
    wait "$SOCKET_PID"
    echo "[entrypoint] Socket.IO server exited (code $?), stopping container" >&2
    terminate_all 1
  fi
  if ! kill -0 "$NEXT_PID" 2>/dev/null; then
    wait "$NEXT_PID"
    echo "[entrypoint] Next.js server exited (code $?), stopping container" >&2
    terminate_all 1
  fi
  sleep 1 & wait $!
done
