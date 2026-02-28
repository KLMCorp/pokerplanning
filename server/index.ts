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
import { stopCleanupInterval as stopRoomCleanup } from './store/roomStore';
import { stopCleanupInterval as stopSessionCleanup } from './store/userStore';
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
  max: 300, // 300 requêtes par fenêtre (santé + uploads statiques)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' },
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
const MAX_WS_CONNECTIONS_PER_IP = parseInt(process.env.MAX_WS_CONNECTIONS_PER_IP || '20', 10);
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
  let ip: string;
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim())
      : socket.handshake.address;
  } else {
    ip = socket.handshake.address;
  }
  const current = wsConnectionsByIp.get(ip) || 0;
  if (current >= MAX_WS_CONNECTIONS_PER_IP) {
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

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});
