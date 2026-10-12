#!/bin/bash
#
# Script d'installation Planning Poker sur Proxmox LXC
# Usage: ./proxmox-install.sh [OPTIONS]
#
# Ce script doit être exécuté sur l'hôte Proxmox
#

set -e

# ============================================
# CONFIGURATION PAR DÉFAUT
# ============================================
CTID=""
CT_HOSTNAME="${CT_HOSTNAME:-poker-planning}"
MEMORY="${MEMORY:-1024}"
SWAP="${SWAP:-512}"
DISK="${DISK:-8}"
CORES="${CORES:-2}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE=""
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"
GATEWAY="${GATEWAY:-}"
APP_PORT="${APP_PORT:-3000}"
SERVER_PORT="${SERVER_PORT:-3001}"
NODE_VERSION="${NODE_VERSION:-24}"
GIT_REPO="${GIT_REPO:-https://your-git-server/PlanningPoker}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_USER=""
GIT_PASS=""

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# FONCTIONS UTILITAIRES
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Fonction d'encodage URL en pur bash
urlencode() {
    local string="$1"
    local strlen=${#string}
    local encoded=""
    local pos c o

    for (( pos=0 ; pos<strlen ; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [-_.~a-zA-Z0-9] ) o="$c" ;;
            * ) printf -v o '%%%02X' "'$c" ;;
        esac
        encoded+="$o"
    done
    echo "$encoded"
}

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Script d'installation automatique de Planning Poker dans un conteneur LXC Proxmox.
Télécharge les sources depuis Git et configure tout automatiquement.

Options:
  --ctid <id>           ID du conteneur LXC (défaut: interactif)
  --hostname <name>     Nom d'hôte (défaut: pokerPlanning)
  --memory <MB>         Mémoire RAM en MB (défaut: 1024)
  --swap <MB>           Swap en MB (défaut: 512)
  --disk <GB>           Taille du disque en GB (défaut: 8)
  --cores <n>           Nombre de cores CPU (défaut: 2)
  --storage <name>      Storage Proxmox (défaut: local-lvm)
  --template <path>     Template LXC (défaut: auto-détection Debian 12/13)
  --bridge <name>       Bridge réseau (défaut: vmbr0)
  --ip <addr>           Adresse IP (défaut: dhcp, format: 192.168.1.100/24)
  --gateway <addr>      Gateway (requis si IP statique)
  --app-port <port>     Port de l'application (défaut: 3000)
  --server-port <port>  Port du serveur WebSocket (défaut: 3001)
  --node-version <ver>  Version de Node.js (défaut: 24)
  --git-repo <url>      URL du dépôt Git
  --git-branch <branch> Branche Git (défaut: main)
  --git-user <user>     Nom d'utilisateur Git (sera demandé si non fourni)
  --git-pass <pass>     Mot de passe Git (sera demandé si non fourni)
  --help                Afficher cette aide

Exemples:
  # Installation interactive
  $0

  # Installation avec DHCP
  $0 --ctid 200 --hostname poker --git-user monuser

  # Installation avec IP statique
  $0 --ctid 200 --ip 192.168.1.100/24 --gateway 192.168.1.1

EOF
    exit 0
}

# ============================================
# PARSING DES ARGUMENTS
# ============================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --ctid) CTID="$2"; shift 2 ;;
        --hostname) CT_HOSTNAME="$2"; shift 2 ;;
        --memory) MEMORY="$2"; shift 2 ;;
        --swap) SWAP="$2"; shift 2 ;;
        --disk) DISK="$2"; shift 2 ;;
        --cores) CORES="$2"; shift 2 ;;
        --storage) STORAGE="$2"; shift 2 ;;
        --template) TEMPLATE="$2"; shift 2 ;;
        --bridge) BRIDGE="$2"; shift 2 ;;
        --ip) IP="$2"; shift 2 ;;
        --gateway) GATEWAY="$2"; shift 2 ;;
        --app-port) APP_PORT="$2"; shift 2 ;;
        --server-port) SERVER_PORT="$2"; shift 2 ;;
        --node-version) NODE_VERSION="$2"; shift 2 ;;
        --git-repo) GIT_REPO="$2"; shift 2 ;;
        --git-branch) GIT_BRANCH="$2"; shift 2 ;;
        --git-user) GIT_USER="$2"; shift 2 ;;
        --git-pass) GIT_PASS="$2"; shift 2 ;;
        --help) show_help ;;
        *) log_error "Option inconnue: $1. Utilisez --help pour l'aide." ;;
    esac
