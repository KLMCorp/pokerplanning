# Planning Poker

Application web de Planning Poker en temps reel pour les equipes agiles.

**Demo en ligne** : [https://planningpoker.klmcorp.fr](https://planningpoker.klmcorp.fr)

## Fonctionnalites principales

- **Rooms en temps reel** avec code unique a 6 caracteres
- **Systeme de comptes** avec authentification par email ou pseudo
- **Protection par mot de passe** optionnelle pour les rooms
- **Personnalisation complete** : cartes, table de poker, avatars, couleur de carte
- **Parametres du deck de la room** (DeckSettings, PO) : dos commun et recto de chaque carte, propres a la room
- **Chronometre PO** pour timeboxer les discussions (configurable 10s a 60min)
- **Transfert de role PO** vers un autre participant
- **Layout drag & drop** avec support grands ecrans (jusqu'a 3 panneaux par ligne)
- **Gestion de backlog** personnel avec priorites, import dans les rooms et suivi des estimations
- **Historique des sessions** pour les utilisateurs connectes
- **Envoi d'emojis** animes entre participants
- **Internationalisation** (Francais / Anglais)
- **Theme sombre/clair**
- **Dashboard admin** avec chemin secret configurable
- **Reset de mot de passe** par email + code a 6 chiffres (1 h, 5 essais, message d'echec unique, toutes les sessions revoquees)
- **Fermeture des rooms** : room fermee pour tous quand le PO part (ou ne revient pas dans le delai de grace), a l'expiration du TTL (notifiee) ou quand elle est vide
- **Easter egg Konami Code** (rendu personnalisable)

## Securite : premier deploiement

> ⚠️ Securite : le premier compte inscrit avec l'email `ADMIN_EMAIL` obtient les droits admin. L'adresse n'est pas verifiee. Creez ce compte **immediatement apres le premier deploiement, avant toute exposition publique**. Sinon, n'importe qui connaissant ou devinant l'adresse peut s'approprier l'administration.

Derriere un reverse proxy, definir aussi `TRUST_PROXY` (voir Configuration) : sans lui, tous les clients partagent l'IP du proxy et les limites deviennent globales.

## Installation

```bash
# Installation des dependances
npm install

# Lancement en developpement
npm run dev

# Build de production
npm run build
npm start
```

## Configuration

Copier `.env.example` en `.env` et adapter les valeurs :

```env
# URLs
APP_URL=http://localhost:3000
# URL du serveur Socket.IO vue par le navigateur, lue au lancement (optionnelle).
# Vide : meme hote que la page et port 3001 si la page est servie en http sur le port 3000,
# sinon origine de la page (cas reverse proxy).
# SOCKET_URL=http://192.168.1.10:3001

# Serveur
PORT=3001
DATA_DIR=./data

# Admin (email autorisant l'acces au dashboard admin)
ADMIN_EMAIL=admin@example.com
# Chemin secret pour la page admin (optionnel, masque /admin)
# Figé au build (rebuild pour le changer) ; en Docker : build arg, visible dans `docker history`
# ADMIN_SECRET_PATH=/secret-dashboard-42

# Rooms
ROOM_TTL_MINUTES=180
MAX_PARTICIPANTS_PER_ROOM=0
# Plafond global de rooms actives (0 = illimite, defaut)
# MAX_ACTIVE_ROOMS=0
# Creations de room par IP et par minute (defaut 10, 0 = pas de limite)
# ROOM_CREATE_RATE_LIMIT_PER_MINUTE=10
# Delai de grace (ms) apres une deconnexion avant retrait de la room (defaut 30000)
# RECONNECT_GRACE_PERIOD_MS=30000

# Uploads d'images (avatar, cartes, table), lu au lancement par le serveur et l'interface
# ALLOW_UPLOADS=true

# SMTP (pour reset mot de passe)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@example.com

# CORS (optionnel, par defaut APP_URL + localhost)
# CORS_ORIGINS=https://example.com,http://localhost:3000

# Reseau / proxy
# Nombre de reverse proxies de confiance devant le serveur Node (defaut 0).
# X-Forwarded-For est lu depuis la droite : 1 = un nginx devant (nginx.conf.example),
# 2 = CDN + nginx. 'true' est accepte et vaut 1. Obligatoire derriere un proxy.
# TRUST_PROXY=1
# Connexions WebSocket simultanees max par IP (defaut 20, 0 = illimite)
# MAX_WS_CONNECTIONS_PER_IP=20

# Build uniquement (valeur figee par `next build`) : URL interne d'Express utilisee par Next
# pour servir /uploads sans nginx. Defaut : http://127.0.0.1:3001
# UPLOADS_UPSTREAM_URL=http://127.0.0.1:3001
```

| Variable | Defaut | Description |
|----------|--------|-------------|
| `TRUST_PROXY` | `0` | Nombre de proxys de confiance (`true` = 1). Lecture de `X-Forwarded-For` depuis la droite |
| `MAX_WS_CONNECTIONS_PER_IP` | `20` | Connexions WebSocket simultanees par IP (`0` = illimite) |
| `ROOM_CREATE_RATE_LIMIT_PER_MINUTE` | `10` | Creations de room par IP et par minute (`0` = illimite) |
| `MAX_ACTIVE_ROOMS` | `0` | Plafond global de rooms actives (`0` = illimite) |
| `RECONNECT_GRACE_PERIOD_MS` | `30000` | Delai de grace apres deconnexion avant retrait de la room |
| `UPLOADS_UPSTREAM_URL` | `http://127.0.0.1:3001` | Build : cible du rewrite Next `/uploads` |
| `SOCKET_URL` | - | Lancement : URL du serveur Socket.IO vue par les navigateurs (`http(s)://hote[:port]`, sans chemin ; `ws(s)://` accepte). Vide : meme hote et port 3001 si la page est en http sur le port 3000, sinon origine de la page (reverse proxy). Valeur invalide ignoree (avertissement dans les logs). Proxmox : voir la reserve ci-dessous |
| `NEXT_PUBLIC_SOCKET_URL` | - | Build (compatibilite, installations Proxmox) : meme role, figee par `next build` ; `SOCKET_URL` est prioritaire. En Docker, passee au lancement elle est recopiee dans `SOCKET_URL` |
| `ALLOW_UPLOADS` | `true` | Lancement : `false` desactive tous les uploads d'images (serveur et interface). Proxmox : voir la reserve ci-dessous |
| `STARTUP_TIMEOUT_SECONDS` | `60` | Docker : attente maximale de `/health` avant le lancement de Next |
| `GIT_REPO` / `GIT_BRANCH` | - / `main` | Build Docker via `Dockerfile` (clone Git) ; `GIT_REPO` obligatoire |

Reserve Proxmox (systemd) : le service Next (`planning-poker-web.service`) ne lit pas `.env` et `next build` n'inline pas `SOCKET_URL`. `SOCKET_URL` posee dans `.env` est donc sans effet pour l'interface, meme apres rebuild ; `ALLOW_UPLOADS` n'y est prise en compte par l'interface qu'au build (`proxmox-update.sh`), pas a un simple redemarrage (le serveur Socket.IO, lui, relit `.env`). Sur Proxmox, l'interface utilise l'origine de la page (nginx route `/socket.io/`), ce qui convient dans le cas general. Pour forcer une URL : soit `NEXT_PUBLIC_SOCKET_URL=...` dans `.env` puis rebuild, soit `Environment=SOCKET_URL=...` (et/ou `Environment=ALLOW_UPLOADS=...`) dans ce service systemd, sans y ajouter `EnvironmentFile=.env` (son `PORT=3001` remplacerait le port 3000).

La limite d'upload est fixee a 2 Mo (aucune variable de configuration).

## Scripts npm

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lancement en developpement (serveur + client) |
| `npm run dev:client` | Lancement du client Next.js seul |
| `npm run dev:server` | Lancement du serveur Socket.IO seul |
| `npm run build` | Build de production (serveur + client) |
| `npm start` | Demarrage en production |
| `npm run lint` | Verification ESLint |
| `npm run typecheck` | Verification TypeScript |
| `npm test` | Tests en mode watch |
| `npm run test:run` | Tests en mode CI (une seule passe) |
| `npm run test:coverage` | Tests avec rapport de couverture |

## Stack technique

- **Frontend** : Next.js 16, React 19, TypeScript 7, Tailwind CSS 4
- **Backend** : Node.js 24, Express 5, Socket.IO 4
- **Base de donnees** : SQLite via better-sqlite3 (mode WAL)
- **Temps reel** : WebSocket via Socket.IO
- **Securite** : Helmet, bcrypt, rate limiting, CSP, HSTS, session tokens
- **i18n** : next-intl (FR/EN)
- **Tests** : Vitest

## Structure du projet

```
src/
  app/              # Pages Next.js (App Router)
    page.tsx        # Accueil
    account/        # Gestion du compte
    admin/          # Dashboard admin
    backlog/        # Gestion du backlog
    profile/        # Profil utilisateur
    room/[roomId]/  # Page room dynamique
  components/       # 31 composants React
  contexts/         # 5 contextes (Socket, Auth, Theme, Locale, RuntimeConfig)
  hooks/            # Hook useRoom
  lib/              # Utilitaires (avatars, cartes, deck, layout, config runtime, utils)
  types/            # Definitions TypeScript
  i18n/             # Internationalisation (messages FR/EN)

server/
  index.ts          # Point d'entree Express + Socket.IO
  socket/
    handlers.ts     # Handlers Socket.IO (~2500 lignes)
    safeHandler.ts  # Wrapper createSafeOn + table EVENT_SHAPES
  store/
    roomStore.ts    # Gestion des rooms en memoire
    userStore.ts    # Gestion SQLite des utilisateurs
  utils/
    mailer.ts       # Service d'envoi d'emails
    clientIp.ts     # Resolution de l'IP client (TRUST_PROXY)
    env.ts          # Lecture des variables d'environnement numeriques
    uploads.ts      # Suppression des uploads (room, compte)

next.rewrites.js    # Rewrites Next (admin secret path, fallback /uploads)

test/               # Tests Vitest
  config/           # Tests de configuration (rewrites Next)
  lib/              # Tests utilitaires
  server/
    socket/         # Tests handlers Socket.IO
    store/          # Tests stores (room, user)
    utils/          # Tests utilitaires serveur

docs/               # Documentation detaillee
```

## Docker

### Depuis Docker Hub

L'image [klmcorp/pokerplanning](https://hub.docker.com/r/klmcorp/pokerplanning) est multi-architecture (`linux/amd64` et `linux/arm64` : serveurs x86, Raspberry Pi 4/5, Mac Apple Silicon) pour toutes les versions publiees apres `v1.0.0`. Tags : `vX.Y.Z` (une version) et `latest` (derniere version publiee ; absent tant qu'aucune version n'a ete publiee avec le job `Release`). L'ancienne image `v1.0.0` est amd64 seulement et a `http://localhost:3001` fige dans le code client : ne plus l'utiliser.

La meme image fonctionne partout : l'URL du serveur Socket.IO et l'activation des uploads se reglent **au lancement** (`-e`), sans rebuild.

```bash
docker run -d \
  --name poker-planning \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -e APP_URL=http://192.168.1.10:3000 \
  -e SOCKET_URL=http://192.168.1.10:3001 \
  -v poker-data:/app/data \
  -v poker-uploads:/app/public/uploads \
  klmcorp/pokerplanning:latest
```

- `APP_URL` : adresse publique de la page, utilisee dans les emails (lien de reinitialisation du mot de passe).
- `SOCKET_URL` : adresse du port 3001 **telle que les navigateurs des participants la joignent** (IP ou nom DNS du serveur, jamais `localhost` sauf usage sur la machine elle-meme). Si les ports sont publies a l'identique (`3000:3000` et `3001:3001`) et la page servie en http, elle peut etre omise : le navigateur utilise le meme hote que la page avec le port 3001. Elle est obligatoire si les ports publies sont differents.
- Page servie en `https` : `SOCKET_URL` doit etre en `https` (un navigateur bloque `ws://` depuis une page `https`), en pratique derriere un reverse proxy.
- Derriere un reverse proxy qui route `/socket.io/` vers le port 3001 (`nginx.conf.example`) : ne pas definir `SOCKET_URL`, le navigateur utilise l'origine de la page. Exception : si le proxy sert la page en http sur le port 3000, definir `SOCKET_URL` avec l'origine de la page (ex. `http://poker.lan:3000`).
- `-e ALLOW_UPLOADS=false` desactive les uploads d'images (serveur et interface).
- Compatibilite : `-e NEXT_PUBLIC_SOCKET_URL=...` (anciennes instructions) est accepte et recopie dans `SOCKET_URL`. Si vous aviez `-e NEXT_PUBLIC_SOCKET_URL` pointant sur `localhost:3001`, **retirez-le** : il empeche les autres postes de se connecter (un avertissement est affiche dans les logs).

Compatible Podman :

```bash
podman run -d \
  --name poker-planning \
  -p 3000:3000 \
  -p 3001:3001 \
  -e APP_URL=http://192.168.1.10:3000 \
  -e SOCKET_URL=http://192.168.1.10:3001 \
  -v poker-data:/app/data:Z \
  -v poker-uploads:/app/public/uploads:Z \
  klmcorp/pokerplanning:latest
```

L'application est ensuite accessible sur `http://<ip-ou-dns>:3000`.

### Build depuis les sources

```bash
# Build et lancement (clone GIT_REPO, branche GIT_BRANCH, defaut main)
docker compose up -d --build

# Ou avec Dockerfile.local (sans cloner depuis Git)
docker build -f Dockerfile.local -t pokerplanning:local .
```

`docker compose` construit l'image avec `Dockerfile`, qui **clone** le depot : definir `GIT_REPO` (obligatoire) et eventuellement `GIT_BRANCH` (defaut `main`) dans `.env`. `SOCKET_URL` et `ALLOW_UPLOADS` du `.env` sont transmises au lancement. Pour construire depuis les sources locales, utiliser `Dockerfile.local` (utilise aussi par la CI et la publication).

Les images uploadees (`/uploads/...`) sont servies par Express (port 3001). Sans nginx, Next les relaie via un rewrite `fallback` vers `UPLOADS_UPSTREAM_URL` (argument de build, defaut `http://127.0.0.1:3001`) : en production Next ne voit pas les fichiers ajoutes apres son demarrage. Derriere nginx, `/uploads/` est route directement vers le port 3001 (voir `nginx.conf.example`).

### Publier une version

L'image Docker Hub est publiee par le job OneDev `Release`, declenche par un tag `vX.Y.Z` pose sur un commit de `main` :

```bash
git tag v1.2.0
git push origin v1.2.0
```

Le job execute lint, typecheck et tests, construit l'image pour `linux/amd64` et `linux/arm64`, puis la pousse sous `klmcorp/pokerplanning:v1.2.0` et `klmcorp/pokerplanning:latest`. La version affichee dans l'application est celle du tag. Les tags de pre-version (`v1.2.0-rc1`) ne declenchent pas de publication. En cas d'echec (configuration de l'executeur), corriger puis relancer le meme build depuis OneDev (Rebuild), sans re-tagger.

Prerequis (une fois, administrateur OneDev, Administration > Job Executors) :
- Si aucun executeur n'est configure (Administration > Job Executors vide), aucun job (`CI`, `Build` ni `Release`) ne tourne : creer d'abord un executeur **Server Docker** general pour les jobs `CI` et `Build` (sans Registry Login), puis l'executeur dedie `Release` decrit ci-dessous ;
- un executeur **dedie** de type **Server Docker** ou **Remote Docker** (l'etape `Build Image` ne tourne pas sur Kubernetes), place **en tete** de la liste, avec « Applicable Jobs » restreint au projet PlanningPoker et au job `Release` ;
- sur cet executeur seulement, **Registry Logins** : Registry URL vide (Docker Hub), User Name = compte autorise a pousser sur `klmcorp`, Password = access token Docker Hub limite a ce depot (Read & Write). Ne pas mettre ce login sur l'executeur des jobs `Build`/`CI` : tout job de toute branche pourrait alors pousser l'image ;
- champ **Docker Builder** de cet executeur : un builder buildx en driver `docker-container` (OneDev cree `onedev` automatiquement ; sinon, sur l'hote : `docker buildx create --name onedev --driver docker-container --bootstrap`) ;
- sur l'hote Docker de l'executeur : plugin buildx et emulation des architectures (`docker run --privileged --rm tonistiigi/binfmt --install all`).

Publication manuelle (secours, depuis un poste disposant de Docker buildx) :

```bash
docker run --privileged --rm tonistiigi/binfmt --install all    # une fois, hote Linux sans emulation
docker buildx create --name pokerplanning --driver docker-container --use --bootstrap   # une fois
docker login -u <compte-docker-hub>
docker buildx build -f Dockerfile.local \
  --platform linux/amd64,linux/arm64 \
  --build-arg APP_VERSION=1.2.0 \
  -t klmcorp/pokerplanning:v1.2.0 -t klmcorp/pokerplanning:latest \
  --push .
```

Sur macOS (Homebrew + colima) : `brew install docker-buildx`, puis verifier `docker buildx version`. Si la commande reste inconnue, ajouter `"cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"]` a `~/.docker/config.json` (ou `mkdir -p ~/.docker/cli-plugins && ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx`). La partie emulee du build prend environ 10 minutes.

### Mise a jour d'une installation Proxmox existante

Le projet exige **Node 24** (`engines` : `^24.0.0 || >=26.0.0`). `scripts/proxmox-install.sh` installe Node 24 (nodesource), mais `scripts/proxmox-update.sh` ne met **pas** Node a jour : les conteneurs installes avec une version anterieure restent en Node 22. Avant de mettre a jour l'application, passer le conteneur en Node 24 (depot nodesource `node_24.x`, puis `apt-get install -y nodejs`). `proxmox-update.sh` refuse de continuer si `node -v` est inferieur a 24 (option `--force` pour passer outre, deconseille).

`proxmox-update.sh` ajoute automatiquement `TRUST_PROXY=1` dans `/home/poker/app/.env` s'il manque (le nginx local est l'unique proxy de confiance ; sans cette variable, tous les clients ont l'IP 127.0.0.1 et les limites de connexions et de creation de room deviennent globales), avant le redemarrage des services. Une valeur deja presente n'est pas modifiee. Les nouvelles installations l'ecrivent deja.

Sur une installation Proxmox, `SOCKET_URL` dans `/home/poker/app/.env` est sans effet pour l'interface (utiliser `NEXT_PUBLIC_SOCKET_URL` + rebuild, ou `Environment=` sur le service web) ; `ALLOW_UPLOADS` modifiee dans ce fichier ne s'applique a l'interface qu'apres une mise a jour (rebuild), voir la reserve sous le tableau des variables.

L'image utilise un build multi-stage (deps, prod-deps, builder, runner) avec Node.js 24 Alpine.

- **Ports** : 3000 (Next.js) + 3001 (Socket.IO)
- **Volumes** : `poker-data` (base SQLite), `poker-uploads` (images uploadees)
- **Healthcheck** : `GET http://127.0.0.1:3001/health` et `GET http://127.0.0.1:3000/`
- **Supervision** : Next n'est lance qu'une fois `/health` joignable (`STARTUP_TIMEOUT_SECONDS`, defaut 60 s) ; si l'un des deux processus s'arrete, le conteneur s'arrete (code 1) et `restart: unless-stopped` le relance ; `docker stop` arrete proprement en quelques secondes (au plus 7 s)
- **Utilisateur** : `nextjs` (uid 1001, groupe `nodejs` gid 1001). Un volume deja peuple par root se corrige avec `docker run --rm -v poker-data:/d alpine chown -R 1001:1001 /d`

## Securite

- **Authentification** : bcrypt pour le hashage, session tokens avec expiration 30 jours
- **Headers HTTP** : Helmet, CSP strict, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy
- **Rate limiting** : par IP (HTTP) et par socket (WebSocket) sur tous les handlers
- **Uploads** : validation MIME + magic bytes, limite 2 Mo, desactivable via `ALLOW_UPLOADS=false`
- **Rooms** : mots de passe hashes avec salt, comparaison constant-time
- **Reset mot de passe** : email + code 6 chiffres (hache sha256 en base), 1 h, 5 essais par code, message d'echec unique, limites par IP (3 demandes/min) et par email (3/min, 5/h, 10/24 h), sessions revoquees apres un reset reussi
- **IP client** : `TRUST_PROXY` (nombre de proxys de confiance), utilisee pour les limites WebSocket et de creation de room
- **Admin** : chemin secret configurable via `ADMIN_SECRET_PATH` ; voir l'avertissement `ADMIN_EMAIL` ci-dessus

## Documentation

Voir le dossier `docs/` pour la documentation complete :

- [Vue d'ensemble](docs/01_README.md)
- [Fonctionnalites](docs/02_FONCTIONNALITES.md)
- [Cartes](docs/03_CARTES.md)
- [UX/UI](docs/04_UX_UI.md)
- [Regles metier](docs/05_REGLES_METIER.md)
- [Stack technique](docs/06_TECH_STACK.md)
- [Modeles de donnees](docs/07_MODELES_DE_DONNEES.md)
- [Upload d'images](docs/08_UPLOAD_IMAGES.md)

## Personnalisation du Konami Code

L'easter egg Konami Code (`↑ ↑ ↓ ↓ ← → ← → B A`) est toujours declenche par la meme sequence, mais son rendu visuel est entierement personnalisable via les props du composant `KonamiEasterEgg` dans `src/components/ClientProviders.tsx` :

```tsx
<KonamiEasterEgg
  title="Mon Equipe"            // Texte principal (defaut: "KLM Corp")
  emojis={['🎉', '🚀', '⭐']}  // Emojis qui tombent (defaut: chats)
  centerEmoji="🎯"              // Emoji central (defaut: 🐈‍⬛)
  dancingEmoji="🕺"             // Emoji dansant en bas (defaut: 🐈‍⬛)
  subtitle="SECRET UNLOCKED!"   // Sous-titre (defaut: "🎮 KONAMI CODE ACTIVATED! 🎮")
  itemCount={60}                // Nombre d'items tombants (defaut: 80)
  durationMs={8000}             // Duree en ms (defaut: 12000)
  dancingCount={5}              // Nombre d'emojis dansants (defaut: 7)
  emojiRatio={0.5}              // Ratio emoji vs texte, 0-1 (defaut: 0.7)
/>
```

Toutes les props sont optionnelles. Sans aucune prop, le comportement par defaut est conserve.

## Tests

```bash
# Lancer les tests (mode watch)
npm test

# Execution unique (CI)
npm run test:run

# Avec couverture
npm run test:coverage
```

Les tests s'executent en environnement `node` (pas de tests de composants : la logique client testable est dans `src/lib`). Vitest utilise un `DATA_DIR` **temporaire** (`vitest.config.ts` + `test/globalSetup.ts`) : `data/` n'est jamais modifie. Les suites Socket.IO utilisent les ports 3094 a 3099.

## CI

- **OneDev** (`.onedev-buildspec.yml`, depot de reference) : job `CI` (pull request vers `main`), job `Build` (push sur `main`), job `Release` (tag `vX.Y.Z` hors pre-versions : publication Docker Hub multi-arch, voir [Publier une version](#publier-une-version)).
- **GitHub Actions** (`.github/workflows`, actifs seulement sur un miroir GitHub) : `ci.yml` (PR) et `build.yml` (push `main`) : lint, typecheck, tests, build ; `build.yml` construit aussi l'image avec `Dockerfile.local`. `release.yml` (tag `vX.Y.Z`) : validation puis publication multi-arch sur ghcr.io, et sur Docker Hub seulement si la variable de depot `PUBLISH_DOCKERHUB` vaut `true` (secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`) ; a laisser desactive si OneDev publie deja.
- Garde-fou **TypeScript 7** apres `npm ci` : `npx tsc -v | grep -q "Version 7"` (deux paquets declarent le binaire `tsc` ; l'ordre d'installation de npm decide lequel est utilise). Present dans tous les jobs OneDev et GitHub.

## Licence

MIT
