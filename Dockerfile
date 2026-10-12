# =============================================================================
# Poker Planning - Dockerfile
# =============================================================================
# Build multi-stage qui clone le code source depuis le dépôt Git,
# puis compile et prépare l'application pour la production.
#
# La CI (build.yml, release.yml) utilise Dockerfile.local (build depuis le contexte local).
# Ce Dockerfile clone GIT_REPO : définir GIT_REPO (obligatoire) et éventuellement GIT_BRANCH (défaut : main) dans .env pour docker-compose
# (la valeur par défaut de GIT_REPO est un simple placeholder, le build échoue sans elle).
#
# Image portable : l'URL Socket.IO (SOCKET_URL) et ALLOW_UPLOADS se règlent au
# lancement du container (-e), pas au build.
#
# Usage :
#   docker compose up -d --build

# -----------------------------------------------------------------------------
# Stage 1: Clone du dépôt Git
# -----------------------------------------------------------------------------
FROM alpine:3.24 AS source

RUN apk add --no-cache git

ARG GIT_REPO=https://your-git-server/PlanningPoker.git
ARG GIT_BRANCH=main

RUN git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" /source

# -----------------------------------------------------------------------------
# Stage 2: Dependencies (dev + prod pour le build)
# -----------------------------------------------------------------------------
FROM node:26-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=source /source/package*.json ./

RUN npm ci

# -----------------------------------------------------------------------------
# Stage 3: Production dependencies only
# -----------------------------------------------------------------------------
FROM node:26-alpine AS prod-deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=source /source/package*.json ./

RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# Stage 4: Builder
# -----------------------------------------------------------------------------
FROM node:26-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=source /source .

ARG NEXT_PUBLIC_CARDS_PATH=/images/cartes
ARG APP_VERSION=1.0.0
# URL interne du serveur Express/Socket.IO, utilisée par Next pour servir /uploads sans nginx (figée au build)
ARG UPLOADS_UPSTREAM_URL=http://127.0.0.1:3001
# Chemin secret de la page admin : figé au build (redirects/rewrites Next), visible dans `docker history`
ARG ADMIN_SECRET_PATH

ENV NEXT_PUBLIC_CARDS_PATH=$NEXT_PUBLIC_CARDS_PATH
ENV APP_VERSION=$APP_VERSION
ENV UPLOADS_UPSTREAM_URL=$UPLOADS_UPSTREAM_URL
ENV ADMIN_SECRET_PATH=$ADMIN_SECRET_PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 5: Runner
# -----------------------------------------------------------------------------
FROM node:26-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

ARG APP_VERSION=1.0.0
ENV APP_VERSION=$APP_VERSION

# Fichiers copiés avec leur propriétaire final : un `chown -R /app` dupliquerait
# tout /app dans une nouvelle couche (~435 Mo)

# Next.js standalone
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Serveur Socket.IO compilé
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

# Dépendances de production uniquement
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Répertoires persistants (chown non récursif : seuls ces répertoires changent)
RUN mkdir -p /app/data /app/public/uploads/users && \
    chown nextjs:nodejs /app /app/data /app/public/uploads /app/public/uploads/users

# Entrypoint
COPY --from=source /source/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nextjs

EXPOSE 3000 3001

# Socket.IO (/health) ET Next (/). 127.0.0.1 et non localhost : BusyBox wget résout
# localhost en ::1 sans repli, alors que les deux serveurs n'écoutent qu'en IPv4.
# -T 3 par sonde : 2 sondes séquentielles tiennent dans --timeout=10s
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -q -T 3 --spider "http://127.0.0.1:${PORT:-3001}/health" && wget -q -T 3 --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