done

# ============================================
# BANNIÈRE
# ============================================

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}     ${GREEN}Planning Poker - Installation Proxmox LXC${NC}            ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# VÉRIFICATION PROXMOX
# ============================================

if ! command -v pct &> /dev/null; then
    log_error "Ce script doit être exécuté sur un hôte Proxmox"
fi

# ============================================
# SÉLECTION DU CTID
# ============================================

if [[ -z "$CTID" ]]; then
    EXISTING_IDS=$(pct list 2>/dev/null | awk 'NR>1 {print $1}' | sort -n)
    EXISTING_VMS=$(qm list 2>/dev/null | awk 'NR>1 {print $1}' | sort -n)
    ALL_IDS=$(echo -e "$EXISTING_IDS\n$EXISTING_VMS" | grep -v '^$' | sort -n | uniq)

    echo -e "${YELLOW}Conteneurs/VMs existants:${NC}"
    if [[ -n "$ALL_IDS" ]]; then
        if [[ -n "$EXISTING_IDS" ]]; then
            echo -e "  ${CYAN}LXC:${NC}"
            pct list 2>/dev/null | awk 'NR>1 {printf "    %s - %s (%s)\n", $1, $3, $2}'
        fi
        if [[ -n "$EXISTING_VMS" ]]; then
            echo -e "  ${CYAN}VMs:${NC}"
            qm list 2>/dev/null | awk 'NR>1 {printf "    %s - %s (%s)\n", $1, $2, $3}'
        fi
    else
        echo -e "  ${GREEN}Aucun conteneur/VM existant${NC}"
    fi
    echo ""

    SUGGESTED_ID=100
    while echo "$ALL_IDS" | grep -q "^${SUGGESTED_ID}$"; do
        ((SUGGESTED_ID++))
    done

    read -p "ID du conteneur LXC [${SUGGESTED_ID}]: " INPUT_CTID
    CTID="${INPUT_CTID:-$SUGGESTED_ID}"

    if ! [[ "$CTID" =~ ^[0-9]+$ ]]; then
        log_error "CTID invalide: $CTID (doit être un nombre)"
    fi

    if echo "$ALL_IDS" | grep -q "^${CTID}$"; then
        log_error "L'ID $CTID est déjà utilisé"
    fi
    echo ""
fi

# ============================================
# DEMANDE DES CREDENTIALS GIT
# ============================================

log_info "Configuration du dépôt Git: ${GIT_REPO}"
echo ""

if [[ -z "$GIT_USER" ]]; then
    read -p "Nom d'utilisateur Git: " GIT_USER
fi

if [[ -z "$GIT_USER" ]]; then
    log_error "Nom d'utilisateur Git requis"
fi

if [[ -z "$GIT_PASS" ]]; then
    read -s -p "Mot de passe Git: " GIT_PASS
    echo ""
fi

if [[ -z "$GIT_PASS" ]]; then
    log_error "Mot de passe Git requis"
fi

GIT_USER_ENCODED=$(urlencode "$GIT_USER")
GIT_PASS_ENCODED=$(urlencode "$GIT_PASS")
GIT_REPO_AUTH=$(echo "$GIT_REPO" | sed "s|https://|https://${GIT_USER_ENCODED}:${GIT_PASS_ENCODED}@|")

log_success "Credentials Git configurés"
echo ""

# ============================================
# VÉRIFICATIONS PRÉALABLES
# ============================================

log_info "Vérification de l'environnement Proxmox..."

if pct status "$CTID" &> /dev/null || qm status "$CTID" &> /dev/null; then
    log_error "L'ID $CTID est déjà utilisé par un conteneur ou une VM"
