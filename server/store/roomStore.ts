/**
 * Store in-memory pour la gestion des rooms
 * Stocke toutes les données des rooms de Planning Poker
 */

import { Room, User, Item, Vote, DeckConfig, RoomState, RoomSettings, TableConfig, ItemHistory } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as userStore from './userStore';

// Couleur de carte par défaut (bleu)
const DEFAULT_CARD_COLOR = '#3B82F6';

// Dos de cartes disponibles (PNG transparents)
const CARD_BACKS = [
  '/images/cartes/back/default/BackCarreau.png',
  '/images/cartes/back/default/BackCoeur.png',
  '/images/cartes/back/default/BackPique.png',
  '/images/cartes/back/default/BackTrefle.png',
];

/**
 * Retourne une URL de dos de carte aléatoire
 */
function getRandomCardBackUrl(): string {
  return CARD_BACKS[crypto.randomInt(CARD_BACKS.length)];
}

/**
 * Valide qu'une couleur est un code hex valide
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Deck par défaut selon les spécifications
const DEFAULT_DECK: DeckConfig = {
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

// Configuration
const MAX_PARTICIPANTS_PER_ROOM = parseInt(process.env.MAX_PARTICIPANTS_PER_ROOM || '0', 10);
const DEFAULT_ROOM_TTL_MINUTES = parseInt(process.env.ROOM_TTL_MINUTES || '180', 10);

// Stockage en mémoire des rooms
const rooms: Map<string, Room> = new Map();

// Intervalle de nettoyage des rooms expirées (1 minute)
const CLEANUP_INTERVAL = 60 * 1000;

// Stockage des mots de passe des rooms (séparé pour ne pas envoyer aux clients)
const roomPasswords: Map<string, string> = new Map();

// Association socketId -> { roomId, userId }
const socketToUser: Map<string, { roomId: string; userId: string }> = new Map();

// Index inversé roomId -> Set<socketId> pour éviter les scans linéaires
const roomToSockets: Map<string, Set<string>> = new Map();

// Pending disconnects pour le délai de grâce (clé = `${roomId}:${userId}`)
const pendingDisconnects: Map<string, { roomId: string; userId: string }> = new Map();

// Index inversé roomId -> Set<pendingDisconnectKeys> pour éviter les scans linéaires
const pendingDisconnectsByRoom: Map<string, Set<string>> = new Map();

// Secrets de reconnexion (clé = `${roomId}:${userId}`, valeur = token aléatoire)
const reconnectSecrets: Map<string, string> = new Map();

// Cache créateur de room (roomId -> accountId) pour éviter les requêtes SQLite répétées
const roomCreators: Map<string, string> = new Map();

/**
 * Ajoute une association socket -> user et met à jour l'index inversé
 */
function addSocketMapping(socketId: string, roomId: string, userId: string): void {
  socketToUser.set(socketId, { roomId, userId });
  let sockets = roomToSockets.get(roomId);
  if (!sockets) {
    sockets = new Set();
    roomToSockets.set(roomId, sockets);
  }
  sockets.add(socketId);
}

/**
 * Supprime une association socket -> user et met à jour l'index inversé
 */
function removeSocketMapping(socketId: string): void {
  const info = socketToUser.get(socketId);
  if (info) {
    const sockets = roomToSockets.get(info.roomId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        roomToSockets.delete(info.roomId);
      }
    }
  }
  socketToUser.delete(socketId);
}

/**
 * Supprime toutes les associations socket pour une room via l'index inversé
 */
function removeAllSocketsForRoom(roomId: string): void {
  const sockets = roomToSockets.get(roomId);
  if (sockets) {
    for (const sid of sockets) {
      socketToUser.delete(sid);
    }
    roomToSockets.delete(roomId);
  }
}

/**
 * Génère un code de room unique (6 caractères alphanumériques)
 * Utilise crypto.randomInt pour une génération cryptographiquement sécurisée
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(crypto.randomInt(chars.length));
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Hash un mot de passe de room avec SHA-256 + sel par room
 * Le sel empêche les rainbow tables et rend chaque hash unique par room
 */
function hashRoomPassword(password: string, roomId: string): string {
  return crypto.createHash('sha256').update(roomId + ':' + password).digest('hex');
}

