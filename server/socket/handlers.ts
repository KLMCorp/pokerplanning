/**
 * Gestionnaires Socket.IO pour le Planning Poker
 * Gère toutes les communications temps réel entre clients et serveur
 */

import { Server, Socket } from 'socket.io';
import * as roomStore from '../store/roomStore';
import * as userStore from '../store/userStore';
import { sendPasswordResetEmail, isMailerConfigured } from '../utils/mailer';
import { createSafeOn, isPlainObject } from './safeHandler';
import { getHandshakeIp } from '../utils/clientIp';
import { getEnvInt } from '../utils/env';
import { normalizeRoomCode, isValidRoomCode } from '../utils/roomCode';
import { deleteRoomUploads, deleteUserUploads } from '../utils/uploads';
import { collectDeckImageUrls, isAllowedDeckImageUrl } from '../utils/deckImages';
import { ClientToServerEvents, ServerToClientEvents, DeckConfig, BacklogItem, Room, RoomSettings } from '../../src/types';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// Rate limiting pour Socket.IO (en mémoire)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_AUTH = 10; // 10 tentatives d'auth par minute
const RATE_LIMIT_MAX_GENERAL = 100; // 100 actions générales par minute
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // Nettoyage toutes les 5 minutes

/**
 * Nettoie les entrées expirées du rate limit pour éviter les fuites mémoire
 */
function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

// Nettoyage périodique du rate limit map
setInterval(() => {
  try {
    cleanupRateLimitMap();
  } catch (e) {
    console.error('[rateLimit] cleanup failed', e);
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

/**
 * Vérifie le rate limit pour une clé donnée (socket ID, IP, etc.)
 * windowMs : durée de la fenêtre (1 minute par défaut) ; chaque entrée garde son propre resetTime
 */
function checkRateLimit(key: string, maxRequests: number, windowMs: number = RATE_LIMIT_WINDOW): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    // Éviter une croissance illimitée de la map
    if (rateLimitMap.size >= RATE_LIMIT_MAX_SIZE) {
      cleanupRateLimitMap();
    }
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

// Plafond de codes de reset envoyés par email normalisé et par heure (en plus de 3/min)
const FORGOT_EMAIL_MAX_PER_HOUR = 5;
const FORGOT_EMAIL_MAX_PER_DAY = 10; // plafond sur 24 h (limite le total d'essais de code sur un compte ciblé)

// Délai de grâce pour la reconnexion (30 secondes)
const DEFAULT_RECONNECT_GRACE_PERIOD = 30000;
const disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

// Taille max du rate limit map pour éviter les fuites mémoire
const RATE_LIMIT_MAX_SIZE = 10000;

/**
 * Récupère l'adresse IP réelle du client (support proxy/load balancer)
 */
function getClientIp(socket: SocketClient): string {
  return getHandshakeIp(socket.handshake);
}

// Configuration des uploads
const ALLOW_UPLOADS = process.env.ALLOW_UPLOADS !== 'false';

// Limites de validation
const MAX_USERNAME_LENGTH = 30;
const MAX_ITEM_TITLE_LENGTH = 200;
const MAX_ITEM_DESCRIPTION_LENGTH = 2000;
const MAX_ITEMS_PER_ROOM = 100;
const MAX_FINAL_SCORE_LENGTH = 10;
const MAX_DECK_CARDS = 30;
const MAX_CARD_VALUE_LENGTH = 20;
const MAX_CARD_LABEL_LENGTH = 30;
const MAX_PASSWORD_LENGTH = 256;

// Emojis autorisés (doit correspondre au picker client)
const ALLOWED_EMOJIS = new Set(['🍺', '🗞️', '✈️', '💵']);

/**
 * Émet room:updated à tous les sockets d'une room.
 * Pendant le vote (state === 'voting'), chaque socket reçoit une version
 * sanitisée où seuls ses propres votes sont visibles.
 * Pour les autres états, un broadcast classique est utilisé.
 */
function emitRoomUpdate(io: SocketServer, roomId: string, room: Room): void {
  if (room.state === 'voting') {
    const socketUserMap = roomStore.getSocketUserMap(roomId);
    for (const [socketId, userId] of socketUserMap) {
      io.to(socketId).emit('room:updated', roomStore.sanitizeRoomForUser(room, userId));
    }
  } else {
    io.to(roomId).emit('room:updated', room);
  }
}

/**
 * Supprime les caractères de contrôle d'une chaîne (conserve \n et \t)
 */
function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize une entrée utilisateur : supprime les caractères de contrôle (sauf \n et \t).
 * Aucun échappement HTML n'est appliqué : le rendu React échappe le texte. Ne jamais
 * injecter ces valeurs via dangerouslySetInnerHTML ni dans du HTML brut (les emails utilisent escapeHtml).
 */
function sanitizeInput(str: string): string {
  return stripControlChars(str);
}

/**
 * Attend un délai aléatoire uniforme entre minMs et maxMs
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));
}

/**
 * Garde de type runtime : vérifie qu'une valeur est une chaîne de caractères
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Valide et sanitize une configuration de deck
 * Retourne le deck sanitizé ou null si invalide
 */
function validateDeck(deck: unknown): DeckConfig | null {
  if (!deck || typeof deck !== 'object') return null;
  const d = deck as Record<string, unknown>;

  if (!Array.isArray(d.cards)) return null;
  if (d.cards.length === 0 || d.cards.length > MAX_DECK_CARDS) return null;

  // Valider backImageUrl
  if (d.backImageUrl !== undefined && d.backImageUrl !== null) {
    if (!isString(d.backImageUrl)) return null;
    if (d.backImageUrl && !d.backImageUrl.startsWith('/uploads/') && !d.backImageUrl.startsWith('/images/')) return null;
  }

  const sanitizedCards = [];
  for (const card of d.cards) {
    if (!card || typeof card !== 'object') return null;
    const c = card as Record<string, unknown>;

    if (!isString(c.value) || !isString(c.label)) return null;
    if (c.value.length > MAX_CARD_VALUE_LENGTH || c.label.length > MAX_CARD_LABEL_LENGTH) return null;

    // Valider frontImageUrl si présente
    if (c.frontImageUrl !== undefined && c.frontImageUrl !== null) {
      if (!isString(c.frontImageUrl)) return null;
      if (c.frontImageUrl && !c.frontImageUrl.startsWith('/uploads/') && !c.frontImageUrl.startsWith('/images/')) return null;
    }

    sanitizedCards.push({
      value: sanitizeInput(c.value),
      label: sanitizeInput(c.label),
      frontImageUrl: c.frontImageUrl || undefined,
    });
  }

  return {
    cards: sanitizedCards,
    backImageUrl: (d.backImageUrl as string) || undefined,
  };
}

// Panneaux valides pour le layout de la room
const VALID_PANEL_IDS = new Set(['pokerTable', 'cardPicker', 'controlsStats', 'itemList', 'estimatedItems', 'userList']);

/**
 * Valide une configuration de layout
 * Retourne le layout validé ou null si invalide
 */
function validateLayoutConfig(layout: unknown): import('../../src/types').LayoutConfig | null {
  if (!Array.isArray(layout)) return null;
  if (layout.length === 0 || layout.length > 6) return null;

  for (const row of layout) {
    if (!Array.isArray(row)) return null;
    if (row.length === 0 || row.length > 3) return null;
    for (const panelId of row) {
      if (!isString(panelId) || !VALID_PANEL_IDS.has(panelId)) return null;
    }
  }

  return layout as import('../../src/types').LayoutConfig;
}

/**
 * Sanitize un nom de fichier pour éviter le path traversal
 */
function sanitizeFileName(fileName: string): string {
  // Supprime les caractères dangereux et les séquences de path traversal
  return fileName
    .replace(/\.\./g, '') // Supprime ..
    .replace(/[\/\\]/g, '') // Supprime / et \
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_') // Garde uniquement les caractères sûrs
    .substring(0, 100); // Limite la longueur
}

/**
 * Valide qu'un chemin d'image est sûr pour la suppression
 * Vérifie que le chemin est bien dans le dossier uploads de l'utilisateur
 * Utilise path.resolve pour bloquer toute forme de path traversal (encodée ou non)
 */
function isValidImagePath(imageUrl: string, accountId: string): boolean {
  // Doit commencer par le préfixe attendu
  const expectedPrefix = `/uploads/users/${accountId}/`;
  if (!imageUrl.startsWith(expectedPrefix)) {
    return false;
  }

  // Enlève les query params
  const pathPart = imageUrl.split('?')[0];

  // Le nom de fichier après le préfixe doit être simple (pas de sous-répertoires)
  const fileName = pathPart.substring(expectedPrefix.length);
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return false;
  }

  // Validation canonique avec path.resolve pour bloquer les traversals encodés
  const uploadsBase = path.resolve(process.cwd(), 'public', 'uploads', 'users', accountId);
  const resolvedPath = path.resolve(uploadsBase, fileName);
  if (!resolvedPath.startsWith(uploadsBase + path.sep) && resolvedPath !== uploadsBase) {
    return false;
  }

  return true;
}

/**
 * Valide le type MIME réel d'une image via les magic bytes
 */
function validateImageMagicBytes(buffer: Buffer): { valid: boolean; type?: string } {
  // Signatures des types d'images supportés
  const signatures: { [key: string]: number[] } = {
    'png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    'jpg': [0xFF, 0xD8, 0xFF],
    'webp': [0x52, 0x49, 0x46, 0x46], // RIFF header, suivi de WEBP
  };

  for (const [type, signature] of Object.entries(signatures)) {
    if (buffer.length >= signature.length) {
      const matches = signature.every((byte, i) => buffer[i] === byte);
      if (matches) {
        // Vérification supplémentaire pour WebP
        if (type === 'webp' && buffer.length >= 12) {
          if (!buffer.slice(8, 12).equals(Buffer.from('WEBP'))) continue;
        }
        return { valid: true, type };
      }
    }
  }

  return { valid: false };
}

/** Taille max d'upload d'image (2 Mo) */
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Valide et décode une image base64 uploadée
 * Retourne le buffer et l'extension validée, ou une erreur
 */
async function processImageUpload(
  imageData: string,
  uploadDir: string,
  fileName: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const matches = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!matches) {
    return { success: false, error: 'Format de données image invalide' };
  }

  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return { success: false, error: 'L\'image ne doit pas dépasser 2 Mo' };
  }

  const mimeValidation = validateImageMagicBytes(buffer);
  if (!mimeValidation.valid) {
    return { success: false, error: 'Le fichier n\'est pas une image valide' };
  }

  const extension = mimeValidation.type === 'jpg' ? 'jpg' : mimeValidation.type!;
  const finalFileName = fileName.replace(/\.\w+$/, '') + '.' + extension;

  await fsPromises.mkdir(uploadDir, { recursive: true });
  await fsPromises.writeFile(path.join(uploadDir, finalFileName), buffer);

  return { success: true, url: finalFileName };
}