fi

log_info "Vérification du template Debian..."
pveam update

if [[ -z "$TEMPLATE" ]]; then
    # Préférer Debian 13, sinon Debian 12
    EXISTING_TEMPLATE=$(pveam list local | grep -E "debian-13" | head -1 | awk '{print $1}')
    if [ -z "$EXISTING_TEMPLATE" ]; then
        EXISTING_TEMPLATE=$(pveam list local | grep -E "debian-12" | head -1 | awk '{print $1}')
    fi

    if [ -n "$EXISTING_TEMPLATE" ]; then
        TEMPLATE="$EXISTING_TEMPLATE"
        log_success "Template trouvé: $TEMPLATE"
    else
        # Télécharger Debian 13 en priorité, sinon Debian 12
        DEBIAN_TEMPLATE=$(pveam available --section system | grep -E "debian-13" | tail -1 | awk '{print $2}')
        if [ -z "$DEBIAN_TEMPLATE" ]; then
            DEBIAN_TEMPLATE=$(pveam available --section system | grep -E "debian-12" | tail -1 | awk '{print $2}')
        fi

        if [ -z "$DEBIAN_TEMPLATE" ]; then
            log_error "Aucun template Debian disponible"
        fi
        log_info "Téléchargement de $DEBIAN_TEMPLATE..."
        pveam download local "$DEBIAN_TEMPLATE" || log_error "Échec du téléchargement"
        TEMPLATE="local:vztmpl/$DEBIAN_TEMPLATE"
    fi
fi

log_success "Template: $TEMPLATE"

if [[ "$IP" == "dhcp" ]]; then
    NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=dhcp"
else
    if [[ -z "$GATEWAY" ]]; then
        log_error "Gateway requis avec une IP statique (--gateway)"
    fi
    NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${IP},gw=${GATEWAY}"
fi

log_success "Environnement vérifié"

# ============================================
# AFFICHAGE DE LA CONFIGURATION
# ============================================

echo ""
echo -e "${CYAN}Configuration:${NC}"
echo -e "  Container ID:  ${GREEN}$CTID${NC}"
echo -e "  Hostname:      ${GREEN}$CT_HOSTNAME${NC}"
echo -e "  Memory:        ${GREEN}${MEMORY}MB${NC}"
echo -e "  CPU Cores:     ${GREEN}$CORES${NC}"
echo -e "  Disk:          ${GREEN}${DISK}GB${NC}"
echo -e "  Network:       ${GREEN}$IP${NC}"
echo -e "  Git Branch:    ${GREEN}$GIT_BRANCH${NC}"
echo ""

read -p "Continuer l'installation? (O/n): " CONFIRM
CONFIRM=${CONFIRM:-O}
if [[ ! "$CONFIRM" =~ ^[OoYy]$ ]]; then
    echo "Installation annulée."
    exit 0
fi

echo ""

# ============================================
# CRÉATION DU CONTENEUR LXC
# ============================================

log_info "Création du conteneur LXC $CTID..."

pct create "$CTID" "$TEMPLATE" \
    --hostname "$CT_HOSTNAME" \
    --memory "$MEMORY" \
    --swap "$SWAP" \
    --cores "$CORES" \
    --rootfs "${STORAGE}:${DISK}" \
    --net0 "$NET_CONFIG" \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --start 0

log_success "Conteneur créé"

# ============================================
# DÉMARRAGE DU CONTENEUR
# ============================================

log_info "Démarrage du conteneur..."
pct start "$CTID"
sleep 5

log_info "Attente du réseau..."
for i in {1..30}; do
    if pct exec "$CTID" -- ping -c 1 -W 1 8.8.8.8 &> /dev/null; then
        break
    fi
    sleep 1
done

log_success "Conteneur démarré"

# ============================================
# INSTALLATION DES DÉPENDANCES
# ============================================

log_info "Installation des dépendances système..."

pct exec "$CTID" -- bash -c "
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get upgrade -y
    apt-get install -y curl git build-essential python3 ca-certificates gnupg sudo
