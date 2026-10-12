# Stack technique

## Frontend

### Framework
- **Next.js 16.4.0** avec App Router
- **React 19.3.0** avec hooks
- **TypeScript 7.0.2** pour le typage statique (API TypeScript 6 conservée pour typescript-eslint)

### Styling
- **Tailwind CSS 4.3.3** pour le styling utilitaire
- **PostCSS 8.5.29** pour le traitement CSS
- Variables CSS personnalisées pour les couleurs du thème

### Gestion d'état
- **React Context** pour l'état global
  - `SocketContext` : connexion WebSocket, état room et actions
  - `AuthContext` : authentification et compte utilisateur
  - `ThemeContext` : thème sombre/clair
  - `LocaleContext` : langue (FR/EN)
  - `RuntimeConfigContext` : config runtime (URL Socket.IO, uploads) reçue du layout serveur
- **Hooks personnalisés** pour la logique métier
  - `useRoom` : données et actions de la room

### Communication temps réel
- **Socket.IO Client 4.8.4** pour les WebSockets

### Internationalisation
- **next-intl 4.14.9** pour i18n
- Messages dans `src/i18n/messages/` (en.json, fr.json)

### Tests
- **Vitest 5.0.4** avec support coverage

## Backend

### Serveur
- **Node.js 24 LTS** (Alpine Linux)
- **Express 5.3.0** pour les routes HTTP
- **TypeScript** compilé avec `tsc` (TypeScript 7) ; exécuté en dev avec tsx
- **Socket.IO Server 4.8.4** pour les WebSockets

### Sécurité
- **Helmet 8.3.0** pour les headers de sécurité (CSP)
- **CORS 2.8.6** configurable
- **bcrypt 6.0.0** pour le hachage des mots de passe
- **express-rate-limit 8.7.1** pour le rate limiting

### Stockage
- **SQLite** avec **better-sqlite3 13.0.3**
  - Mode WAL pour meilleures performances
  - Fichier : `data/pokerplanning.db`
  - Tables : users, room_histories, password_reset_tokens, session_tokens, user_backlogs
- **Rooms actives** : en mémoire (Maps JavaScript)
  - Perdues au redémarrage (comportement attendu)

### Email
- **Nodemailer 10.1.0** pour l'envoi d'emails
- Utilisé pour : reset de mot de passe

### Upload de fichiers
- **Multer 2.0.2** (disponible mais images en base64)

### Structure

```
server/
  index.ts          # Point d'entrée, config Express + Socket.IO
  socket/
    handlers.ts     # Handlers d'événements (~2500 lignes)
    safeHandler.ts  # createSafeOn + table EVENT_SHAPES
  store/
    roomStore.ts    # Gestion des rooms en mémoire
    userStore.ts    # Gestion des comptes SQLite
  utils/
    mailer.ts       # Service d'envoi d'email
    clientIp.ts     # IP du client (TRUST_PROXY)
    env.ts          # getEnvInt (lecture paresseuse)
    uploads.ts      # Suppression des uploads (room, compte)
    deckImages.ts   # URLs d'images de deck
    roomCode.ts     # Génération/validation des codes de room
next.rewrites.js    # Rewrites Next (admin secret path, fallback /uploads)
```

### Robustesse des handlers

