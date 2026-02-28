# =============================================================================
# Poker Planning - Dockerfile
# =============================================================================
# Build multi-stage qui clone le code source depuis le dépôt Git,
# puis compile et prépare l'application pour la production.
#
# Usage :
#   docker compose up -d --build

# -----------------------------------------------------------------------------
# Stage 1: Clone du dépôt Git
# -----------------------------------------------------------------------------
FROM alpine:3.21 AS source

RUN apk add --no-cache git

ARG GIT_REPO=https://your-git-server/PlanningPoker.git
ARG GIT_BRANCH=v1.0.0

RUN git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" /source

# -----------------------------------------------------------------------------
# Stage 2: Dependencies (dev + prod pour le build)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=source /source/package*.json ./

RUN npm ci

# -----------------------------------------------------------------------------
# Stage 3: Production dependencies only
# -----------------------------------------------------------------------------
FROM node:22-alpine AS prod-deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=source /source/package*.json ./

RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# Stage 4: Builder
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=source /source .

ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_CARDS_PATH=/images/cartes
ARG APP_VERSION=1.0.0
ARG ALLOW_UPLOADS=true

ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_CARDS_PATH=$NEXT_PUBLIC_CARDS_PATH
ENV APP_VERSION=$APP_VERSION
ENV ALLOW_UPLOADS=$ALLOW_UPLOADS
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 5: Runner
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

ARG APP_VERSION=1.0.0
ENV APP_VERSION=$APP_VERSION

# Next.js standalone
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Serveur Socket.IO compilé
COPY --from=builder /app/dist ./dist

# Dépendances de production uniquement
COPY --from=prod-deps /app/node_modules ./node_modules

# Répertoires persistants
RUN mkdir -p /app/data /app/public/uploads/users && \
    chown -R nextjs:nodejs /app/data /app/public/uploads /app

# Entrypoint
COPY --from=source /source/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nextjs

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