/**
 * Compare un hash de mot de passe en temps constant pour éviter les timing attacks
 */
function verifyRoomPassword(password: string, roomId: string, storedHash: string): boolean {
  const candidateHash = hashRoomPassword(password, roomId);
  try {
    return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Crée une nouvelle room avec le PO
 */
export function createRoom(poName: string, socketId: string, password?: string, customDeck?: DeckConfig, customTable?: TableConfig, userCardBackUrl?: string, ttlMinutes?: number, cardColor?: string): { room: Room; userId: string; reconnectSecret: string } {
  const roomId = generateRoomCode();
  const userId = uuidv4();

  const poUser: User = {
    id: userId,
    name: poName,
    isPO: true,
    cardColor: cardColor && isValidHexColor(cardColor) ? cardColor : DEFAULT_CARD_COLOR,
    cardBackUrl: userCardBackUrl || getRandomCardBackUrl(),
  };

  const hasPassword = !!password && password.trim().length > 0;

  // Utilise le deck personnalisé si fourni, sinon le deck par défaut
  const deckToUse = customDeck ? JSON.parse(JSON.stringify(customDeck)) : { ...DEFAULT_DECK };

  // Calcul du TTL
  const effectiveTtl = ttlMinutes && ttlMinutes > 0 ? Math.min(ttlMinutes, DEFAULT_ROOM_TTL_MINUTES) : DEFAULT_ROOM_TTL_MINUTES;
  const now = Date.now();

  const room: Room = {
    id: roomId,
    poUserId: userId,
    users: { [userId]: poUser },
    items: [],
    activeItemId: null,
    state: 'idle',
    deck: deckToUse,
    hasPassword,
    tableConfig: customTable ? JSON.parse(JSON.stringify(customTable)) : undefined,
    createdAt: now,
    expiresAt: now + (effectiveTtl * 60 * 1000),
    settings: { emojisEnabled: true },
  };

  rooms.set(roomId, room);
  addSocketMapping(socketId, roomId, userId);

  // Stocker le hash du mot de passe séparément si fourni (salé par roomId)
  if (hasPassword) {
    roomPasswords.set(roomId, hashRoomPassword(password!.trim(), roomId));
  }

  // Générer un secret de reconnexion
  const reconnectSecret = crypto.randomBytes(32).toString('hex');
  reconnectSecrets.set(`${roomId}:${userId}`, reconnectSecret);

  return { room, userId, reconnectSecret };
}

/**
 * Rejoint une room existante
 */
export function joinRoom(
  roomId: string,
  userName: string,
  socketId: string,
  password?: string,
  userCardBackUrl?: string,
  cardColor?: string
): { success: boolean; room?: Room; userId?: string; error?: string; reconnectSecret?: string } {
  const room = rooms.get(roomId);

  if (!room) {
    return { success: false, error: 'Room introuvable' };
  }

  // Vérifier le mot de passe si la room en a un (comparaison constant-time)
  if (room.hasPassword) {
    const storedHash = roomPasswords.get(roomId);
    if (!password || !storedHash || !verifyRoomPassword(password, roomId, storedHash)) {
      return { success: false, error: 'Mot de passe incorrect' };
    }
  }

  // Vérifier la limite de participants
  if (MAX_PARTICIPANTS_PER_ROOM > 0) {
    const currentCount = Object.keys(room.users).length;
    if (currentCount >= MAX_PARTICIPANTS_PER_ROOM) {
      return { success: false, error: `La room est pleine (maximum ${MAX_PARTICIPANTS_PER_ROOM} participants)` };
    }
  }

  const userId = uuidv4();
  const user: User = {
    id: userId,
    name: userName,
    isPO: false,
    cardColor: cardColor && isValidHexColor(cardColor) ? cardColor : DEFAULT_CARD_COLOR,
    cardBackUrl: userCardBackUrl || getRandomCardBackUrl(),
  };

  room.users[userId] = user;
  addSocketMapping(socketId, roomId, userId);

  // Générer un secret de reconnexion
  const reconnectSecret = crypto.randomBytes(32).toString('hex');
  reconnectSecrets.set(`${roomId}:${userId}`, reconnectSecret);

  return { success: true, room, userId, reconnectSecret };
}

/**
 * Quitte une room (déconnexion ou départ volontaire)
 * Si le PO quitte, la room est fermée pour tous
 */
export function leaveRoom(socketId: string): { roomId?: string; userId?: string; room?: Room; roomClosed?: boolean; closedRoom?: Room } {
  const userInfo = socketToUser.get(socketId);
  if (!userInfo) {
    return {};
  }

  const { roomId, userId } = userInfo;
  const room = rooms.get(roomId);

  if (!room) {
    removeSocketMapping(socketId);
    return {};
  }

  // Si le PO quitte, fermer la room pour tous
  if (userId === room.poUserId) {
    // Copier la room avant suppression pour sauvegarder l'historique
    // Clone léger : seuls items et users sont nécessaires pour l'historique
    const closedRoom: Room = {
      ...room,
      users: { ...room.users },
      items: room.items.map(i => ({ ...i, votes: { ...i.votes } })),
    };

    // Nettoyer toutes les associations socket -> user pour cette room
    removeAllSocketsForRoom(roomId);

    // Nettoyer les secrets de reconnexion pour cette room
    for (const uid of Object.keys(room.users)) {
      reconnectSecrets.delete(`${roomId}:${uid}`);
    }

    // Supprimer la room
    rooms.delete(roomId);
    roomPasswords.delete(roomId);
    roomCreators.delete(roomId);

    return { roomId, userId, roomClosed: true, closedRoom };
  }

  // Supprime l'utilisateur de la room
  delete room.users[userId];
  reconnectSecrets.delete(`${roomId}:${userId}`);

  // Supprime les votes de cet utilisateur sur tous les items
  room.items.forEach((item) => {
    delete item.votes[userId];
  });

  removeSocketMapping(socketId);

  // Si la room est vide, la supprimer
  if (Object.keys(room.users).length === 0) {
    rooms.delete(roomId);
    roomPasswords.delete(roomId);
    roomCreators.delete(roomId);
    return { roomId, userId };
  }

  return { roomId, userId, room };
}

/**
 * Récupère une room par son ID
 */
export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

/**
 * Vérifie si une room existe et si elle a un mot de passe
 */
export function checkRoomPassword(roomId: string): { exists: boolean; hasPassword: boolean } {
  const room = rooms.get(roomId);
  if (!room) {
    return { exists: false, hasPassword: false };
  }
  return { exists: true, hasPassword: room.hasPassword };
}

/**
 * Récupère les infos utilisateur depuis le socketId
 */
export function getUserInfo(socketId: string): { roomId: string; userId: string } | undefined {
  return socketToUser.get(socketId);
}

/**
 * Vérifie si un utilisateur est le PO de sa room
 */
export function isPO(socketId: string): boolean {
  const userInfo = socketToUser.get(socketId);
  if (!userInfo) return false;

  const room = rooms.get(userInfo.roomId);
  if (!room) return false;

  return room.poUserId === userInfo.userId;
}

/**
 * Crée un nouvel item dans une room
 */
export function createItem(
  roomId: string,
  title: string,
  description: string,
  backlogItemId?: string,
  backlogOwnerId?: string
): Item | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  const item: Item = {
    id: uuidv4(),
    title,
    description,
    order: room.items.length,
    votes: {},
    backlogItemId,
    backlogOwnerId,
  };

  room.items.push(item);
  return item;
}

/**
 * Met à jour un item
 */
export function updateItem(
  roomId: string,
  itemId: string,
  updates: { title?: string; description?: string }
): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const item = room.items.find((i) => i.id === itemId);
  if (!item) return false;

  if (updates.title !== undefined) item.title = updates.title;
  if (updates.description !== undefined) item.description = updates.description;

  return true;
}