"

log_success "Dépendances système installées"

# ============================================
# INSTALLATION DE NODE.JS
# ============================================

log_info "Installation de Node.js ${NODE_VERSION}..."

pct exec "$CTID" -- bash -c "
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
    npm install -g typescript
"

log_success "Node.js installé"

# ============================================
# CRÉATION DE L'UTILISATEUR APPLICATIF
# ============================================

log_info "Création de l'utilisateur applicatif..."

pct exec "$CTID" -- bash -c "
    useradd -m -s /bin/bash poker
    mkdir -p /home/poker/app
    chown -R poker:poker /home/poker
"

log_success "Utilisateur créé"

# ============================================
# CLONAGE DU DÉPÔT GIT
# ============================================

log_info "Clonage du dépôt Git (branche: $GIT_BRANCH)..."

pct exec "$CTID" -- bash -c "cat > /tmp/git-clone.sh << 'CLONESCRIPT'
#!/bin/bash
set -e
GIT_URL=\"\$1\"
GIT_BRANCH=\"\$2\"
GIT_ORIGIN=\"\$3\"

git clone --branch \"\$GIT_BRANCH\" --single-branch \"\$GIT_URL\" /home/poker/app
cd /home/poker/app
git remote set-url origin \"\$GIT_ORIGIN\"
CLONESCRIPT
chmod +x /tmp/git-clone.sh"

GIT_REPO_AUTH_B64=$(echo -n "$GIT_REPO_AUTH" | base64 -w0)
GIT_BRANCH_B64=$(echo -n "$GIT_BRANCH" | base64 -w0)
GIT_REPO_B64=$(echo -n "$GIT_REPO" | base64 -w0)

pct exec "$CTID" -- su - poker -c "
    /tmp/git-clone.sh \"\$(echo '$GIT_REPO_AUTH_B64' | base64 -d)\" \"\$(echo '$GIT_BRANCH_B64' | base64 -d)\" \"\$(echo '$GIT_REPO_B64' | base64 -d)\"
"

pct exec "$CTID" -- rm -f /tmp/git-clone.sh

log_success "Dépôt cloné"

# ============================================
# INSTALLATION DE L'APPLICATION
# ============================================

log_info "Installation des dépendances npm..."

pct exec "$CTID" -- su - poker -c "
    cd /home/poker/app
    npm install
"

log_success "Dépendances npm installées"

log_info "Build de l'application..."

pct exec "$CTID" -- su - poker -c "
    cd /home/poker/app
    npm run build
    # Copier les fichiers statiques pour le mode standalone
    cp -r public .next/standalone/
    cp -r .next/static .next/standalone/.next/
"

log_success "Application buildée"

# ============================================
# CRÉATION DES RÉPERTOIRES DATA
# ============================================

log_info "Configuration des répertoires de données..."

pct exec "$CTID" -- bash -c "
    mkdir -p /home/poker/app/data
    mkdir -p /home/poker/app/public/uploads/users
    chown -R poker:poker /home/poker/app/data
    chown -R poker:poker /home/poker/app/public/uploads
    chmod 755 /home/poker
    chmod -R 755 /home/poker/app/public
"

log_success "Répertoires configurés"

# ============================================
# RÉCUPÉRATION DE L'IP
# ============================================

sleep 3
CONTAINER_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
log_info "IP du conteneur: $CONTAINER_IP"

# ============================================
# CONFIGURATION DES VARIABLES D'ENVIRONNEMENT
# ============================================

log_info "Configuration de l'environnement..."

pct exec "$CTID" -- bash -c "cat > /home/poker/app/.env << EOF
NODE_ENV=production
PORT=${SERVER_PORT}
APP_URL=http://${CONTAINER_IP}
CORS_ORIGINS=http://${CONTAINER_IP},http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=
# nginx local = 1 seul proxy de confiance devant Node (sinon tous les clients ont l'IP 127.0.0.1 et les limites deviennent globales)
TRUST_PROXY=1
MAX_PARTICIPANTS_PER_ROOM=50
EOF
chown poker:poker /home/poker/app/.env"