// Deck par défaut
function getDefaultDeck(): DeckConfig {
  return {
    cards: [
      { value: '0', label: '0' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '5', label: '5' },
      { value: '8', label: '8' },
      { value: '13', label: '13' },
      { value: '20', label: '20' },
      { value: '40', label: '40' },
      { value: '100', label: '100' },
      { value: '?', label: '?' },
      { value: 'coffee', label: '☕' },
    ],
    backImageUrl: undefined,
  };
}

type SocketServer = Server<ClientToServerEvents, ServerToClientEvents>;
type SocketClient = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Annule un timer de déconnexion en attente (clé = `${roomId}:${userId}`)
 */
function clearDisconnectTimer(key: string): void {
  const timer = disconnectTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(key);
  }
}

/**
 * Nombre de timers de déconnexion en attente (tests uniquement)
 */
export function _getDisconnectTimerCountForTests(): number {
  return disconnectTimers.size;
}

/**
 * Réagit à la suppression d'une room par le store (PO parti, PO non revenu, room vide, TTL) :
 * annule les timers, notifie les clients, fait quitter la room socket.io et supprime les uploads.
 */
function onRoomRemoved(io: SocketServer, e: roomStore.RoomRemovedEvent): void {
  for (const uid of e.userIds) {
    clearDisconnectTimer(`${e.roomId}:${uid}`);
  }
  if (e.reason !== 'empty') {
    io.to(e.roomId).emit('room:closed', { roomId: e.roomId, reason: e.reason === 'expired' ? 'expired' : 'po_left' });
  }
  io.in(e.roomId).socketsLeave(e.roomId);
  void deleteRoomUploads(e.roomId);
  console.log(`[Room] ${e.roomId} removed (${e.reason})`);
}

/**
 * Configure tous les handlers Socket.IO
 */