/**
 * Supprime un item
 */
export function deleteItem(roomId: string, itemId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const index = room.items.findIndex((i) => i.id === itemId);
  if (index === -1) return false;

  room.items.splice(index, 1);

  // Réorganise les ordres
  room.items.forEach((item, idx) => {
    item.order = idx;
  });

  // Si l'item actif est supprimé, le désélectionner
  if (room.activeItemId === itemId) {
    room.activeItemId = null;
    room.state = 'idle';
  }

  return true;
}

/**
 * Réordonne un item
 */
export function reorderItem(roomId: string, itemId: string, newOrder: number): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const itemIndex = room.items.findIndex((i) => i.id === itemId);
  if (itemIndex === -1) return false;

  const [item] = room.items.splice(itemIndex, 1);
  room.items.splice(newOrder, 0, item);

  // Met à jour les ordres
  room.items.forEach((i, idx) => {
    i.order = idx;
  });

  return true;
}

/**
 * Sélectionne l'item actif (reset automatique des votes)
 * Si le timer tourne et qu'on change d'item, flush le temps écoulé sur l'ancien item
 */
export function selectItem(roomId: string, itemId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const item = room.items.find((i) => i.id === itemId);
  if (!item) return false;

  // Si on change d'item, flush elapsed time du timer sur l'ancien item
  if (room.activeItemId !== itemId && room.activeItemId && room.timerStartedAt) {
    const oldItem = room.items.find((i) => i.id === room.activeItemId);
    if (oldItem) {
      const elapsed = Date.now() - room.timerStartedAt;
      oldItem.elapsedTime = (oldItem.elapsedTime || 0) + elapsed;
    }
    // Redémarrer le timer pour le nouvel item
    room.timerStartedAt = Date.now();
  }

  // Si on change d'item, reset les votes du nouvel item
  if (room.activeItemId !== itemId) {
    item.votes = {};
  }

  room.activeItemId = itemId;
  room.state = 'idle';

  return true;
}

