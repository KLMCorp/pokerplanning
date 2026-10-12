#!/bin/bash
#
# Script de désinstallation Planning Poker sur Proxmox LXC
# Usage: ./proxmox-uninstall.sh --ctid <id> [--keep-data]
#

set -e

CTID="${CTID:-200}"
KEEP_DATA=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Parsing des arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --ctid) CTID="$2"; shift 2 ;;
        --keep-data) KEEP_DATA=true; shift ;;
        --help)
            echo "Usage: $0 --ctid <id> [--keep-data]"
            echo ""
            echo "Options:"
            echo "  --ctid <id>    ID du conteneur LXC"
            echo "  --keep-data    Sauvegarder la base de données avant suppression"
            exit 0
            ;;
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

# Confirmation
echo -e "${YELLOW}ATTENTION: Cette action va supprimer le conteneur LXC $CTID${NC}"
echo ""
read -p "Êtes-vous sûr de vouloir continuer? (oui/non): " CONFIRM

if [[ "$CONFIRM" != "oui" ]]; then
    echo "Annulé."
    exit 0
fi

# Sauvegarde des données si demandé
if [[ "$KEEP_DATA" == "true" ]]; then
    log_info "Sauvegarde des données..."
    BACKUP_DIR="/root/planning-poker-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    pct exec "$CTID" -- tar -czf /tmp/data-backup.tar.gz -C /home/poker/app data public/uploads 2>/dev/null || true
    pct pull "$CTID" /tmp/data-backup.tar.gz "$BACKUP_DIR/data-backup.tar.gz" 2>/dev/null || true

    if [[ -f "$BACKUP_DIR/data-backup.tar.gz" ]]; then
        log_success "Données sauvegardées dans $BACKUP_DIR"
    else
        log_warn "Aucune donnée à sauvegarder"
    fi
fi

# Arrêt du conteneur
log_info "Arrêt du conteneur..."
pct stop "$CTID" 2>/dev/null || true
sleep 2

# Suppression du conteneur
log_info "Suppression du conteneur..."
pct destroy "$CTID" --purge

log_success "Conteneur $CTID supprimé avec succès"

if [[ "$KEEP_DATA" == "true" ]] && [[ -d "$BACKUP_DIR" ]]; then
    echo ""
    echo -e "Données sauvegardées dans: ${GREEN}$BACKUP_DIR${NC}"
fi