export function setupSocketHandlers(io: SocketServer): void {
  // Suppression centralisée des rooms : notification, timers et uploads gérés ici
  roomStore.setRoomRemovedListener((e) => onRoomRemoved(io, e));

  io.on('connection', (socket: SocketClient) => {
    // Enregistrement sécurisé : payload validé, ack à usage unique, erreurs capturées
    const on = createSafeOn(socket);

    // ====== AUTHENTIFICATION ======

    /**
     * Inscription d'un nouvel utilisateur
     */
    on('auth:register', async (data, callback) => {
      // Rate limiting strict pour l'authentification (par IP)
      if (!checkRateLimit(getClientIp(socket) + ':auth', RATE_LIMIT_MAX_AUTH)) {
        callback(false, undefined, 'Trop de tentatives, veuillez réessayer dans une minute');
        return;
      }

      const { email, password, name, role, authType, pseudo } = data;

      // Gardes de type runtime
      if (!isString(name) || !isString(password)) {
        callback(false, undefined, 'Données invalides');
        return;
      }
      if (authType !== undefined && authType !== 'email' && authType !== 'pseudo') {
        callback(false, undefined, 'Données invalides');
        return;
      }
      if (authType === 'pseudo' ? !isString(pseudo) : !isString(email)) {
        callback(false, undefined, 'Données invalides');
        return;
      }

      if (authType === 'pseudo') {
        if (!pseudo || !password || !name || !role) {
          callback(false, undefined, 'Tous les champs sont requis');
          return;
        }
      } else {
        if (!email || !password || !name || !role) {
          callback(false, undefined, 'Tous les champs sont requis');
          return;
        }
      }

      // Validation du rôle
      if (role !== 'dev' && role !== 'po') {
        callback(false, undefined, 'Rôle invalide');
        return;
      }

      // Validation longueur du nom
      if (name.trim().length > MAX_USERNAME_LENGTH) {
        callback(false, undefined, `Le nom ne doit pas dépasser ${MAX_USERNAME_LENGTH} caractères`);
        return;
      }

      const result = await userStore.register(email, password, sanitizeInput(name.trim()), role, authType || 'email', pseudo);
      if (result.success && result.account) {
        userStore.setSocketAccount(socket.id, result.account.id);
        const sessionToken = userStore.createSessionToken(result.account.id);
        callback(result.success, result.account, result.error, sessionToken);
      } else {
        callback(result.success, result.account, result.error);
      }
    });

    /**
     * Connexion d'un utilisateur
     */
    on('auth:login', async (data, callback) => {
      // Rate limiting strict pour l'authentification (par IP)
      if (!checkRateLimit(getClientIp(socket) + ':auth', RATE_LIMIT_MAX_AUTH)) {
        callback(false, undefined, 'Trop de tentatives, veuillez réessayer dans une minute');
        return;
      }

      const { email, password, authType, pseudo } = data;

      // Gardes de type runtime
      if (!isString(password)) {
        callback(false, undefined, 'Données invalides');
        return;
      }
      if (authType !== undefined && authType !== 'email' && authType !== 'pseudo') {
        callback(false, undefined, 'Données invalides');
        return;
      }
      if (authType === 'pseudo' ? !isString(pseudo) : !isString(email)) {
        callback(false, undefined, 'Données invalides');
        return;
      }

      if (authType === 'pseudo') {
        if (!pseudo || !password) {
          callback(false, undefined, 'Pseudo et mot de passe requis');
          return;
        }
      } else {
        if (!email || !password) {
          callback(false, undefined, 'Email et mot de passe requis');
          return;
        }
      }

      const result = await userStore.login(email, password, authType || 'email', pseudo);
      if (result.success && result.account) {
        userStore.setSocketAccount(socket.id, result.account.id);
        const sessionToken = userStore.createSessionToken(result.account.id);
        callback(result.success, result.account, result.error, sessionToken);
      } else {
        callback(result.success, result.account, result.error);
      }
    });

    /**
     * Reconnexion d'un utilisateur (après refresh de page)
     * Requiert un sessionToken valide pour sécuriser la session
     */
    on('auth:reconnect', (data, callback) => {
      const { accountId, sessionToken } = data;

      if (!accountId || typeof accountId !== 'string') {
        callback(false, undefined, 'invalid_session');
        return;
      }
      if (sessionToken !== undefined && !isString(sessionToken)) {
        callback(false, undefined, 'invalid_session');
        return;
      }

      // Validation basique de l'accountId (format UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(accountId)) {
        callback(false, undefined, 'invalid_session');
        return;
      }

      // Valider le token de session
      if (!sessionToken || !userStore.validateSessionToken(sessionToken, accountId)) {
        callback(false, undefined, 'invalid_session');
        return;
      }

      const account = userStore.getAccount(accountId);
      if (account) {
        userStore.setSocketAccount(socket.id, account.id);
        callback(true, account);
      } else {
        callback(false, undefined, 'invalid_session');
      }
    });

    /**
     * Déconnexion d'un utilisateur
     * Révoque le token de session si fourni
     */
    on('auth:logout', (data) => {
      if (isString(data?.sessionToken) && data.sessionToken) {
        userStore.revokeSessionToken(data.sessionToken);
      }
      userStore.clearSocketAccount(socket.id);
    });

    /**
     * Demande de réinitialisation de mot de passe
     */
    on('auth:forgotPassword', async (data, callback) => {
      // Rate limiting très strict pour éviter le spam et l'énumération (par IP)
      if (!checkRateLimit(getClientIp(socket) + ':forgot', 3)) { // 3 tentatives max par minute
        callback(false, 'Trop de tentatives, veuillez réessayer dans une minute');
        return;
      }

      const { email } = data;

      if (!isString(email) || !email.trim()) {
        callback(false, 'Email requis');
        return;
      }

      // Vérifié avant toute recherche d'utilisateur : la réponse ne dépend pas de l'email
      if (!isMailerConfigured()) {
        callback(false, 'Service email non configuré');
        return;
      }

      const normalized = email.trim().toLowerCase();

      // Délai uniforme pour tous les chemins suivants (anti timing attack)
      await randomDelay(300, 600);

      // Réponse identique sans envoi : email invalide, compte pseudo, ou trop de demandes pour cet email
      if (
        !userStore.isValidEmail(normalized) ||
        normalized.startsWith('pseudo:') ||
        !checkRateLimit('forgot-email:' + normalized, 3) ||
        !checkRateLimit('forgot-email-hour:' + normalized, FORGOT_EMAIL_MAX_PER_HOUR, 60 * 60 * 1000) ||
        !checkRateLimit('forgot-email-day:' + normalized, FORGOT_EMAIL_MAX_PER_DAY, 24 * 60 * 60 * 1000)
      ) {
        callback(true);
        return;
      }

      // Pour des raisons de sécurité, on ne révèle pas si l'email existe
      const user = userStore.findUserByEmail(normalized);
      if (!user) {
        callback(true);
        return;
      }

      // Répondre avant le DELETE+INSERT synchrone : un email connu ne répond pas plus tard qu'un inconnu.
      // Une erreur éventuelle est capturée et loggée par le wrapper (ack à usage unique).
      callback(true);
      const code = userStore.createPasswordResetToken(user.id);
      // Envoi en arrière-plan : le résultat n'est pas révélé au client. Ne jamais logger le code.
      void sendPasswordResetEmail(normalized, user.name, code)
        .then((r) => {
          if (!r.success) console.error('[reset] email send failed');
        })
        .catch((e) => console.error('[reset] email send failed', e));
    });

    /**
     * Vérifier un code de réinitialisation
     */
    on('auth:verifyResetCode', (data, callback) => {
      // Rate limiting pour éviter le bruteforce du code (par IP)
      if (!checkRateLimit(getClientIp(socket) + ':verify', 5)) {
        callback(false, 'Trop de tentatives, veuillez réessayer dans une minute');
        return;
      }

      const { email, code } = data;
      if (!isString(email) || !isString(code)) {
        callback(false, userStore.RESET_CODE_INVALID_MESSAGE);
        return;
      }

      const result = userStore.validateResetToken(email, code);
      callback(result.valid, result.valid ? undefined : result.error);
    });

    /**
     * Réinitialiser le mot de passe
     */
    on('auth:resetPassword', async (data, callback) => {
      // Rate limiting pour éviter le bruteforce du token (par IP)
      if (!checkRateLimit(getClientIp(socket) + ':auth', RATE_LIMIT_MAX_AUTH)) {
        callback(false, 'Trop de tentatives, veuillez réessayer dans une minute');
        return;
      }

      const { email, code, newPassword } = data;

      if (!isString(email) || !isString(code) || !isString(newPassword) || !email || !code || !newPassword) {
        callback(false, 'Email, code et nouveau mot de passe requis');
        return;
      }

      const result = await userStore.resetPassword(email, code, newPassword);
      callback(result.success, result.error);
    });

    /**
     * Récupérer l'historique des rooms
     */
    on('auth:getHistory', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback([]);
        return;
      }
      const history = userStore.getRoomHistory(accountId);
      callback(history);
    });

    /**
     * Supprimer une room de l'historique
     */
    on('auth:deleteRoomHistory', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }
      if (!isString(data.historyId)) {
        callback(false);
        return;
      }
      const success = userStore.deleteRoomHistory(accountId, data.historyId);
      callback(success);
    });

    /**
     * Mettre à jour la configuration du deck utilisateur
     */
    on('auth:updateDeck', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }
      const validatedDeck = validateDeck(data.deck);
      if (!validatedDeck) {
        callback(false);
        return;
      }
      const success = userStore.updateDeckConfig(accountId, validatedDeck);
      callback(success);
    });

    /**
     * Upload d'une image pour le deck utilisateur
     */
    on('auth:uploadDeckImage', async (data, callback) => {
      if (!ALLOW_UPLOADS) {
        callback(false, 'Les uploads d\'images sont désactivés');
        return;
      }
      if (!checkRateLimit(getClientIp(socket) + ':upload', 20)) {
        callback(false, 'Trop d\'uploads, veuillez réessayer dans une minute');
        return;
      }

      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false, 'Session expirée');
        return;
      }

      if (
        (data.type !== 'front' && data.type !== 'back') ||
        !isString(data.imageData) ||
        (data.type === 'front' && !(isString(data.cardValue) && data.cardValue.length > 0))
      ) {
        callback(false, 'Données invalides');
        return;
      }

      try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'users', accountId);
        const safeCardValue = data.cardValue ? sanitizeFileName(data.cardValue) : '';
        const baseName = data.type === 'back' ? 'back' : `card_${safeCardValue}`;

        const result = await processImageUpload(data.imageData, uploadDir, `${baseName}.img`);
        if (!result.success) {
          callback(false, result.error);
          return;
        }

        const url = `/uploads/users/${accountId}/${result.url}`;

        const account = userStore.getAccount(accountId);
        if (account) {
          const currentDeck = account.deckConfig || getDefaultDeck();
          if (data.type === 'back') {
            currentDeck.backImageUrl = url;
          } else if (data.cardValue) {
            const card = currentDeck.cards.find((c) => c.value === data.cardValue);
            if (card) card.frontImageUrl = url;
          }
          userStore.updateDeckConfig(accountId, currentDeck);
        }

        callback(true, url);
      } catch (error: unknown) {
        console.error('Erreur upload image:', error);
        callback(false, 'Erreur serveur');
      }
    });

    /**
     * Supprimer une image du deck utilisateur
     */
    on('auth:deleteDeckImage', async (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      if (
        (data.type !== 'front' && data.type !== 'back') ||
        (data.type === 'front' && !isString(data.cardValue))
      ) {
        callback(false);
        return;
      }

      try {
        const account = userStore.getAccount(accountId);
        if (!account) {
          callback(false);
          return;
        }

        const currentDeck = account.deckConfig || getDefaultDeck();

        // Trouver l'URL de l'image à supprimer
        let imageUrl: string | undefined;
        if (data.type === 'back') {
          imageUrl = currentDeck.backImageUrl;
          currentDeck.backImageUrl = undefined;
        } else if (data.cardValue) {
          const card = currentDeck.cards.find((c) => c.value === data.cardValue);
          if (card) {
            imageUrl = card.frontImageUrl;
            card.frontImageUrl = undefined;
          }
        }

        // Supprimer le fichier si le chemin est sûr
        if (imageUrl && isValidImagePath(imageUrl, accountId)) {
          const filePath = path.join(process.cwd(), 'public', imageUrl.split('?')[0]);
          try {
            await fsPromises.unlink(filePath);
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
          }
        }

        // Mettre à jour le deck config
        userStore.updateDeckConfig(accountId, currentDeck);
        callback(true);
      } catch (error: unknown) {
        console.error('Erreur suppression image:', error);
        callback(false);
      }
    });

    /**
     * Mettre à jour la configuration de la table utilisateur
     */
    on('auth:updateTableConfig', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      // Gardes de type runtime
      const rawConfig: unknown = data.tableConfig;
      if (rawConfig !== undefined && !isPlainObject(rawConfig)) {
        callback(false);
        return;
      }
      if (
        rawConfig &&
        ((rawConfig.feltColor !== undefined && !isString(rawConfig.feltColor)) ||
          (rawConfig.borderColor !== undefined && !isString(rawConfig.borderColor)) ||
          (rawConfig.imageUrl !== undefined && !isString(rawConfig.imageUrl)))
      ) {
        callback(false);
        return;
      }
      const config = data.tableConfig;

      // Valider les couleurs de la table pour prévenir l'injection CSS
      if (config) {
        const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
        if (config.feltColor && !hexColorRegex.test(config.feltColor)) {
          callback(false);
          return;
        }
        if (config.borderColor && !hexColorRegex.test(config.borderColor)) {
          callback(false);
          return;
        }
        // imageUrl doit être un chemin local (/uploads/...)
        if (config.imageUrl && !config.imageUrl.startsWith('/uploads/')) {
          callback(false);
          return;
        }
      }

      const success = userStore.updateTableConfig(accountId, config);
      callback(success);
    });

    /**
     * Mettre à jour la configuration du layout de la room
     */
    on('auth:updateLayoutConfig', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }
      const validatedLayout = validateLayoutConfig(data.layoutConfig);
      if (!validatedLayout) {
        callback(false);
        return;
      }
      const success = userStore.updateLayoutConfig(accountId, validatedLayout);
      callback(success);
    });

    /**
     * Mettre à jour le TTL des rooms de l'utilisateur
     */
    on('auth:updateRoomTtl', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false, 'Session expirée');
        return;
      }

      const { ttlMinutes } = data;
      if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1) {
        callback(false, 'TTL invalide');
        return;
      }

      const result = userStore.updateRoomTtl(accountId, ttlMinutes);
      callback(result.success, result.error);
    });

    /**
     * Upload d'une image pour la table utilisateur
     */
    on('auth:uploadTableImage', async (data, callback) => {
      if (!ALLOW_UPLOADS) {
        callback(false, 'Les uploads d\'images sont désactivés');
        return;
      }
      if (!checkRateLimit(getClientIp(socket) + ':upload', 20)) {
        callback(false, 'Trop d\'uploads, veuillez réessayer dans une minute');
        return;
      }

      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false, 'Session expirée');
        return;
      }

      try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'users', accountId);
        if (!isString(data.imageData)) {
          callback(false, 'Données invalides');
          return;
        }
        const result = await processImageUpload(data.imageData, uploadDir, 'table.img');
        if (!result.success) {
          callback(false, result.error);
          return;
        }

        const url = `/uploads/users/${accountId}/${result.url}?t=${Date.now()}`;

        const account = userStore.getAccount(accountId);
        if (account) {
          const currentConfig = account.tableConfig || {};
          currentConfig.imageUrl = url;
          userStore.updateTableConfig(accountId, currentConfig);
        }

        callback(true, url);
      } catch (error: unknown) {
        console.error('Erreur upload table image:', error);
        callback(false, 'Erreur serveur');
      }
    });

    /**
     * Upload d'un avatar utilisateur
     */
    on('auth:uploadAvatar', async (data, callback) => {
      if (!ALLOW_UPLOADS) {
        callback(false, 'Les uploads d\'images sont désactivés');
        return;
      }
      if (!checkRateLimit(getClientIp(socket) + ':upload', 20)) {
        callback(false, 'Trop d\'uploads, veuillez réessayer dans une minute');
        return;
      }

      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false, 'Session expirée');
        return;
      }

      try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'users', accountId);
        if (!isString(data.imageData)) {
          callback(false, 'Données invalides');
          return;
        }
        const result = await processImageUpload(data.imageData, uploadDir, 'avatar.img');
        if (!result.success) {
          callback(false, result.error);
          return;
        }

        const url = `/uploads/users/${accountId}/${result.url}?t=${Date.now()}`;
        userStore.updateAvatar(accountId, url);
        callback(true, url);
      } catch (error: unknown) {
        console.error('Erreur upload avatar:', error);
        callback(false, 'Erreur serveur');
      }
    });

    // ====== GESTION DES ROOMS ======

    /**
     * Création d'une nouvelle room
     * L'utilisateur devient automatiquement le PO
     */
    on('room:create', (data, callback) => {
      // Rate limiting pour éviter la création massive de rooms (par IP)
      // ROOM_CREATE_RATE_LIMIT_PER_MINUTE=0 : pas de limite (comme MAX_ACTIVE_ROOMS)
      const roomCreateLimit = getEnvInt('ROOM_CREATE_RATE_LIMIT_PER_MINUTE', 10);
      if (roomCreateLimit > 0 && !checkRateLimit(getClientIp(socket) + ':roomcreate', roomCreateLimit)) {
        socket.emit('error', 'Trop de rooms créées, veuillez réessayer dans une minute');
        return;
      }

      const { userName, password, cardColor } = data;

      // Gardes de type runtime
      if (!isString(userName)) {
        socket.emit('error', 'Données invalides');
        return;
      }
      if ((password !== undefined && !isString(password)) || (cardColor !== undefined && !isString(cardColor))) {
        socket.emit('error', 'Données invalides');
        return;
      }

      if (!userName || userName.trim().length === 0) {
        socket.emit('error', 'Le nom est requis');
        return;
      }

      // Validation longueur du nom
      if (userName.trim().length > MAX_USERNAME_LENGTH) {
        socket.emit('error', `Le nom ne doit pas dépasser ${MAX_USERNAME_LENGTH} caractères`);
        return;
      }

      // Validation longueur du mot de passe
      if (password && password.length > MAX_PASSWORD_LENGTH) {
        socket.emit('error', 'Mot de passe trop long');
        return;
      }

      // Plafond global de rooms actives (0 = illimité)
      const maxRooms = getEnvInt('MAX_ACTIVE_ROOMS', 0);
      if (maxRooms > 0 && roomStore.getAllRooms().length >= maxRooms) {
        socket.emit('error', 'Nombre maximum de rooms actives atteint, veuillez réessayer plus tard');
        return;
      }

      // Le socket est déjà dans une room : la quitter proprement (PO => room fermée pour tous)
      if (roomStore.getUserInfo(socket.id)) {
        handleLeaveRoom(socket, io);
      }

      // Récupérer le deck et table personnalisés de l'utilisateur si connecté
      const connectedAccountId = userStore.getSocketAccount(socket.id);
      let customDeck = undefined;
      let customTable = undefined;
      let userCardBackUrl = undefined;
      let userTtl = undefined;
      if (connectedAccountId) {
        const acct = userStore.getAccount(connectedAccountId);
        if (acct) {
          customDeck = acct.deckConfig;
          customTable = acct.tableConfig;
          userCardBackUrl = customDeck?.backImageUrl;
          userTtl = acct.roomTtlMinutes;
        }
      }

      const { room, userId, reconnectSecret } = roomStore.createRoom(sanitizeInput(userName.trim()), socket.id, password, customDeck, customTable, userCardBackUrl, userTtl, cardColor);
      socket.join(room.id);

      // Ajouter à l'historique et cacher le créateur si l'utilisateur est connecté
      if (connectedAccountId) {
        userStore.addRoomToHistory(connectedAccountId, room.id, sanitizeInput(userName.trim()));
        roomStore.setRoomCreator(room.id, connectedAccountId);
      }

      // Log minimal sans données utilisateur
      if (process.env.NODE_ENV === 'development') {
        console.log(`Room créée: ${room.id}`);
      }
      callback(room, userId, reconnectSecret);
    });

    /**
     * Rejoindre une room existante
     */
    on('room:join', (data, callback) => {
      // Rate limiting pour éviter le bruteforce des mots de passe room
      if (!checkRateLimit(getClientIp(socket) + ':roomjoin', 10)) {
        callback(false, undefined, undefined, 'Trop de tentatives, veuillez réessayer dans une minute');
        return;
      }

      const { roomId, userName, password, cardColor } = data;

      // Gardes de type runtime
      if (!isString(userName) || !isString(roomId)) {
        callback(false, undefined, undefined, 'Données invalides');
        return;
      }
      if ((password !== undefined && !isString(password)) || (cardColor !== undefined && !isString(cardColor))) {
        callback(false, undefined, undefined, 'Données invalides');
        return;
      }

      if (!userName || userName.trim().length === 0) {
        callback(false, undefined, undefined, 'Le nom est requis');
        return;
      }

      // Validation longueur du nom
      if (userName.trim().length > MAX_USERNAME_LENGTH) {
        callback(false, undefined, undefined, `Le nom ne doit pas dépasser ${MAX_USERNAME_LENGTH} caractères`);
        return;
      }

      if (!roomId || roomId.trim().length === 0) {
        callback(false, undefined, undefined, 'Le code de room est requis');
        return;
      }

      // Validation longueur du mot de passe
      if (password && password.length > MAX_PASSWORD_LENGTH) {
        callback(false, undefined, undefined, 'Mot de passe trop long');
        return;
      }

      // Code normalisé (trim + majuscules) puis validé : aucune valeur brute du client n'est utilisée ensuite
      const target = normalizeRoomCode(roomId);
      if (!isValidRoomCode(target)) {
        callback(false, undefined, undefined, 'Room introuvable');
        return;
      }

      const prev = roomStore.getUserInfo(socket.id);
      if (prev) {
        const prevRoom = prev.roomId === target ? roomStore.getRoom(target) : undefined;
        if (prevRoom) {
          // Déjà dans cette room : idempotent (même userId, même secret, pas de doublon)
          callback(true, roomStore.sanitizeRoomForUser(prevRoom, prev.userId), prev.userId, undefined, roomStore.getReconnectSecret(target, prev.userId));
          return;
        }
        // La cible doit être joignable AVANT de quitter l'ancienne room (sinon on y reste)
        const joinable = roomStore.checkJoinable(target, password);
        if (!joinable.ok) {
          callback(false, undefined, undefined, joinable.error);
          return;
        }
        handleLeaveRoom(socket, io);
      }

      // Récupérer le dos de carte personnalisé si l'utilisateur est connecté
      const connectedAccountId = userStore.getSocketAccount(socket.id);
      let userCardBackUrl = undefined;
      if (connectedAccountId) {
        const customDeck = userStore.getDeckConfig(connectedAccountId);
        userCardBackUrl = customDeck?.backImageUrl;
      }

      const result = roomStore.joinRoom(target, sanitizeInput(userName.trim()), socket.id, password, userCardBackUrl, cardColor);

      if (!result.success) {
        callback(false, undefined, undefined, result.error);
        return;
      }

      socket.join(target);

      // Notifie les autres utilisateurs (room:updated contient déjà le nouvel utilisateur)
      emitRoomUpdate(io, target, result.room!);

      callback(true, roomStore.sanitizeRoomForUser(result.room!, result.userId!), result.userId, undefined, result.reconnectSecret);
    });

    /**
     * Vérifier si une room existe et si elle a un mot de passe
     */
    on('room:checkPassword', (data, callback) => {
      // Rate limiting pour éviter l'énumération de rooms
      if (!checkRateLimit(getClientIp(socket) + ':roomcheck', 10)) {
        callback(false, false);
        return;
      }

      const { roomId } = data;
      if (!isString(roomId)) {
        callback(false, false);
        return;
      }
      const target = normalizeRoomCode(roomId);
      if (!isValidRoomCode(target)) {
        callback(false, false);
        return;
      }
      const result = roomStore.checkRoomPassword(target);
      callback(result.hasPassword, result.exists);
    });

    /**
     * Quitter une room
     */
    on('room:leave', () => {
      handleLeaveRoom(socket, io);
    });

    /**
     * Reconnexion à une room après un refresh (F5)
     * Annule le timer de grâce et restaure la session
     */
    on('room:reconnect', (data, callback) => {
      const { roomId, userId, secret } = data;

      if (!isString(roomId) || !isString(userId) || !isString(secret) || !roomId || !userId || !secret) {
        callback(false);
        return;
      }

      if (!isValidRoomCode(roomId)) {
        callback(false);
        return;
      }

      // Le socket est déjà associé à une room
      const prev = roomStore.getUserInfo(socket.id);
      if (prev) {
        const prevRoom = prev.roomId === roomId && prev.userId === userId ? roomStore.getRoom(roomId) : undefined;
        if (prevRoom) {
          // Même session : rien à restaurer
          callback(true, roomStore.sanitizeRoomForUser(prevRoom, userId), userId);
          return;
        }
        // Demande invalide (faux secret…) : on ne quitte PAS la room courante
        if (!roomStore.isValidReconnectRequest(roomId, userId, secret)) {
          callback(false);
          return;
        }
        // Autre room ou autre utilisateur : quitter l'ancienne room proprement
        handleLeaveRoom(socket, io);
      }

      // Restaurer la session dans roomStore (vérifie le secret)
      const room = roomStore.cancelPendingDisconnect(roomId, userId, socket.id, secret);
      if (!room) {
        callback(false);
        return;
      }

      // Annuler le timer de grâce UNIQUEMENT si la reconnexion est acceptée (secret vérifié)
      clearDisconnectTimer(`${roomId}:${userId}`);

      socket.join(roomId);
      callback(true, roomStore.sanitizeRoomForUser(room, userId), userId);
    });

    /**
     * Fermer une room (PO uniquement) - sauvegarde l'historique
     */
    on('room:close', (callback) => {
      if (!roomStore.isPO(socket.id)) {
        callback(false);
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) {
        callback(false);
        return;
      }

      const room = roomStore.getRoom(userInfo.roomId);
      if (!room) {
        callback(false);
        return;
      }

      // Sauvegarder l'historique pour le créateur
      const creatorAccountId = roomStore.getRoomCreator(room.id);
      if (creatorAccountId) {
        userStore.updateRoomHistory(creatorAccountId, room.id, {
          items: roomStore.buildItemHistories(room),
          isActive: false,
          closedAt: Date.now(),
          participantCount: Object.keys(room.users).length,
        });
      }

      callback(true);
    });

    /**
     * Mettre à jour les paramètres de la room (PO uniquement)
     */
    on('room:updateSettings', (data, callback) => {
      if (!roomStore.isPO(socket.id)) {
        callback(false);
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) {
        callback(false);
        return;
      }

      if (!isPlainObject(data.settings)) {
        callback(false);
        return;
      }

      // Filtrer les propriétés autorisées uniquement
      const sanitizedSettings: Partial<RoomSettings> = {};
      if (typeof data.settings.emojisEnabled === 'boolean') {
        sanitizedSettings.emojisEnabled = data.settings.emojisEnabled;
      }

      const success = roomStore.updateRoomSettings(userInfo.roomId, sanitizedSettings);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
      callback(success);
    });

    /**
     * Transférer le rôle d'organisateur (PO) à un autre utilisateur
     */
    on('room:transferPO', (data, callback) => {
      if (!roomStore.isPO(socket.id)) {
        callback(false, 'Seul le PO peut transférer son rôle');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) {
        callback(false, 'Utilisateur non trouvé');
        return;
      }

      const { targetUserId } = data;
      if (!isString(targetUserId)) {
        callback(false, 'Données invalides');
        return;
      }
      const room = roomStore.getRoom(userInfo.roomId);
      if (!room) {
        callback(false, 'Room introuvable');
        return;
      }

      if (!Object.hasOwn(room.users, targetUserId)) {
        callback(false, 'Utilisateur cible introuvable dans la room');
        return;
      }

      if (targetUserId === room.poUserId) {
        callback(false, 'Cet utilisateur est déjà l\'organisateur');
        return;
      }

      const success = roomStore.transferPO(userInfo.roomId, targetUserId);
      if (success) {
        const updatedRoom = roomStore.getRoom(userInfo.roomId);
        if (updatedRoom) {
          emitRoomUpdate(io, userInfo.roomId, updatedRoom);
        }
        callback(true);
      } else {
        callback(false, 'Erreur lors du transfert');
      }
    });

    // ====== GESTION DES ITEMS ======

    /**
     * Créer un nouvel item (PO uniquement)
     */
    on('item:create', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut créer des items');
        return;
      }

      // Gardes de type runtime
      if (!isString(data.title) || (data.description !== undefined && !isString(data.description))) {
        socket.emit('error', 'Données invalides');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      // Vérifier la limite d'items par room
      const room = roomStore.getRoom(userInfo.roomId);
      if (room && room.items.length >= MAX_ITEMS_PER_ROOM) {
        socket.emit('error', `Limite de ${MAX_ITEMS_PER_ROOM} items par room atteinte`);
        return;
      }

      // Validation longueur titre et description + sanitization HTML
      const title = sanitizeInput((data.title || '').trim());
      const description = sanitizeInput((data.description || '').trim());

      if (!title || title.length === 0) {
        socket.emit('error', 'Le titre est requis');
        return;
      }

      if (title.length > MAX_ITEM_TITLE_LENGTH) {
        socket.emit('error', `Le titre ne doit pas dépasser ${MAX_ITEM_TITLE_LENGTH} caractères`);
        return;
      }

      if (description.length > MAX_ITEM_DESCRIPTION_LENGTH) {
        socket.emit('error', `La description ne doit pas dépasser ${MAX_ITEM_DESCRIPTION_LENGTH} caractères`);
        return;
      }

      // Si l'utilisateur est connecté, ajouter aussi l'item à son backlog
      const accountId = userStore.getSocketAccount(socket.id);
      let backlogItemId: string | undefined;
      let backlogOwnerId: string | undefined;

      if (accountId) {
        const backlogItem = userStore.createBacklogItem(accountId, title, description);
        if (backlogItem) {
          backlogItemId = backlogItem.id;
          backlogOwnerId = accountId;
        }
      }

      const item = roomStore.createItem(userInfo.roomId, title, description, backlogItemId, backlogOwnerId);
      if (item) {
        const updatedRoom = roomStore.getRoom(userInfo.roomId);
        if (updatedRoom) {
          emitRoomUpdate(io, userInfo.roomId, updatedRoom);
        }
      }
    });

    /**
     * Modifier un item (PO uniquement)
     */
    on('item:update', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut modifier les items');
        return;
      }

      // Gardes de type runtime
      if (!isString(data.itemId) || (data.title !== undefined && !isString(data.title)) || (data.description !== undefined && !isString(data.description))) {
        socket.emit('error', 'Données invalides');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      // Validation longueur titre et description + sanitization HTML
      const title = data.title !== undefined ? sanitizeInput((data.title || '').trim()) : undefined;
      const description = data.description !== undefined ? sanitizeInput((data.description || '').trim()) : undefined;

      if (title !== undefined && title.length > MAX_ITEM_TITLE_LENGTH) {
        socket.emit('error', `Le titre ne doit pas dépasser ${MAX_ITEM_TITLE_LENGTH} caractères`);
        return;
      }

      if (description !== undefined && description.length > MAX_ITEM_DESCRIPTION_LENGTH) {
        socket.emit('error', `La description ne doit pas dépasser ${MAX_ITEM_DESCRIPTION_LENGTH} caractères`);
        return;
      }

      // Récupérer l'item avant modification pour vérifier s'il vient du backlog
      const room = roomStore.getRoom(userInfo.roomId);
      const item = room?.items.find(i => i.id === data.itemId);

      const success = roomStore.updateItem(userInfo.roomId, data.itemId, {
        title,
        description,
      });

      if (success) {
        const updatedRoom = roomStore.getRoom(userInfo.roomId);
        if (updatedRoom) {
          emitRoomUpdate(io, userInfo.roomId, updatedRoom);
        }

        // Synchroniser avec le backlog si l'item en provient
        if (item?.backlogItemId && item?.backlogOwnerId) {
          userStore.updateBacklogItem(item.backlogOwnerId, item.backlogItemId, {
            title,
            description,
          });
        }
      }
    });

    /**
     * Supprimer un item (PO uniquement)
     */
    on('item:delete', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut supprimer des items');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;
      if (!isString(data.itemId)) return;

      const success = roomStore.deleteItem(userInfo.roomId, data.itemId);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Réordonner un item (PO uniquement)
     */
    on('item:reorder', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut réordonner les items');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;
      if (!isString(data.itemId) || typeof data.newOrder !== 'number' || !Number.isInteger(data.newOrder) || data.newOrder < 0) return;

      const room = roomStore.getRoom(userInfo.roomId);
      if (!room) return;
      const clampedOrder = Math.min(data.newOrder, Math.max(0, room.items.length - 1));
      const success = roomStore.reorderItem(userInfo.roomId, data.itemId, clampedOrder);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Sélectionner l'item actif (PO uniquement)
     * Déclenche un reset automatique des votes
     */
    on('item:select', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut sélectionner un item');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;
      if (!isString(data.itemId)) return;

      const success = roomStore.selectItem(userInfo.roomId, data.itemId);
      if (success) {
        // room:updated contient déjà le nouvel activeItemId et state='idle'
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Définir le score final d'un item (PO uniquement)
     */
    on('item:setFinalScore', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut définir le score final');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;
      if (!isString(data.itemId)) return;

      // Validation du score final
      if (typeof data.score !== 'string' || data.score.length > MAX_FINAL_SCORE_LENGTH) {
        socket.emit('error', 'Score invalide');
        return;
      }
      const sanitizedScore = sanitizeInput(data.score.trim());

      const success = roomStore.setItemFinalScore(userInfo.roomId, data.itemId, sanitizedScore);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);

          // Mettre à jour l'historique avec les items estimés
          const creatorAccountId = roomStore.getRoomCreator(room.id);
          if (creatorAccountId) {
            userStore.updateRoomHistory(creatorAccountId, room.id, {
              items: roomStore.buildItemHistories(room),
              participantCount: Object.keys(room.users).length,
            });
          }

          // Synchroniser le score avec le backlog personnel si l'item en provient
          const scoredItem = room.items.find((item) => item.id === data.itemId);
          if (scoredItem?.backlogItemId && scoredItem?.backlogOwnerId) {
            userStore.updateBacklogItemScore(
              scoredItem.backlogOwnerId,
              scoredItem.backlogItemId,
              sanitizedScore,
              room.id
            );
          }
        }
      }
    });

    // ====== GESTION DES VOTES ======

    /**
     * Démarrer le vote (PO uniquement)
     */
    on('vote:start', () => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut démarrer le vote');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const success = roomStore.startVoting(userInfo.roomId);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      } else {
        socket.emit('error', 'Veuillez sélectionner un item avant de démarrer le vote');
      }
    });

    /**
     * Voter (tous les participants)
     * Changement de vote autorisé avant reveal
     */
    on('vote:cast', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!isString(data.value)) return;
      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const room = roomStore.getRoom(userInfo.roomId);
      if (!room) return;

      if (room.state !== 'voting') {
        socket.emit('error', 'Le vote n\'est pas en cours');
        return;
      }

      // Valider que la valeur du vote existe dans le deck de la room
      if (!room.deck.cards.some((c) => c.value === data.value)) {
        socket.emit('error', 'Valeur de vote invalide');
        return;
      }

      const success = roomStore.castVote(userInfo.roomId, userInfo.userId, data.value);
      if (success) {
        // Envoie la room mise à jour (inclut le statut hasVoted via les votes)
        const updatedRoom = roomStore.getRoom(userInfo.roomId);
        if (updatedRoom) {
          emitRoomUpdate(io, userInfo.roomId, updatedRoom);
        }
      }
    });

    /**
     * Révéler les votes (PO uniquement)
     * Toutes les cartes deviennent visibles pour tous
     */
    on('vote:reveal', () => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut révéler les votes');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const votes = roomStore.revealVotes(userInfo.roomId);
      if (votes !== null) {
        // room:updated contient déjà state='revealed' et les votes
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Réinitialiser les votes (PO uniquement)
     */
    on('vote:reset', () => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut réinitialiser les votes');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const success = roomStore.resetVotes(userInfo.roomId);
      if (success) {
        // room:updated contient déjà state='idle' et votes vidés
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    // ====== GESTION DU TIMER ======

    /**
     * Définir la durée du chronomètre (PO uniquement)
     */
    on('timer:set', (data) => {
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut configurer le chronomètre');
        return;
      }
      if (!checkRateLimit(socket.id + ':timer', RATE_LIMIT_MAX_GENERAL)) return;

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      if (typeof data.durationMs !== 'number' || !isFinite(data.durationMs) || data.durationMs <= 0) {
        socket.emit('error', 'Durée invalide');
        return;
      }

      const success = roomStore.setTimerDuration(userInfo.roomId, data.durationMs);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Démarrer le chronomètre (PO uniquement)
     */
    on('timer:start', () => {
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut démarrer le chronomètre');
        return;
      }
      if (!checkRateLimit(socket.id + ':timer', RATE_LIMIT_MAX_GENERAL)) return;

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const success = roomStore.startTimer(userInfo.roomId);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Stopper le chronomètre (PO uniquement)
     */
    on('timer:stop', () => {
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut arrêter le chronomètre');
        return;
      }
      if (!checkRateLimit(socket.id + ':timer', RATE_LIMIT_MAX_GENERAL)) return;

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const success = roomStore.stopTimer(userInfo.roomId);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Réinitialiser le chronomètre (PO uniquement)
     */
    on('timer:reset', () => {
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut réinitialiser le chronomètre');
        return;
      }
      if (!checkRateLimit(socket.id + ':timer', RATE_LIMIT_MAX_GENERAL)) return;

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const success = roomStore.resetTimer(userInfo.roomId);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    // ====== GESTION DU DECK ======

    /**
     * Mettre à jour le deck (PO uniquement)
     */
    on('deck:update', (data) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) return;
      if (!roomStore.isPO(socket.id)) {
        socket.emit('error', 'Seul le PO peut modifier le deck');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      // Validation complète du deck (structure, taille, URLs, sanitization)
      const validatedDeck = validateDeck(data.deck);
      if (!validatedDeck) {
        socket.emit('error', 'Configuration de deck invalide');
        return;
      }

      // Les images doivent être déjà présentes dans le deck de la room, statiques ou propres à cette room
      const currentRoom = roomStore.getRoom(userInfo.roomId);
      if (!currentRoom) return;
      const currentUrls = collectDeckImageUrls(currentRoom.deck);
      for (const url of collectDeckImageUrls(validatedDeck)) {
        if (!isAllowedDeckImageUrl(url, userInfo.roomId, currentUrls)) {
          socket.emit('error', 'Configuration de deck invalide');
          return;
        }
      }

      const success = roomStore.updateDeck(userInfo.roomId, validatedDeck);
      if (success) {
        const room = roomStore.getRoom(userInfo.roomId);
        if (room) {
          emitRoomUpdate(io, userInfo.roomId, room);
        }
      }
    });

    /**
     * Upload d'une image pour le deck (PO uniquement)
     */
    on('deck:uploadImage', async (data, callback) => {
      if (!ALLOW_UPLOADS) {
        callback(false, 'Les uploads d\'images sont désactivés');
        return;
      }
      if (!checkRateLimit(getClientIp(socket) + ':upload', 20)) {
        callback(false, 'Trop d\'uploads, veuillez réessayer dans une minute');
        return;
      }

      if (!roomStore.isPO(socket.id)) {
        callback(false, 'Action réservée à l\'organisateur');
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) {
        callback(false, 'Session expirée');
        return;
      }
      // Capturé avant l'await : la room peut être supprimée pendant l'upload
      const roomId = userInfo.roomId;

      if (
        (data.type !== 'front' && data.type !== 'back') ||
        !isString(data.imageData) ||
        (data.type === 'front' && !(isString(data.cardValue) && data.cardValue.length > 0))
      ) {
        callback(false, 'Données invalides');
        return;
      }

      // Carte inexistante : refus avant toute écriture disque
      const uploadRoom = roomStore.getRoom(roomId);
      if (data.type === 'front' && !uploadRoom?.deck.cards.some((c) => c.value === data.cardValue)) {
        callback(false, 'Carte introuvable');
        return;
      }

      try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', roomId);
        const safeCardValue = data.cardValue ? sanitizeFileName(data.cardValue) : '';
        const baseName = data.type === 'back' ? 'back' : `card_${safeCardValue}`;

        const result = await processImageUpload(data.imageData, uploadDir, `${baseName}.img`);

        // Room supprimée pendant l'upload : le dossier vient d'être recréé, on le supprime
        if (!roomStore.getRoom(roomId)) {
          void deleteRoomUploads(roomId);
          callback(false, 'Room introuvable');
          return;
        }

        if (!result.success) {
          callback(false, result.error);
          return;
        }

        // ?t= : cache-busting (le nom de fichier est réutilisé à chaque upload)
        const url = `/uploads/${roomId}/${result.url}?t=${Date.now()}`;
        callback(true, url);

        const room = roomStore.getRoom(roomId);
        if (room) {
          if (data.type === 'back') {
            room.deck.backImageUrl = url;
          } else if (data.cardValue) {
            const card = room.deck.cards.find((c) => c.value === data.cardValue);
            if (card) card.frontImageUrl = url;
          }
          emitRoomUpdate(io, roomId, room);
        }
      } catch (error: unknown) {
        console.error('Erreur upload image:', error);
        callback(false, 'Erreur serveur');
      }
    });

    // ====== EMOJIS ======

    /**
     * Envoyer un emoji à un utilisateur
     */
    on('emoji:send', (data) => {
      if (!checkRateLimit(socket.id + ':emoji', 30)) return; // 30 emojis/min max
      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo) return;

      const room = roomStore.getRoom(userInfo.roomId);
      if (!room) return;

      // Vérifier si les emojis sont activés
      if (room.settings?.emojisEnabled === false) return;

      // Valider l'emoji contre la liste autorisée
      if (!ALLOWED_EMOJIS.has(data.emoji)) return;

      const fromUser = room.users[userInfo.userId];
      if (!fromUser) return;

      // Valider que targetUserId est un utilisateur de la room
      if (typeof data.targetUserId !== 'string' || !Object.hasOwn(room.users, data.targetUserId)) return;

      // Envoyer l'emoji à tous les utilisateurs de la room
      io.to(userInfo.roomId).emit('emoji:received', {
        fromUserId: userInfo.userId,
        fromUserName: fromUser.name,
        targetUserId: data.targetUserId,
        emoji: data.emoji,
      });
    });

    // ====== BACKLOG PERSONNEL ======

    /**
     * Récupérer les items du backlog personnel
     */
    on('backlog:getItems', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback([]);
        return;
      }
      const items = userStore.getBacklogItems(accountId);
      callback(items);
    });

    /**
     * Créer un item dans le backlog personnel
     */
    on('backlog:create', (data, callback) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) { callback(false); return; }
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      const { title, description } = data;

      // Gardes de type runtime
      if (!isString(title) || (description !== undefined && !isString(description))) {
        callback(false);
        return;
      }

      if (!title || title.trim().length === 0) {
        callback(false);
        return;
      }

      if (title.trim().length > MAX_ITEM_TITLE_LENGTH) {
        callback(false);
        return;
      }

      if (description && description.trim().length > MAX_ITEM_DESCRIPTION_LENGTH) {
        callback(false);
        return;
      }

      const item = userStore.createBacklogItem(accountId, sanitizeInput(title.trim()), description ? sanitizeInput(description.trim()) : description);
      callback(!!item, item || undefined);
    });

    /**
     * Modifier un item du backlog personnel
     */
    on('backlog:update', (data, callback) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) { callback(false); return; }
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      const { itemId, title, description } = data;

      // Gardes de type runtime
      if (!isString(itemId) || (title !== undefined && !isString(title)) || (description !== undefined && !isString(description))) {
        callback(false);
        return;
      }

      if (title !== undefined && title.trim().length > MAX_ITEM_TITLE_LENGTH) {
        callback(false);
        return;
      }

      if (description !== undefined && description.trim().length > MAX_ITEM_DESCRIPTION_LENGTH) {
        callback(false);
        return;
      }

      const sanitizedTitle = title !== undefined ? sanitizeInput(title.trim()) : undefined;
      const sanitizedDescription = description !== undefined ? sanitizeInput(description.trim()) : undefined;

      const success = userStore.updateBacklogItem(accountId, itemId, { title: sanitizedTitle, description: sanitizedDescription });
      callback(success);
    });

    /**
     * Supprimer un item du backlog personnel
     */
    on('backlog:delete', (data, callback) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) { callback(false); return; }
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      if (!isString(data.itemId)) {
        callback(false);
        return;
      }

      const success = userStore.deleteBacklogItem(accountId, data.itemId);
      callback(success);
    });

    /**
     * Réordonner un item du backlog personnel
     */
    on('backlog:reorder', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      const { itemId, newPriority } = data;
      if (!isString(itemId) || !Number.isInteger(newPriority) || !itemId || newPriority < 1) {
        callback(false);
        return;
      }

      const success = userStore.reorderBacklogItem(accountId, itemId, newPriority);
      callback(success);
    });

    /**
     * Importer des items du backlog personnel vers une room
     */
    on('backlog:import', (data, callback) => {
      if (!checkRateLimit(socket.id, RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }

      const { roomId, itemIds: rawItemIds } = data;

      if (!isString(roomId)) {
        callback(false);
        return;
      }

      // Valider que itemIds est un tableau de taille raisonnable
      if (!Array.isArray(rawItemIds) || rawItemIds.length === 0 || rawItemIds.length > MAX_ITEMS_PER_ROOM) {
        callback(false);
        return;
      }
      const itemIds = rawItemIds.filter(isString);

      // Vérifier que l'utilisateur est bien le PO de la room
      if (!roomStore.isPO(socket.id)) {
        callback(false);
        return;
      }

      const userInfo = roomStore.getUserInfo(socket.id);
      if (!userInfo || userInfo.roomId !== roomId) {
        callback(false);
        return;
      }

      // Récupérer les items du backlog (Set pour lookup O(1))
      const backlogItems = userStore.getBacklogItems(accountId);
      const itemIdSet = new Set(itemIds);
      const selectedItems = backlogItems.filter(item => itemIdSet.has(item.id));

      // Vérifier la limite d'items par room
      const room = roomStore.getRoom(roomId);
      if (room && room.items.length + selectedItems.length > MAX_ITEMS_PER_ROOM) {
        callback(false, undefined);
        return;
      }

      let count = 0;
      for (const item of selectedItems) {
        // Stocker l'association entre l'item de la room et l'item du backlog
        const createdItem = roomStore.createItem(
          roomId,
          item.title,
          item.description || '',
          item.id,        // backlogItemId
          accountId       // backlogOwnerId
        );
        if (createdItem) {
          count++;
        }
      }

      if (count > 0) {
        const room = roomStore.getRoom(roomId);
        if (room) {
          emitRoomUpdate(io, roomId, room);
        }
      }

      callback(true, count);
    });

    // ====== ADMINISTRATION ======

    /**
     * Vérifie si l'utilisateur est admin
     */
    on('admin:checkAccess', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId) {
        callback(false);
        return;
      }
      const isAdmin = userStore.isAdmin(accountId);
      callback(isAdmin);
    });

    /**
     * Récupérer tous les utilisateurs (admin uniquement)
     */
    on('admin:getAllUsers', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      const users = userStore.getAllUsers();
      callback(true, users);
    });

    /**
     * Récupérer toutes les sessions (admin uniquement)
     */
    on('admin:getAllSessions', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      const sessions = userStore.getAllSessions();
      callback(true, sessions);
    });

    /**
     * Récupérer tout l'historique des rooms (admin uniquement)
     */
    on('admin:getAllRoomHistory', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      const histories = userStore.getAllRoomHistories();
      callback(true, histories);
    });

    /**
     * Récupérer tous les backlogs (admin uniquement)
     */
    on('admin:getAllBacklogs', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      const backlogs = userStore.getAllBacklogs();
      callback(true, backlogs);
    });

    /**
     * Récupérer les statistiques globales (admin uniquement)
     */
    on('admin:getStats', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      const stats = userStore.getGlobalStats();
      callback(true, stats);
    });

    /**
     * Récupérer les rooms actives (admin uniquement)
     */
    on('admin:getActiveRooms', (callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_GENERAL)) {
        callback(false);
        return;
      }

      callback(true, roomStore.getActiveRoomSummaries());
    });

    /**
     * Supprimer un utilisateur (admin uniquement)
     */
    on('admin:deleteUser', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false, 'Acces refuse');
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_AUTH)) {
        callback(false, 'Trop de tentatives');
        return;
      }

      if (!isString(data.userId)) {
        callback(false, 'Données invalides');
        return;
      }

      // Empêcher l'admin de se supprimer lui-même
      if (data.userId === accountId) {
        callback(false, 'Impossible de supprimer votre propre compte');
        return;
      }

      const success = userStore.deleteUser(data.userId);
      if (success) {
        // Invalider les sessions socket du compte supprimé et nettoyer ses fichiers
        userStore.clearSocketAccountsForUser(data.userId);
        void deleteUserUploads(data.userId);
      }
      callback(success, success ? undefined : 'Erreur lors de la suppression');
    });

    /**
     * Révoquer une session (admin uniquement)
     */
    on('admin:revokeSession', (data, callback) => {
      const accountId = userStore.getSocketAccount(socket.id);
      if (!accountId || !userStore.isAdmin(accountId)) {
        callback(false);
        return;
      }

      if (!checkRateLimit(socket.id + ':admin', RATE_LIMIT_MAX_AUTH)) {
        callback(false);
        return;
      }

      if (!isString(data.token)) {
        callback(false);
        return;
      }

      const success = userStore.revokeSessionByPrefix(data.token);
      callback(success);
    });

    // ====== DÉCONNEXION ======

    socket.on('disconnect', () => {
      try {
        handleDisconnect(socket, io);
      } catch (e) {
        console.error('[socket] disconnect failed', e);
      }
    });
  });
}