/**
 * Définit le score final d'un item
 */
export function setItemFinalScore(roomId: string, itemId: string, score: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const item = room.items.find((i) => i.id === itemId);
  if (!item) return false;

  item.finalScore = score;
  return true;
}

/**
 * Démarre le vote sur l'item actif
 */
export function startVoting(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.activeItemId) return false;

  room.state = 'voting';
  return true;
}

/**
 * Enregistre un vote
 */
export function castVote(roomId: string, userId: string, value: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.activeItemId || room.state !== 'voting') return false;

  const item = room.items.find((i) => i.id === room.activeItemId);
  if (!item) return false;

  item.votes[userId] = {
    value,
    createdAt: Date.now(),
  };

  return true;
}

/**
 * Révèle les votes
 */
export function revealVotes(roomId: string): Record<string, Vote> | null {
  const room = rooms.get(roomId);
  if (!room || !room.activeItemId || room.state !== 'voting') return null;

  room.state = 'revealed';

  const item = room.items.find((i) => i.id === room.activeItemId);
  return item?.votes || {};
}

/**
 * Réinitialise les votes de l'item actif
 */
export function resetVotes(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.activeItemId) return false;

  const item = room.items.find((i) => i.id === room.activeItemId);
  if (!item) return false;

  item.votes = {};
  room.state = 'idle';

  return true;
}

/**
 * Met à jour le deck de la room
 */
export function updateDeck(roomId: string, deck: DeckConfig): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  room.deck = deck;
  return true;
}

/**
 * Met à jour les paramètres de la room
 */
export function updateRoomSettings(roomId: string, settings: Partial<RoomSettings>): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  room.settings = { ...room.settings, ...settings };
  return true;
}

/**
 * Transfère le rôle de PO à un autre utilisateur de la room
 */
export function transferPO(roomId: string, newPoUserId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const newPo = room.users[newPoUserId];
  if (!newPo) return false;

  // Retirer le flag isPO de l'ancien PO
  const oldPo = room.users[room.poUserId];
  if (oldPo) {
    oldPo.isPO = false;
  }

  // Mettre à jour le nouveau PO
  newPo.isPO = true;
  room.poUserId = newPoUserId;

  return true;
}

// ====== GESTION DU TIMER ======
//
// Le chronomètre PO permet de timeboxer les discussions.
// Il est indépendant du cycle de vote (idle/voting/revealed).
//
// Architecture "zéro trafic pendant le countdown" :
// - Le serveur stocke `timerStartedAt` (timestamp absolu) + `timerDuration`
// - Chaque client calcule localement : remaining = duration - (now - startedAt)
// - Broadcast uniquement sur start/stop/reset/set (pas de tick serveur)
//
// Le remaining peut devenir négatif (overtime) — c'est intentionnel.
// L'elapsed est accumulé par item (item.elapsedTime) pour le suivi du temps.

