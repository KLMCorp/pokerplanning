# Planning Poker

Application web de Planning Poker en temps reel pour les equipes agiles.

**Demo en ligne** : [https://planningpoker.klmcorp.fr](https://planningpoker.klmcorp.fr) 

## Fonctionnalites principales

- **Rooms en temps reel** avec code unique a 6 caracteres
- **Systeme de comptes** avec authentification par email ou pseudo
- **Protection par mot de passe** optionnelle pour les rooms
- **Personnalisation complete** : cartes, table de poker, avatars, couleur de carte
- **Chronometre PO** pour timeboxer les discussions (configurable 10s a 60min)
- **Transfert de role PO** vers un autre participant
- **Layout drag & drop** avec support grands ecrans (jusqu'a 3 panneaux par ligne)
- **Gestion de backlog** personnel avec priorites, import dans les rooms et suivi des estimations
- **Historique des sessions** pour les utilisateurs connectes
- **Envoi d'emojis** animes entre participants
- **Internationalisation** (Francais / Anglais)
- **Theme sombre/clair**
- **Dashboard admin** avec chemin secret configurable
- **Reset de mot de passe** par email (code a 6 chiffres)
- **Easter egg Konami Code** (rendu personnalisable)

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
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
APP_URL=http://localhost:3000

# Serveur
PORT=3001
DATA_DIR=./data

# Admin (email autorisant l'acces au dashboard admin)
ADMIN_EMAIL=admin@example.com
# Chemin secret pour la page admin (optionnel, masque /admin)
# ADMIN_SECRET_PATH=/secret-dashboard-42

# Rooms
ROOM_TTL_MINUTES=180
MAX_PARTICIPANTS_PER_ROOM=0

# Uploads d'images (avatar, cartes, table)
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

# Proxy (activer derriere un reverse proxy pour lire X-Forwarded-For)
# TRUST_PROXY=true
```

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

- **Frontend** : Next.js 16, React 19, TypeScript 5, Tailwind CSS 4
- **Backend** : Node.js 22, Express 5, Socket.IO 4
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
  components/       # 30 composants React
  contexts/         # 4 contextes (Socket, Auth, Theme, Locale)
  hooks/            # Hook useRoom
  lib/              # Utilitaires (avatars, cartes, deck, layout, utils)
  types/            # Definitions TypeScript
  i18n/             # Internationalisation (messages FR/EN)
  proxy.ts          # Middleware admin secret path

server/
  index.ts          # Point d'entree Express + Socket.IO
  socket/
    handlers.ts     # Handlers Socket.IO (~1800 lignes)
  store/
    roomStore.ts    # Gestion des rooms en memoire
    userStore.ts    # Gestion SQLite des utilisateurs
  utils/
    mailer.ts       # Service d'envoi d'emails

test/               # Tests Vitest (623 tests)
  lib/              # Tests utilitaires
  server/
    socket/         # Tests handlers Socket.IO
    store/          # Tests stores (room, user)
    utils/          # Tests utilitaires serveur

docs/               # Documentation detaillee
```

## Docker

### Depuis Docker Hub

L'image est disponible sur [Docker Hub](https://hub.docker.com/r/klmcorp/pokerplanning).

```bash
# Lancer directement depuis Docker Hub
docker run -d \
  --name poker-planning \
  -p 3000:3000 \
  -p 3001:3001 \
  -e NEXT_PUBLIC_SOCKET_URL=http://localhost:3001 \
  -v poker-data:/app/data \
  -v poker-uploads:/app/public/uploads \
  klmcorp/pokerplanning:v1.0.0
```

Compatible Podman :

```bash
podman run -d \
  --name poker-planning \
  -p 3000:3000 \
  -p 3001:3001 \
  -e NEXT_PUBLIC_SOCKET_URL=http://localhost:3001 \
  -v poker-data:/app/data:Z \
  -v poker-uploads:/app/public/uploads:Z \
  klmcorp/pokerplanning:v1.0.0
```

L'application est ensuite accessible sur `http://localhost:3000`.

### Build depuis les sources

```bash
# Build et lancement
docker compose up -d --build

# Ou avec Dockerfile.local (sans cloner depuis Git)
docker build -f Dockerfile.local -t pokerplanning:v1.0.0 .
```

L'image utilise un build multi-stage (deps, prod-deps, builder, runner) avec Node.js 22 Alpine.

- **Ports** : 3000 (Next.js) + 3001 (Socket.IO)
- **Volumes** : `poker-data` (base SQLite), `poker-uploads` (images uploadees)
- **Healthcheck** : GET http://localhost:3001/health

## Securite

- **Authentification** : bcrypt pour le hashage, session tokens avec expiration 30 jours
- **Headers HTTP** : Helmet, CSP strict, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy
- **Rate limiting** : par IP (HTTP) et par socket (WebSocket) sur tous les handlers
- **Uploads** : validation MIME + magic bytes, limite 2 Mo, desactivable via `ALLOW_UPLOADS=false`
- **Rooms** : mots de passe hashes avec salt, comparaison constant-time
- **Reset mot de passe** : code 6 chiffres, max 5 tentatives, expiration
- **Admin** : chemin secret configurable via `ADMIN_SECRET_PATH`

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

## Licence

MIT