/**
 * Gère le départ d'une room (sans déconnecter la session auth)
 * La suppression de la room (PO parti, room vide) est entièrement gérée par le store
 * et le listener onRoomRemoved : historique, notification, timers et uploads.
 */
function handleLeaveRoom(socket: SocketClient, io: SocketServer): void {
  const userInfo = roomStore.getUserInfo(socket.id);

  // Annuler un éventuel timer de reconnexion pending pour cet utilisateur
  if (userInfo) {
    clearDisconnectTimer(`${userInfo.roomId}:${userInfo.userId}`);
  }

  const result = roomStore.leaveRoom(socket.id);

  if (result.roomClosed) {
    // Le listener a tout géré (room:closed, socketsLeave, historique, uploads)
    return;
  }

  if (result.roomId && result.userId) {
    if (result.room) {
      // Un utilisateur normal a quitté — room:updated contient déjà la liste mise à jour
      emitRoomUpdate(io, result.roomId, result.room);

      // Mettre à jour le nombre de participants dans l'historique
      const creatorAccountId = roomStore.getRoomCreator(result.roomId);
      if (creatorAccountId) {
        userStore.updateRoomHistory(creatorAccountId, result.roomId, {
          participantCount: Object.keys(result.room.users).length,
        });
      }
    }

    socket.leave(result.roomId);
  }
  // Ne pas nettoyer la session auth ici - l'utilisateur reste connecté
}

