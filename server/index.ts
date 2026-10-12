/**
 * Serveur Socket.IO pour le Planning Poker
 * Point d'entrée principal du backend
 */

// Charger les variables d'environnement en premier
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { setupSocketHandlers } from './socket/handlers';
import { getHandshakeIp, getTrustedHops } from './utils/clientIp';
import { getEnvInt } from './utils/env';
import { stopCleanupInterval as stopRoomCleanup } from './store/roomStore';
import { stopCleanupInterval as stopSessionCleanup, closeAllActiveRoomHistories } from './store/userStore';
import { ClientToServerEvents, ServerToClientEvents } from '../src/types';

const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Configuration CORS dynamique
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : [APP_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'];

console.log('CORS origins configured:', corsOrigins);

// Création de l'application Express
const app = express();

// Nombre de proxys de confiance (TRUST_PROXY), identique à celui utilisé pour Socket.IO
app.set('trust proxy', getTrustedHops() > 0 ? getTrustedHops() : false);

// Middlewares de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Nécessaire pour Socket.IO
  hsts: {
    maxAge: 31536000, // 1 an
    includeSubDomains: true,
    preload: true,
  },
}));

// Compression
app.use(compression());

// CORS
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requêtes par fenêtre (santé ; /uploads/ exclu, voir skip)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' },
  // Les images /uploads/ arrivent via le rewrite Next (toutes depuis 127.0.0.1) : la limite deviendrait globale
  skip: (req) => req.path.startsWith('/uploads/'),
});
app.use(globalLimiter);

app.use(express.json({ limit: '5mb' }));

// Servir les fichiers statiques (uploads d'images)
// Content-Disposition: inline empêche l'exécution de fichiers téléchargés
// On force aussi un Content-Type strict basé sur l'extension
app.use('/uploads', (req, res, next) => {
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(process.cwd(), 'public', 'uploads'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const mime = mimeTypes[ext];
    if (mime) {
      res.setHeader('Content-Type', mime);
    }
  },
}));

// Version de l'application (injectée par Docker build ou lue depuis package.json)
const APP_VERSION = process.env.APP_VERSION || process.env.npm_package_version || '1.0.0';

// Route de santé (pas de version ni timestamp pour éviter la fuite d'information)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Création du serveur HTTP
const httpServer = createServer(app);

// Limite de connexions WebSocket par IP
// Limite lue paresseusement (getEnvInt) à chaque connexion ; 0 = illimité
const wsConnectionsByIp = new Map<string, number>();

// Configuration Socket.IO
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket'],
  maxHttpBufferSize: 3_145_728, // 3 Mo (base64 overhead sur la limite de 2 Mo)
});

// Middleware de limite de connexions par IP
io.use((socket, next) => {
  const ip = getHandshakeIp(socket.handshake);
  const current = wsConnectionsByIp.get(ip) || 0;
  const maxPerIp = getEnvInt('MAX_WS_CONNECTIONS_PER_IP', 20);
  if (maxPerIp > 0 && current >= maxPerIp) {
    return next(new Error('Trop de connexions depuis cette adresse'));
  }
  wsConnectionsByIp.set(ip, current + 1);
  socket.on('disconnect', () => {
    const count = wsConnectionsByIp.get(ip) || 1;
    if (count <= 1) {
      wsConnectionsByIp.delete(ip);
    } else {
      wsConnectionsByIp.set(ip, count - 1);
    }
  });
  next();
});

// Configuration des handlers Socket.IO
setupSocketHandlers(io);

// Démarrage du serveur
// Les rooms sont en mémoire : au démarrage, plus aucune room n'est active, on clôt les historiques orphelins
const closedHistories = closeAllActiveRoomHistories();
if (closedHistories > 0) {
  console.log(`[Startup] ${closedHistories} room histories marked inactive (rooms lost on restart)`);
}

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     Planning Poker - Serveur Socket.IO                    ║
║     Version: ${APP_VERSION.padEnd(45)}║
║                                                           ║
║     Port: ${String(PORT).padEnd(48)}║
║     URL: http://localhost:${String(PORT).padEnd(32)}║
║     Admin: ${(adminEmail || 'Non configuré').padEnd(47)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Gestion gracieuse de l'arrêt
function gracefulShutdown() {
  console.log('\nArrêt du serveur...');
  // Arrêter les intervalles de nettoyage
  stopRoomCleanup();
  stopSessionCleanup();
  // Fermer Socket.IO d'abord (termine toutes les connexions WebSocket)
  io.close(() => {
    httpServer.close(() => {
      console.log('Serveur arrêté.');
      process.exit(0);
    });
  });
  // Forcer l'arrêt après 5 secondes si les connexions ne se ferment pas
  setTimeout(() => {
    console.warn('Arrêt forcé après timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Gestion des rejets de promesses non capturés
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Fail-fast volontaire : après une exception non interceptée l'état peut être corrompu,
// Docker redémarre le conteneur. Les handlers Socket.IO sont protégés par createSafeOn
// (try/catch synchrone et asynchrone) : un payload client hors contrat n'arrive donc jamais ici.
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});