log_success "Environnement configuré"

# ============================================
# CRÉATION DES SERVICES SYSTEMD
# ============================================

log_info "Création des services systemd..."

# Service backend
pct exec "$CTID" -- bash -c "cat > /etc/systemd/system/planning-poker.service << EOF
[Unit]
Description=Planning Poker Backend (WebSocket Server)
After=network.target

[Service]
Type=simple
User=poker
Group=poker
WorkingDirectory=/home/poker/app
EnvironmentFile=/home/poker/app/.env
ExecStart=/usr/bin/node /home/poker/app/dist/server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=planning-poker-server

[Install]
WantedBy=multi-user.target
EOF"

# Service frontend
pct exec "$CTID" -- bash -c "cat > /etc/systemd/system/planning-poker-web.service << EOF
[Unit]
Description=Planning Poker Frontend (Next.js)
After=network.target planning-poker.service
Requires=planning-poker.service

[Service]
Type=simple
User=poker
Group=poker
WorkingDirectory=/home/poker/app/.next/standalone
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
ExecStart=/usr/bin/node /home/poker/app/.next/standalone/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=planning-poker-web

[Install]
WantedBy=multi-user.target
EOF"

pct exec "$CTID" -- bash -c "
    systemctl daemon-reload
    systemctl enable planning-poker.service
    systemctl enable planning-poker-web.service
    systemctl start planning-poker.service
    sleep 2
    systemctl start planning-poker-web.service
"

log_success "Services systemd créés et démarrés"

# ============================================
# INSTALLATION DE NGINX
# ============================================

log_info "Installation de Nginx..."

pct exec "$CTID" -- apt-get install -y nginx

# Configuration Nginx via base64 pour éviter les problèmes d'échappement
NGINX_CONFIG='upstream nextjs {
    server 127.0.0.1:'"${APP_PORT}"';
}

upstream socketio {
    server 127.0.0.1:'"${SERVER_PORT}"';
}

server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '\''upgrade'\'';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://socketio;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '\''upgrade'\'';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location /uploads/ {
        alias /home/poker/app/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /images/ {
        alias /home/poker/app/public/images/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}'

NGINX_B64=$(echo "$NGINX_CONFIG" | base64 -w0)

pct exec "$CTID" -- bash -c "
    echo '$NGINX_B64' | base64 -d > /etc/nginx/sites-available/planning-poker
    ln -sf /etc/nginx/sites-available/planning-poker /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx && systemctl enable nginx
"

log_success "Nginx installé et configuré"

# ============================================
# SCRIPTS UTILITAIRES
# ============================================

log_info "Création des commandes utilitaires..."

# Script 'update'
UPDATE_SCRIPT='#!/bin/bash
set -e

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
NC="\033[0m"

FORCE=false
SKIP_CONFIRM=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force) FORCE=true; SKIP_CONFIRM=true; shift ;;
        -y|--yes) SKIP_CONFIRM=true; shift ;;
        *) shift ;;
    esac
done

# Fonction pour forcer l arret des services
force_stop_services() {
    echo -e "${BLUE}[INFO]${NC} Arret des services..."

    # Essayer l arret normal d abord
    sudo systemctl stop planning-poker-web.service 2>/dev/null &
    sudo systemctl stop planning-poker.service 2>/dev/null &

    # Attendre max 5 secondes
    sleep 5

    # Si les services tournent encore, forcer l arret
    if systemctl is-active --quiet planning-poker-web.service 2>/dev/null; then
        echo -e "${YELLOW}[WARN]${NC} Force kill planning-poker-web..."
        sudo systemctl kill -s SIGKILL planning-poker-web.service 2>/dev/null || true
    fi

    if systemctl is-active --quiet planning-poker.service 2>/dev/null; then
        echo -e "${YELLOW}[WARN]${NC} Force kill planning-poker..."
        sudo systemctl kill -s SIGKILL planning-poker.service 2>/dev/null || true
    fi

    # Tuer tous les processus node restants de l app
    pkill -9 -f "/home/poker/app" 2>/dev/null || true

    sleep 1
    echo -e "${GREEN}[OK]${NC} Services arretes"
}