/**
 * Gère la déconnexion complète d'un utilisateur (socket disconnect)
 * Utilise un délai de grâce pour permettre la reconnexion (F5)
 */
function handleDisconnect(socket: SocketClient, io: SocketServer): void {
  // Marquer comme pending au lieu de quitter immédiatement
  const pending = roomStore.markPendingDisconnect(socket.id);

  if (pending) {
    const { roomId, userId } = pending;
    const timerKey = `${roomId}:${userId}`;

    // Délai de grâce (configurable par RECONNECT_GRACE_PERIOD_MS, surtout pour les tests)
    const gracePeriod = getEnvInt('RECONNECT_GRACE_PERIOD_MS', DEFAULT_RECONNECT_GRACE_PERIOD);

    // Démarrer un timer de grâce
    const timer = setTimeout(() => {
      try {
        disconnectTimers.delete(timerKey);

        const room = roomStore.getRoom(roomId);
        const result = roomStore.executePendingDisconnect(roomId, userId);

        // Room fermée (PO non revenu) ou vide : le listener onRoomRemoved a tout géré
        if (result.roomClosed) {
          console.log(`[Room] Room ${roomId} closed after PO disconnect timeout`);
        } else if (result.room) {
          // Utilisateur normal n'est pas revenu — room:updated contient la liste mise à jour
          emitRoomUpdate(io, roomId, result.room);

          const creatorAccountId = roomStore.getRoomCreator(roomId);
          if (creatorAccountId) {
            userStore.updateRoomHistory(creatorAccountId, roomId, {
              participantCount: Object.keys(result.room.users).length,
            });
          }

          console.log(`[Room] User ${userId} removed from room ${roomId} after disconnect timeout`);
        } else if (room) {
          // La room est devenue vide et a été supprimée
          console.log(`[Room] Room ${roomId} removed (empty) after disconnect timeout`);
        }
      } catch (e) {
        console.error('[Room] disconnect timeout handler failed', e);
      }
    }, gracePeriod);

    disconnectTimers.set(timerKey, timer);
    console.log(`[Room] User ${userId} disconnect pending for room ${roomId} (${gracePeriod / 1000}s grace period)`);
  }

  // Nettoyer la session auth
  userStore.clearSocketAccount(socket.id);
}