const TIMER_MIN_MS = 10 * 1000;      // 10 secondes
const TIMER_MAX_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Définit la durée du chronomètre (clamp entre 10s et 60min).
 * Reset automatiquement l'état du timer (arrêté, pas de remaining).
 */
export function setTimerDuration(roomId: string, durationMs: number): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  room.timerDuration = Math.max(TIMER_MIN_MS, Math.min(TIMER_MAX_MS, durationMs));
  room.timerStartedAt = undefined;
  room.timerStoppedRemaining = undefined;

  return true;
}

/**
 * Démarre le chronomètre. No-op si déjà running.
 *
 * Reprise après pause : on calcule un `startedAt` fictif dans le passé
 * pour que le calcul client (duration - (now - startedAt)) retombe
 * exactement sur le remaining sauvegardé au moment du stop.
 *
 * Exemple : durée 60s, stoppé avec 20s remaining
 *   → startedAt = now - (60000 - 20000) = now - 40000
 *   → côté client : 60000 - (now - (now - 40000)) = 60000 - 40000 = 20000 ✓
 */
export function startTimer(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.timerDuration) return false;
  if (room.timerStartedAt) return true; // déjà running

  const remaining = room.timerStoppedRemaining ?? room.timerDuration;
  room.timerStartedAt = Date.now() - (room.timerDuration - remaining);
  room.timerStoppedRemaining = undefined;

  return true;
}

/**
 * Stoppe le chronomètre.
 * - Calcule et sauvegarde le remaining (peut être négatif en overtime)
 * - Accumule l'elapsed sur l'item actif (pour le suivi du temps par item)
 */
export function stopTimer(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.timerDuration || !room.timerStartedAt) return false;

  const elapsed = Date.now() - room.timerStartedAt;
  const base = room.timerStoppedRemaining ?? room.timerDuration;
  room.timerStoppedRemaining = base - elapsed;

  // Accumuler le temps écoulé sur l'item actif
  if (room.activeItemId) {
    const activeItem = room.items.find((i) => i.id === room.activeItemId);
    if (activeItem) {
      activeItem.elapsedTime = (activeItem.elapsedTime || 0) + elapsed;
    }
  }

  room.timerStartedAt = undefined;

  return true;
}

/**
 * Réinitialise le chronomètre à la durée configurée.
 * La durée (timerDuration) est conservée, seul l'état est remis à zéro.
 */
export function resetTimer(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.timerDuration) return false;

  room.timerStartedAt = undefined;
  room.timerStoppedRemaining = undefined;

  return true;
}

/**
 * Récupère l'item actif d'une room
 */
export function getActiveItem(roomId: string): Item | null {
  const room = rooms.get(roomId);
  if (!room || !room.activeItemId) return null;

  return room.items.find((i) => i.id === room.activeItemId) || null;
}

/**
 * Marque un utilisateur comme déconnexion en attente (grace period).
 * Retire le socketId de socketToUser mais garde l'utilisateur dans la room.
 * Retourne les infos { roomId, userId } ou undefined si non trouvé.
 */
export function markPendingDisconnect(socketId: string): { roomId: string; userId: string } | undefined {
  const userInfo = socketToUser.get(socketId);
  if (!userInfo) return undefined;

  const { roomId, userId } = userInfo;
  const room = rooms.get(roomId);
  if (!room) {
    removeSocketMapping(socketId);
    return undefined;
  }

  // Retirer l'association socket mais garder l'utilisateur dans la room
  removeSocketMapping(socketId);
  const key = `${roomId}:${userId}`;
  pendingDisconnects.set(key, { roomId, userId });
  let roomPending = pendingDisconnectsByRoom.get(roomId);
  if (!roomPending) {
    roomPending = new Set();
    pendingDisconnectsByRoom.set(roomId, roomPending);
  }
  roomPending.add(key);

  return { roomId, userId };
}

/**
 * Annule une déconnexion en attente (l'utilisateur revient avec un nouveau socket).
 * Vérifie le secret de reconnexion pour empêcher le hijack de session.
 * Recrée l'entrée socketToUser et retourne la Room.
 */