echo ""
echo -e "${CYAN}Planning Poker - Mise a jour${NC}"
echo ""

APP_DIR="/home/poker/app"
cd $APP_DIR

echo -e "${YELLOW}Version actuelle:${NC}"
git log -1 --format="  %h - %s (%cr)"
echo ""

echo -e "${BLUE}[INFO]${NC} Verification des mises a jour..."
git fetch origin

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" = false ]; then
    echo -e "${GREEN}[OK]${NC} L application est deja a jour!"
    exit 0
fi

if [ "$LOCAL" != "$REMOTE" ]; then
    echo ""
    echo -e "${YELLOW}Nouveaux commits disponibles:${NC}"
    git log HEAD..@{u} --format="  %h - %s (%cr)"
    echo ""
fi

if [ "$SKIP_CONFIRM" = false ]; then
    read -p "Voulez-vous mettre a jour? (O/n): " CONFIRM
    CONFIRM=${CONFIRM:-O}
    if [[ ! "$CONFIRM" =~ ^[OoYy]$ ]]; then
        echo "Mise a jour annulee."
        exit 0
    fi
fi

echo ""

echo -e "${BLUE}[INFO]${NC} Backup de la base de donnees..."
if [ -f data/pokerplanning.db ]; then
    BACKUP_NAME="pokerplanning_$(date +%Y%m%d_%H%M%S).db"
    cp data/pokerplanning.db "data/$BACKUP_NAME"
    echo -e "${GREEN}[OK]${NC} Backup cree: $BACKUP_NAME"
fi

force_stop_services

echo -e "${BLUE}[INFO]${NC} Telechargement des mises a jour..."
git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)

echo -e "${BLUE}[INFO]${NC} Installation des dependances..."
npm install

echo -e "${BLUE}[INFO]${NC} Build de l application..."
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

echo -e "${BLUE}[INFO]${NC} Redemarrage des services..."
sudo systemctl start planning-poker.service
sleep 2
sudo systemctl start planning-poker-web.service

echo ""
echo -e "${GREEN}Mise a jour terminee!${NC}"
echo ""
git log -1 --format="  %h - %s (%cr)"
echo ""
'

# Script 'status'
STATUS_SCRIPT='#!/bin/bash

CYAN="\033[0;36m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo ""
echo -e "${CYAN}Planning Poker - Status${NC}"
echo ""

echo -e "${YELLOW}Version:${NC}"
cd /home/poker/app 2>/dev/null && git log -1 --format="  %h - %s (%cr)" || echo "  Non disponible"
echo ""

echo -e "${YELLOW}Services:${NC}"

if systemctl is-active --quiet planning-poker.service; then
    echo -e "  Backend (WebSocket):  ${GREEN}Running${NC}"
else
    echo -e "  Backend (WebSocket):  ${RED}Stopped${NC}"
fi

if systemctl is-active --quiet planning-poker-web.service; then
    echo -e "  Frontend (Next.js):   ${GREEN}Running${NC}"
else
    echo -e "  Frontend (Next.js):   ${RED}Stopped${NC}"
fi

if systemctl is-active --quiet nginx; then
    echo -e "  Nginx:                ${GREEN}Running${NC}"
else
    echo -e "  Nginx:                ${RED}Stopped${NC}"
fi

echo ""

echo -e "${YELLOW}Ressources:${NC}"
free -h | awk "/^Mem:/ {print \"  RAM: \" \$3 \"/\" \$2}"
df -h /home/poker/app 2>/dev/null | awk "NR==2 {print \"  Disk: \" \$3 \"/\" \$2 \" (\" \$5 \" used)\"}" || echo "  Disk: N/A"
echo ""

echo -e "${YELLOW}Base de donnees:${NC}"
if [ -f /home/poker/app/data/pokerplanning.db ]; then
    DB_SIZE=$(du -h /home/poker/app/data/pokerplanning.db | cut -f1)
    echo "  Taille: $DB_SIZE"
    BACKUP_COUNT=$(ls -1 /home/poker/app/data/pokerplanning_*.db 2>/dev/null | wc -l)
    echo "  Backups: $BACKUP_COUNT"