Tous les handlers sont enregistrés via le wrapper `createSafeOn(socket)` (`server/socket/safeHandler.ts`) :
- la forme de chaque événement (données, callback, ou les deux) est décrite dans la table `EVENT_SHAPES` (une entrée par événement client : **tout nouvel événement doit y être ajouté**, le typage l'impose) ;
- payload invalide selon la forme de l'événement :
  - `data` : ignoré silencieusement ;
  - `optionalData` : remplacé par `undefined` ;
  - `ack` / `dataAck` : ack d'échec appelé (pour `room:create`, événement `error` émis) ;
- le callback (ack) est à usage unique et les exceptions synchrones et asynchrones sont capturées et loguées (réponse « Erreur serveur »).

La suppression d'une room est centralisée dans `roomStore.deleteRoomState` ; `handlers.ts` s'abonne via `setRoomRemovedListener` (notification, timers, uploads). `uncaughtException` reste fail-fast : tout timer ou intervalle serveur doit avoir son `try/catch` interne. Les clés fournies par le client (ids, valeurs de carte) sont testées avec `Object.hasOwn`.

### Adresse IP du client

`server/utils/clientIp.ts` : `TRUST_PROXY` est le **nombre de proxys de confiance** (0 par défaut ; `true` vaut 1 ; maximum 10). `X-Forwarded-For` est lu depuis la droite ; sans proxy de confiance, il est ignoré. Utilisé par les limites WebSocket/HTTP (connexions par IP, création de room, auth, uploads). Derrière nginx seul : `TRUST_PROXY=1` ; derrière CDN + nginx : `TRUST_PROXY=2`. Limite connue : le rate limit par adresse IPv6 complète reste faible face à un /64.

## Communication

### Événements Socket.IO

Liste copiée de `ClientToServerEvents` et `ServerToClientEvents` dans `src/types/index.ts`.

#### Client -> Serveur

**Authentification**
- `auth:register` - Inscription
- `auth:login` - Connexion
- `auth:reconnect` - Reconnexion après refresh (`{ accountId, sessionToken }` ; échec avec la raison `'invalid_session'`)
- `auth:logout` - Déconnexion
- `auth:getHistory` - Récupérer l'historique
- `auth:deleteRoomHistory` - Supprimer une room de l'historique
- `auth:updateDeck` - Mettre à jour le deck du compte
- `auth:uploadDeckImage` - Uploader une image de carte (compte)
- `auth:deleteDeckImage` - Supprimer une image de carte (compte)
- `auth:uploadAvatar` - Uploader un avatar
- `auth:updateTableConfig` - Mettre à jour la config table
- `auth:uploadTableImage` - Uploader une image de table
- `auth:updateRoomTtl` - Mettre à jour le TTL des rooms du compte
- `auth:updateLayoutConfig` - Sauvegarder le layout de la room
- `auth:forgotPassword` - Demande de reset (`{ email }`)
- `auth:verifyResetCode` - Vérification du code (`{ email, code }`)
- `auth:resetPassword` - Réinitialisation (`{ email, code, newPassword }`)

**Rooms**
- `room:create` - Créer une room
- `room:join` - Rejoindre une room
- `room:checkPassword` - Vérifier si mot de passe requis
- `room:leave` - Quitter la room
- `room:reconnect` - Se reconnecter à sa room après une déconnexion (`{ roomId, userId, secret }`)
- `room:close` - Fermer la room (sauvegarde historique)
- `room:updateSettings` - Modifier les paramètres de la room (PO)
- `room:transferPO` - Transférer le rôle de PO

**Items**
- `item:create` - Créer un item
- `item:update` - Modifier un item
- `item:delete` - Supprimer un item
- `item:reorder` - Réordonner un item
- `item:select` - Sélectionner l'item actif
- `item:setFinalScore` - Définir le score final

**Votes**
- `vote:start` - Démarrer le vote
- `vote:cast` - Voter
- `vote:reveal` - Révéler les votes
- `vote:reset` - Réinitialiser

**Timer (PO)**
- `timer:set` - Configurer la durée (10 s à 60 min)
- `timer:start` - Démarrer ou reprendre
- `timer:stop` - Pause
- `timer:reset` - Remettre à la durée configurée

**Deck (PO)**
- `deck:update` - Modifier le deck de la room
- `deck:uploadImage` - Uploader une image (room)

**Emojis**
- `emoji:send` - Envoyer un emoji

**Backlog**
- `backlog:getItems` - Récupérer le backlog
- `backlog:create` - Créer un item de backlog
- `backlog:update` - Modifier un item de backlog
- `backlog:delete` - Supprimer un item de backlog
- `backlog:reorder` - Réordonner un item du backlog
- `backlog:import` - Importer le backlog dans la room

**Admin**
- `admin:checkAccess` - Le compte est-il admin ?
- `admin:getAllUsers` - Liste des utilisateurs
- `admin:getAllSessions` - Sessions actives
- `admin:getAllRoomHistory` - Historiques de toutes les rooms
- `admin:getAllBacklogs` - Backlogs de tous les utilisateurs
- `admin:getStats` - Statistiques globales
- `admin:getActiveRooms` - Rooms actives (`AdminActiveRoomSummary[]`)
- `admin:deleteUser` - Supprimer un utilisateur
- `admin:revokeSession` - Révoquer une session

#### Serveur -> Client

- `room:updated` - Mise à jour de la room (émis aussi avant l'ack d'un join)
- `room:closed` - Room fermée : `{ roomId, reason: 'po_left' | 'expired' }`
- `error` - Erreur
- `emoji:received` - Emoji reçu

Déclarés dans `ServerToClientEvents` mais **non émis** par le serveur : `room:userJoined`, `room:userLeft`, `vote:cast`, `vote:revealed`, `vote:reset` (l'état passe par `room:updated`).

## Fichiers et uploads

### Stockage local
- Dossier : `public/uploads/`
- Structure : `uploads/users/{accountId}/`
- Fichiers : avatar, table, cartes

### Accès
- URLs relatives : `/uploads/users/{id}/filename.ext` (comptes) et `/uploads/{ROOMID}/filename.ext` (rooms)
- Servis par **Express** (`/uploads`, port 3001), avec `Content-Disposition: inline` et Content-Type strict
- Avec nginx : `location /uploads/` route vers le port 3001 (`nginx.conf.example`)
- Sans nginx : en production Next ne voit pas les fichiers ajoutés après son démarrage (`public/` est scanné une fois). `next.rewrites.js` ajoute donc un rewrite `fallback` `/uploads/:path*` vers `UPLOADS_UPSTREAM_URL` (défaut `http://127.0.0.1:3001`, **figée au build** dans `routes-manifest.json`, argument de build des Dockerfiles). Le limiteur HTTP global d'Express ignore `/uploads/` (les requêtes arrivent toutes de 127.0.0.1 via ce rewrite)

## Email

### Configuration
```env
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user@example.com
SMTP_PASSWORD=password
SMTP_FROM=noreply@example.com
```

### Réinitialisation mot de passe
- Code à 6 chiffres envoyé par email, stocké haché (sha256)
- Expire après 1 heure, usage unique, 5 essais
- Reset avec email + code ; toutes les sessions du compte sont révoquées

## Sécurité

### Mots de passe
- Comptes : hachés bcrypt (salt rounds: 12)
- Rooms : stockés en mémoire, séparés des données de la room
- Réinitialisation : code temporaire par email (haché en base)

### Headers
- Helmet CSP configuré
- CORS configurable via `CORS_ORIGINS`

### Rate Limiting
- HTTP (Express) : 300 requêtes / 15 minutes par IP, hors `/uploads/`
- Socket.IO : limites par IP (auth, reset, uploads 20/min, création de room `ROOM_CREATE_RATE_LIMIT_PER_MINUTE`, join) et par socket (actions générales)
- Connexions WebSocket simultanées par IP : `MAX_WS_CONNECTIONS_PER_IP` (défaut 20, `0` = illimité)

### Validation
- Côté serveur pour toutes les actions
- Vérification du rôle (PO) pour les actions restreintes
- Vérification de l'appartenance à la room

## Performance

### Optimisations
- `useMemo` pour les calculs dérivés
- `useCallback` pour les fonctions stables
- Mode WAL pour SQLite
- Compression des images avant upload

### Limites
- Images : 2 Mo max
- Stockage rooms : limité par la RAM

## Déploiement

### Docker
- Build multi-stage optimisé (deps -> prod-deps -> builder -> runner), fichiers copiés avec `--chown` (pas de `chown -R`)
- Image de base : node:24-alpine ; image publiée multi-arch (`linux/amd64`, `linux/arm64`) sur Docker Hub (`klmcorp/pokerplanning`)
- Image portable : `SOCKET_URL` et `ALLOW_UPLOADS` lues au lancement (layout racine dynamique via `connection()`, transmises au client par props RSC) ; `ADMIN_SECRET_PATH`, `UPLOADS_UPSTREAM_URL`, `NEXT_PUBLIC_CARDS_PATH` restent figées au build
- `docker-entrypoint.sh` (BusyBox ash) : attend `/health` avant de lancer Next, arrête le conteneur (code 1) si l'un des deux processus meurt, propage SIGTERM/SIGINT (SIGKILL après 7 s)
- Healthcheck : `127.0.0.1:3001/health` et `127.0.0.1:3000/`
- `Dockerfile` clone `GIT_REPO`/`GIT_BRANCH` (défaut `main`, mode de `docker-compose.yml`) ; `Dockerfile.local` construit depuis le contexte local et est utilisé par la CI et la publication

### Node 24 et Proxmox
- `engines` : `^24.0.0 || >=26.0.0`. Les conteneurs Proxmox installés avec une version antérieure (Node 22) doivent passer en Node 24 (nodesource) **avant** `scripts/proxmox-update.sh`, qui ne met pas Node à jour (il refuse de continuer si Node < 24, sauf `--force`). Il ajoute aussi `TRUST_PROXY=1` au `.env` s'il manque (nginx = proxy de confiance unique), sans toucher une valeur existante.

### CI
- `ci.yml` / `build.yml` / `release.yml` : étape « Check TypeScript 7 » après `npm ci` (`npx tsc -v | grep -q "Version 7"`), car deux paquets déclarent le binaire `tsc` ; idem dans `.onedev-buildspec.yml`.
- OneDev : job `Release` sur tag `vX.Y.Z` hors pré-versions (lint, typecheck, tests, build multi-arch, push Docker Hub ; login Docker Hub porté par un exécuteur dédié).

### Tests
- Vitest en environnement `node` ; `DATA_DIR` temporaire (`vitest.config.ts`, `test/globalSetup.ts`) : `data/` n'est jamais touché
- Suites Socket.IO sur les ports 3094 à 3099

### Ports
- 3000 : Next.js (frontend)
- 3001 : Socket.IO (backend)

### Volumes
- `poker-data` : base de données SQLite
- `poker-uploads` : images uploadées