export function cancelPendingDisconnect(roomId: string, userId: string, newSocketId: string, secret?: string): Room | undefined {
  const key = `${roomId}:${userId}`;
  if (!pendingDisconnects.has(key)) return undefined;

  // Vérifier le secret de reconnexion (comparaison constant-time)
  const storedSecret = reconnectSecrets.get(key);
  if (!storedSecret || !secret || storedSecret.length !== secret.length) {
    return undefined;
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(storedSecret), Buffer.from(secret))) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const room = rooms.get(roomId);
  if (!room || !room.users[userId]) {
    pendingDisconnects.delete(key);
    pendingDisconnectsByRoom.get(roomId)?.delete(key);
    return undefined;
  }

  pendingDisconnects.delete(key);
  pendingDisconnectsByRoom.get(roomId)?.delete(key);
  addSocketMapping(newSocketId, roomId, userId);

  return room;
}

/**
 * Exécute une déconnexion en attente (le timer a expiré, l'utilisateur n'est pas revenu).
 * Retire l'utilisateur de la room (même logique que leaveRoom).
 */
export function executePendingDisconnect(roomId: string, userId: string): { room?: Room; roomClosed?: boolean; closedRoom?: Room } {
  const key = `${roomId}:${userId}`;
  pendingDisconnects.delete(key);
  pendingDisconnectsByRoom.get(roomId)?.delete(key);
  reconnectSecrets.delete(key);

  const room = rooms.get(roomId);
  if (!room || !room.users[userId]) {
    return {};
  }

  // Si le PO quitte, fermer la room pour tous
  if (userId === room.poUserId) {
    // Clone léger : seuls items et users sont nécessaires pour l'historique
    const closedRoom: Room = {
      ...room,
      users: { ...room.users },
      items: room.items.map(i => ({ ...i, votes: { ...i.votes } })),
    };

    // Nettoyer toutes les associations socket -> user pour cette room
    removeAllSocketsForRoom(roomId);

    // Nettoyer les secrets de reconnexion pour cette room
    for (const uid of Object.keys(room.users)) {
      reconnectSecrets.delete(`${roomId}:${uid}`);
    }

    // Nettoyer les pending disconnects pour cette room via l'index inversé (O(1))
    const roomPendingKeys = pendingDisconnectsByRoom.get(roomId);
    if (roomPendingKeys) {
      for (const k of roomPendingKeys) {
        pendingDisconnects.delete(k);
      }
      pendingDisconnectsByRoom.delete(roomId);
    }

    rooms.delete(roomId);
    roomPasswords.delete(roomId);
    roomCreators.delete(roomId);

    return { roomClosed: true, closedRoom };
  }

  // Supprime l'utilisateur de la room
  delete room.users[userId];

  // Supprime les votes de cet utilisateur sur tous les items
  room.items.forEach((item) => {
    delete item.votes[userId];
  });

  // Si la room est vide, la supprimer
  if (Object.keys(room.users).length === 0) {
    rooms.delete(roomId);
    roomPasswords.delete(roomId);
    roomCreators.delete(roomId);
    return {};
  }

  return { room };
}

/**
 * Nettoie les rooms expirées
 * Sauvegarde l'historique avant suppression pour les utilisateurs connectés
 * Retourne la liste des roomIds supprimées
 */
