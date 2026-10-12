#!/bin/bash
#
# Script de mise à jour Planning Poker sur Proxmox LXC
# Usage: ./proxmox-update.sh --ctid <id>
#
# Met à jour l'application depuis le dépôt Git
#

set -e

CTID="${CTID:-200}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Met à jour l'application Planning Poker depuis le dépôt Git.

Options:
  --ctid <id>       ID du conteneur LXC (défaut: 200)
  --git-user <user> Nom d'utilisateur Git (si authentification requise)
  --git-pass <pass> Mot de passe Git (sera demandé si user fourni sans pass)
  --force           Continuer même si Node < 24 dans le conteneur (déconseillé)
  --help            Afficher cette aide

Exemples:
  $0 --ctid 200
  $0 --ctid 200 --git-user admin

EOF
    exit 0
}

GIT_USER=""
GIT_PASS=""
FORCE="${FORCE:-0}"

# Parsing des arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --ctid) CTID="$2"; shift 2 ;;
        --git-user) GIT_USER="$2"; shift 2 ;;
        --git-pass) GIT_PASS="$2"; shift 2 ;;
        --force) FORCE=1; shift ;;
        --help) show_help ;;
        *) log_error "Option inconnue: $1" ;;
    esac
done

# Vérifications
if ! command -v pct &> /dev/null; then
    log_error "Ce script doit être exécuté sur un hôte Proxmox"
fi

if ! pct status "$CTID" &> /dev/null; then
    log_error "Le conteneur $CTID n'existe pas"
fi

# Vérifier que le conteneur est démarré
STATUS=$(pct status "$CTID" | awk '{print $2}')
if [[ "$STATUS" != "running" ]]; then
    log_info "Démarrage du conteneur..."
    pct start "$CTID"
    sleep 5
fi

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Planning Poker - Mise à jour                      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

log_info "Mise à jour du conteneur $CTID..."

# Garde-fou : l'application exige Node 24 ou plus (engines de package.json). Vérifié avant toute modification
# (credentials Git, arrêt des services). Ce script ne met pas Node à jour : voir README.md (section Mise à jour Proxmox).
NODE_MAJOR=$(pct exec "$CTID" -- node -v 2>/dev/null | sed 's/^v//; s/\..*//' || true)
if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && [[ "$NODE_MAJOR" -lt 24 ]]; then
    if [[ "$FORCE" == "1" ]]; then
        log_warn "Node $NODE_MAJOR détecté dans le conteneur $CTID : Node 24 minimum requis. Poursuite forcée (--force)."
    else
        log_error "Node $NODE_MAJOR détecté dans le conteneur $CTID : Node 24 minimum requis. Installez Node 24 avant la mise à jour : pct exec $CTID -- bash -c 'mkdir -p /etc/apt/keyrings && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg && echo \"deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main\" > /etc/apt/sources.list.d/nodesource.list && apt-get update && apt-get install -y nodejs' (voir README.md), ou relancez avec --force."
    fi
fi

# Configuration Git si credentials fournis
if [[ -n "$GIT_USER" ]]; then
    if [[ -z "$GIT_PASS" ]]; then
        read -s -p "Mot de passe Git: " GIT_PASS
        echo ""
    fi

    # Encoder les credentials
    GIT_USER_ENCODED=$(printf '%s' "$GIT_USER" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g')
    GIT_PASS_ENCODED=$(printf '%s' "$GIT_PASS" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/#/%23/g')

    # Récupérer l'URL actuelle et ajouter les credentials
    CURRENT_URL=$(pct exec "$CTID" -- su - poker -c "cd /home/poker/app && git remote get-url origin")
    AUTH_URL=$(echo "$CURRENT_URL" | sed "s|https://|https://${GIT_USER_ENCODED}:${GIT_PASS_ENCODED}@|")

    # Configurer temporairement l'URL avec credentials
    pct exec "$CTID" -- su - poker -c "cd /home/poker/app && git remote set-url origin '$AUTH_URL'"
fi

# TRUST_PROXY : nginx (installé par proxmox-install.sh) est le seul proxy devant Node. Sans cette variable,
# tous les clients ont l'IP 127.0.0.1 et les limites deviennent globales. Ajouté s'il manque, jamais modifié sinon.
if ! pct exec "$CTID" -- grep -q '^TRUST_PROXY=' /home/poker/app/.env 2>/dev/null; then
    log_warn "TRUST_PROXY absent de /home/poker/app/.env : ajout de TRUST_PROXY=1 (nginx = 1 proxy de confiance)"
    pct exec "$CTID" -- bash -c "printf '%s\n' '# nginx local = 1 seul proxy de confiance devant Node (ajouté par proxmox-update.sh)' 'TRUST_PROXY=1' >> /home/poker/app/.env"
else
    log_info "TRUST_PROXY déjà défini dans .env : inchangé"
fi

# Arrêt des services
log_info "Arrêt des services..."
pct exec "$CTID" -- systemctl stop planning-poker-web.service || true
pct exec "$CTID" -- systemctl stop planning-poker.service || true

# Backup de la base de données
log_info "Backup de la base de données..."
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
pct exec "$CTID" -- su - poker -c "
    if [ -f /home/poker/app/data/pokerplanning.db ]; then
        cp /home/poker/app/data/pokerplanning.db /home/poker/app/data/pokerplanning_${BACKUP_DATE}.db
        echo 'Backup créé: pokerplanning_${BACKUP_DATE}.db'
    fi
"

# Pull des modifications
log_info "Téléchargement des mises à jour..."
pct exec "$CTID" -- su - poker -c "
    cd /home/poker/app
    git fetch origin
    git reset --hard origin/\$(git rev-parse --abbrev-ref HEAD)
"

# Restaurer l'URL sans credentials
if [[ -n "$GIT_USER" ]]; then
    CLEAN_URL=$(echo "$CURRENT_URL" | sed 's|https://[^@]*@|https://|')
    pct exec "$CTID" -- su - poker -c "cd /home/poker/app && git remote set-url origin '$CLEAN_URL'"
fi

# Installer les dépendances
log_info "Installation des dépendances..."
pct exec "$CTID" -- su - poker -c "
    cd /home/poker/app
    npm install --production=false
"

# Build
log_info "Build de l'application..."
pct exec "$CTID" -- su - poker -c "
    cd /home/poker/app
    npm run build
"

# Redémarrage des services
log_info "Redémarrage des services..."
pct exec "$CTID" -- systemctl daemon-reload
pct exec "$CTID" -- systemctl start planning-poker.service
sleep 2
pct exec "$CTID" -- systemctl start planning-poker-web.service

log_success "Mise à jour terminée!"

# Afficher le statut
echo ""
echo -e "${YELLOW}Statut des services:${NC}"
pct exec "$CTID" -- systemctl status planning-poker.service --no-pager -l 2>/dev/null | head -5 || true
echo ""
pct exec "$CTID" -- systemctl status planning-poker-web.service --no-pager -l 2>/dev/null | head -5 || true

# Afficher la version
echo ""
COMMIT=$(pct exec "$CTID" -- su - poker -c "cd /home/poker/app && git log -1 --format='%h - %s (%cr)'" 2>/dev/null || echo "N/A")
echo -e "${GREEN}Version actuelle:${NC} $COMMIT"
echo ""