else
    echo "  Non initialisee"
fi
echo ""
'

# Script 'logs'
LOGS_SCRIPT='#!/bin/bash

if [ "$1" = "web" ] || [ "$1" = "frontend" ]; then
    journalctl -u planning-poker-web.service -f
elif [ "$1" = "server" ] || [ "$1" = "backend" ]; then
    journalctl -u planning-poker.service -f
else
    echo "Usage: logs [web|server]"
    echo ""
    echo "  logs web     - Logs du frontend Next.js"
    echo "  logs server  - Logs du backend WebSocket"
    echo ""
    echo "Affichage des deux services..."
    echo ""
    journalctl -u planning-poker.service -u planning-poker-web.service -f
fi
'

UPDATE_B64=$(echo "$UPDATE_SCRIPT" | base64 -w0)
STATUS_B64=$(echo "$STATUS_SCRIPT" | base64 -w0)
LOGS_B64=$(echo "$LOGS_SCRIPT" | base64 -w0)

pct exec "$CTID" -- bash -c "echo '$UPDATE_B64' | base64 -d > /usr/local/bin/update && chmod +x /usr/local/bin/update"
pct exec "$CTID" -- bash -c "echo '$STATUS_B64' | base64 -d > /usr/local/bin/status && chmod +x /usr/local/bin/status"
pct exec "$CTID" -- bash -c "echo '$LOGS_B64' | base64 -d > /usr/local/bin/logs && chmod +x /usr/local/bin/logs"

# Sudoers pour les services
SUDOERS_CONTENT='ALL ALL=(ALL) NOPASSWD: /bin/systemctl stop planning-poker.service
ALL ALL=(ALL) NOPASSWD: /bin/systemctl stop planning-poker-web.service
ALL ALL=(ALL) NOPASSWD: /bin/systemctl start planning-poker.service
ALL ALL=(ALL) NOPASSWD: /bin/systemctl start planning-poker-web.service
ALL ALL=(ALL) NOPASSWD: /bin/systemctl restart planning-poker.service
ALL ALL=(ALL) NOPASSWD: /bin/systemctl restart planning-poker-web.service'

SUDOERS_B64=$(echo "$SUDOERS_CONTENT" | base64 -w0)
pct exec "$CTID" -- bash -c "mkdir -p /etc/sudoers.d && echo '$SUDOERS_B64' | base64 -d > /etc/sudoers.d/planning-poker && chmod 440 /etc/sudoers.d/planning-poker"

log_success "Commandes utilitaires creees (update, status, logs)"

# ============================================
# RÉSUMÉ
# ============================================

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         INSTALLATION TERMINÉE AVEC SUCCÈS                 ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Conteneur LXC ID: ${CYAN}${CTID}${NC}"
echo -e "  Hostname:         ${CYAN}${CT_HOSTNAME}${NC}"
echo -e "  IP:               ${CYAN}${CONTAINER_IP}${NC}"
echo ""
echo -e "  ${GREEN}Application accessible sur: ${CYAN}http://${CONTAINER_IP}${NC}"
echo ""
echo -e "${YELLOW}Services systemd:${NC}"
echo -e "  planning-poker.service     (Backend WebSocket :${SERVER_PORT})"
echo -e "  planning-poker-web.service (Frontend Next.js :${APP_PORT})"
echo ""
echo -e "${YELLOW}Commandes disponibles dans le conteneur:${NC}"
echo -e "  ${CYAN}update${NC}         Mettre à jour l'application"
echo -e "  ${CYAN}status${NC}         Voir l'état de l'application"
echo -e "  ${CYAN}logs${NC}           Voir les logs (logs web | logs server)"
echo ""
echo -e "${YELLOW}Depuis Proxmox:${NC}"
echo -e "  ${CYAN}pct enter ${CTID}${NC}   Entrer dans le conteneur"
echo ""