export function cleanupExpiredRooms(): string[] {
  const now = Date.now();

  // 1. Collecter les rooms expirées
  const expiredRooms: { roomId: string; room: Room }[] = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.expiresAt && now > room.expiresAt) {
      expiredRooms.push({ roomId, room });
    }
  }

  if (expiredRooms.length === 0) return [];

  const expiredRoomIds = expiredRooms.map(e => e.roomId);

  // 2. Traiter chaque room expirée (créateur résolu depuis le cache mémoire)
  for (const { roomId, room } of expiredRooms) {
    const creatorAccountId = roomCreators.get(roomId);
    if (creatorAccountId) {
      const items: ItemHistory[] = room.items
        .filter((item) => item.finalScore)
        .map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          finalScore: item.finalScore,
          votes: Object.entries(item.votes).reduce((acc, [oderId, vote]) => {
            const voter = room.users[oderId];
            acc[oderId] = {
              voterName: voter?.name || 'Inconnu',
              value: vote.value,
            };
            return acc;
          }, {} as Record<string, { voterName: string; value: string }>),
        }));

      userStore.updateRoomHistory(creatorAccountId, roomId, {
        items,
        isActive: false,
        closedAt: now,
        participantCount: Object.keys(room.users).length,
      });

      console.log(`[TTL] Room ${roomId} history saved for user ${creatorAccountId}`);
    }

    // Nettoyer les associations socket -> user pour cette room
    removeAllSocketsForRoom(roomId);

    // Nettoyer les secrets de reconnexion pour cette room
    for (const uid of Object.keys(room.users)) {
      reconnectSecrets.delete(`${roomId}:${uid}`);
    }

    // Nettoyer les pending disconnects pour cette room via l'index inversé (O(1))
    const roomPendingKeys = pendingDisconnectsByRoom.get(roomId);
    if (roomPendingKeys) {
      for (const k of roomPendingKeys) {
        pendingDisconnects.delete(k);
      }
      pendingDisconnectsByRoom.delete(roomId);
    }

    // Supprimer la room et son mot de passe
    rooms.delete(roomId);
    roomPasswords.delete(roomId);
    roomCreators.delete(roomId);

    console.log(`[TTL] Room ${roomId} expired and cleaned up`);
  }

  return expiredRoomIds;
}

/**
 * Récupère le temps restant avant expiration d'une room (en secondes)
 */
export function getRoomTimeRemaining(roomId: string): number | null {
  const room = rooms.get(roomId);
  if (!room || !room.expiresAt) return null;

  const remaining = Math.max(0, room.expiresAt - Date.now());
  return Math.floor(remaining / 1000);
}

/**
 * Récupère toutes les rooms (pour l'admin)
 */
export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}

// Lancer le nettoyage périodique des rooms expirées
const roomCleanupInterval = setInterval(() => {
  const expired = cleanupExpiredRooms();
  if (expired.length > 0) {
    console.log(`[TTL] Cleaned up ${expired.length} expired room(s)`);
  }
}, CLEANUP_INTERVAL);

/**
 * Arrête le nettoyage périodique (appelé lors du shutdown)
 */
export function stopCleanupInterval(): void {
  clearInterval(roomCleanupInterval);
}

/**
 * Associe le créateur (accountId) à une room pour éviter les requêtes SQLite répétées
 */
export function setRoomCreator(roomId: string, accountId: string): void {
  roomCreators.set(roomId, accountId);
}

/**
 * Récupère le créateur d'une room depuis le cache mémoire
 */
export function getRoomCreator(roomId: string): string | undefined {
  return roomCreators.get(roomId);
}

/**
 * Retourne la map socketId -> userId pour une room donnée
 */
export function getSocketUserMap(roomId: string): Map<string, string> {
  const result = new Map<string, string>();
  const sockets = roomToSockets.get(roomId);
  if (sockets) {
    for (const sid of sockets) {
      const info = socketToUser.get(sid);
      if (info) {
        result.set(sid, info.userId);
      }
    }
  }
  return result;
}

/**
 * Construit une version sanitisée de la room pour un utilisateur donné.
 * Pendant le vote (state === 'voting'), masque les valeurs de vote des autres
 * en les remplaçant par 'hidden'. Seul le vote du destinataire reste visible.
 * Pour les autres états (idle, revealed), retourne la room telle quelle.
 */
export function sanitizeRoomForUser(room: Room, recipientUserId: string): Room {
  if (room.state !== 'voting' || !room.activeItemId) return room;

  const activeItemId = room.activeItemId;

  return {
    ...room,
    items: room.items.map((item) => {
      if (item.id !== activeItemId) return item;

      const sanitizedVotes: Record<string, Vote> = {};
      for (const [oderId, vote] of Object.entries(item.votes)) {
        sanitizedVotes[oderId] = oderId === recipientUserId
          ? vote
          : { value: 'hidden', createdAt: vote.createdAt };
      }

      return { ...item, votes: sanitizedVotes };
    }),
  };
}
