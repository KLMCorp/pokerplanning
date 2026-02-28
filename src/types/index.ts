// Types principaux de l'application Planning Poker
// Conformes aux spécifications du cahier des charges

/**
 * Rôle de l'utilisateur
 */
export type UserRole = 'dev' | 'po';

/**
 * Identifiants des panneaux de la room
 */
export type RoomPanelId = 'pokerTable' | 'cardPicker' | 'controlsStats' | 'itemList' | 'estimatedItems' | 'userList';

/**
 * Configuration du layout : tableau de lignes, chaque ligne contient 1 ou 2 panneaux côte à côte
 */
export type LayoutConfig = RoomPanelId[][];

/**
 * Configuration de la table de poker
 */
export interface TableConfig {
  feltColor?: string; // Couleur du feutre (ex: "#1a7a3d")
  borderColor?: string; // Couleur de la bordure (ex: "#8B4513")
  imageUrl?: string; // Image de fond personnalisée
}

/**
 * Compte utilisateur (persisté)
 */
export type AuthType = 'email' | 'pseudo';

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
  deckConfig?: DeckConfig; // Configuration personnalisée du deck
  avatarUrl?: string; // Avatar personnalisé
  tableConfig?: TableConfig; // Configuration personnalisée de la table
  roomTtlMinutes?: number; // TTL personnalisé des rooms en minutes
  authType?: AuthType; // Type d'authentification (email ou pseudo)
  pseudo?: string; // Pseudo lisible (si authType === 'pseudo')
  layoutConfig?: LayoutConfig; // Configuration du layout de la room
}

/**
 * Historique d'un item estimé
 */
export interface ItemHistory {
  id: string;
  title: string;
  description: string;
  finalScore?: string;
  votes: Record<string, { voterName: string; value: string }>;
}

/**
 * Historique d'une room
 */
export interface RoomHistory {
  id: string;
  roomCode: string;
  createdAt: number;
  closedAt?: number;
  creatorId: string;
  creatorName: string;
  participantCount: number;
  items: ItemHistory[];
  isActive: boolean;
}

/**
 * États possibles d'une room de Planning Poker
 * - idle: en attente, pas de vote en cours
 * - voting: vote en cours, les cartes sont cachées
 * - revealed: votes révélés, cartes visibles
 */
export type RoomState = 'idle' | 'voting' | 'revealed';

/**
 * Configuration d'une carte du deck
 */
export interface CardConfig {
  value: string;          // Valeur logique (ex: "5", "13", "?", "coffee")
  label: string;          // Affichage texte
  frontImageUrl?: string; // Image personnalisée du recto (optionnel)
}

/**
 * Configuration complète du deck de cartes
 */
export interface DeckConfig {
  cards: CardConfig[];
  backImageUrl?: string;  // Image du dos des cartes (commune à toutes)
}

/**
 * Vote d'un utilisateur sur un item
 */
export interface Vote {
  value: string;    // Valeur de la carte choisie
  createdAt: number; // Timestamp de création
}

/**
 * Item du backlog à estimer
 */
export interface Item {
  id: string;
  title: string;
  description: string;
  order: number;
  votes: Record<string, Vote>; // userId -> Vote
  finalScore?: string;         // Score validé par le PO
  elapsedTime?: number;        // Temps accumulé en ms par le chronomètre PO (suivi par item)
  backlogItemId?: string;      // ID de l'item dans le backlog personnel (si importé)
  backlogOwnerId?: string;     // ID du compte propriétaire du backlog
}

/**
 * Utilisateur connecté à une room
 */
export interface User {
  id: string;
  name: string;
  isPO: boolean; // Est Product Owner
  cardColor?: string; // Couleur hex des cartes (ex: "#3B82F6")
  cardBackUrl?: string; // URL du dos de carte personnalisé (si compte avec image custom)
}

/**
 * Paramètres de la room (configurables par le PO)
 */
export interface RoomSettings {
  emojisEnabled: boolean;
}

/**
 * Room de Planning Poker
 */
export interface Room {
  id: string;                    // Code unique de la room
  poUserId: string;              // ID du Product Owner
  users: Record<string, User>;   // Utilisateurs connectés
  items: Item[];                 // Backlog à estimer
  activeItemId: string | null;   // Item en cours d'estimation
  state: RoomState;              // État actuel
  deck: DeckConfig;              // Configuration du deck
  hasPassword: boolean;          // Indique si la room est protégée par mot de passe
  tableConfig?: TableConfig;     // Configuration personnalisée de la table
  createdAt: number;             // Timestamp de création
  expiresAt: number;             // Timestamp d'expiration (TTL)
  settings: RoomSettings;        // Paramètres de la room
  // Timer PO — chronomètre indépendant du cycle de vote.
  // Le countdown est calculé côté client : remaining = timerDuration - (Date.now() - timerStartedAt)
  // Pas de broadcast pendant le countdown, uniquement sur start/stop/reset/set.
  timerDuration?: number;          // Durée cible en ms (undefined = pas de timer configuré)
  timerStartedAt?: number;         // Timestamp absolu serveur du démarrage (undefined = stoppé)
  timerStoppedRemaining?: number;  // Remaining ms figé au moment du stop (peut être < 0 = overtime)
}

/**
 * Statistiques calculées après reveal
 */
export interface VoteStatistics {
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  totalVotes: number;
  numericVotes: number[];
}

/**
 * Événements Socket.IO - Client vers Serveur
 */
export interface ClientToServerEvents {
  // Authentification
  'auth:register': (data: { email: string; password: string; name: string; role: UserRole; authType?: AuthType; pseudo?: string }, callback: (success: boolean, account?: UserAccount, error?: string, sessionToken?: string) => void) => void;
  'auth:login': (data: { email: string; password: string; authType?: AuthType; pseudo?: string }, callback: (success: boolean, account?: UserAccount, error?: string, sessionToken?: string) => void) => void;
  'auth:reconnect': (data: { accountId: string; sessionToken?: string }, callback: (success: boolean, account?: UserAccount) => void) => void;
  'auth:logout': (data?: { sessionToken?: string }) => void;
  'auth:getHistory': (callback: (rooms: RoomHistory[]) => void) => void;
  'auth:deleteRoomHistory': (data: { historyId: string }, callback: (success: boolean) => void) => void;
  'auth:updateDeck': (data: { deck: DeckConfig }, callback: (success: boolean) => void) => void;
  'auth:uploadDeckImage': (data: { type: 'front' | 'back'; cardValue?: string; imageData: string; fileName: string }, callback: (success: boolean, url?: string) => void) => void;
  'auth:deleteDeckImage': (data: { type: 'front' | 'back'; cardValue?: string }, callback: (success: boolean) => void) => void;
  'auth:uploadAvatar': (data: { imageData: string; fileName: string }, callback: (success: boolean, url?: string) => void) => void;
  'auth:updateTableConfig': (data: { tableConfig: TableConfig }, callback: (success: boolean) => void) => void;
  'auth:uploadTableImage': (data: { imageData: string; fileName: string }, callback: (success: boolean, url?: string) => void) => void;
  'auth:updateRoomTtl': (data: { ttlMinutes: number }, callback: (success: boolean, error?: string) => void) => void;
  'auth:updateLayoutConfig': (data: { layoutConfig: LayoutConfig }, callback: (success: boolean) => void) => void;
  'auth:forgotPassword': (data: { email: string }, callback: (success: boolean, error?: string) => void) => void;
  'auth:verifyResetCode': (data: { code: string }, callback: (valid: boolean, error?: string) => void) => void;
  'auth:resetPassword': (data: { code: string; newPassword: string }, callback: (success: boolean, error?: string) => void) => void;

  // Gestion des rooms
  'room:create': (data: { userName: string; password?: string; cardColor?: string }, callback: (room: Room, userId: string, reconnectSecret?: string) => void) => void;
  'room:join': (data: { roomId: string; userName: string; password?: string; cardColor?: string }, callback: (success: boolean, room?: Room, userId?: string, error?: string, reconnectSecret?: string) => void) => void;
  'room:checkPassword': (data: { roomId: string }, callback: (hasPassword: boolean, roomExists: boolean) => void) => void;
  'room:leave': () => void;
  'room:reconnect': (data: { roomId: string; userId: string; secret: string }, callback: (success: boolean, room?: Room, userId?: string) => void) => void;
  'room:close': (callback: (success: boolean) => void) => void;
  'room:updateSettings': (data: { settings: Partial<RoomSettings> }, callback: (success: boolean) => void) => void;
  'room:transferPO': (data: { targetUserId: string }, callback: (success: boolean, error?: string) => void) => void;

  // Gestion des items (PO uniquement)
  'item:create': (data: { title: string; description: string }) => void;
  'item:update': (data: { itemId: string; title?: string; description?: string }) => void;
  'item:delete': (data: { itemId: string }) => void;
  'item:reorder': (data: { itemId: string; newOrder: number }) => void;
  'item:select': (data: { itemId: string }) => void;
  'item:setFinalScore': (data: { itemId: string; score: string }) => void;

  // Gestion des votes
  'vote:start': () => void;
  'vote:cast': (data: { value: string }) => void;
  'vote:reveal': () => void;
  'vote:reset': () => void;

  // Gestion du timer PO — chronomètre pour timeboxer les discussions
  // Indépendant du cycle de vote, visible par tous, contrôlé par le PO
  'timer:set': (data: { durationMs: number }) => void;   // Configure la durée (clamp 10s–60min)
  'timer:start': () => void;                               // Démarre ou reprend le countdown
  'timer:stop': () => void;                                // Pause + accumule l'elapsed sur l'item
  'timer:reset': () => void;                               // Remet à la durée configurée

  // Gestion du deck (PO uniquement)
  'deck:update': (data: { deck: DeckConfig }) => void;
  'deck:uploadImage': (data: { type: 'front' | 'back'; cardValue?: string; imageData: string; fileName: string }, callback: (success: boolean, url?: string) => void) => void;

  // Envoi d'emojis
  'emoji:send': (data: { targetUserId: string; emoji: string }) => void;

  // Gestion du backlog personnel
  'backlog:getItems': (callback: (items: BacklogItem[]) => void) => void;
  'backlog:create': (data: { title: string; description?: string }, callback: (success: boolean, item?: BacklogItem) => void) => void;
  'backlog:update': (data: { itemId: string; title?: string; description?: string }, callback: (success: boolean) => void) => void;
  'backlog:delete': (data: { itemId: string }, callback: (success: boolean) => void) => void;
  'backlog:reorder': (data: { itemId: string; newPriority: number }, callback: (success: boolean) => void) => void;
  'backlog:import': (data: { roomId: string; itemIds: string[] }, callback: (success: boolean, count?: number) => void) => void;

  // Administration (Super Admin uniquement)
  'admin:checkAccess': (callback: (isAdmin: boolean) => void) => void;
  'admin:getAllUsers': (callback: (success: boolean, users?: AdminUserAccount[]) => void) => void;
  'admin:getAllSessions': (callback: (success: boolean, sessions?: SessionInfo[]) => void) => void;
  'admin:getAllRoomHistory': (callback: (success: boolean, histories?: RoomHistory[]) => void) => void;
  'admin:getAllBacklogs': (callback: (success: boolean, backlogs?: { userId: string; userName: string; userEmail: string; items: BacklogItem[] }[]) => void) => void;
  'admin:getStats': (callback: (success: boolean, stats?: AdminStats) => void) => void;
  'admin:getActiveRooms': (callback: (success: boolean, rooms?: Room[]) => void) => void;
  'admin:deleteUser': (data: { userId: string }, callback: (success: boolean, error?: string) => void) => void;
  'admin:revokeSession': (data: { token: string }, callback: (success: boolean) => void) => void;
}

/**
 * Événements Socket.IO - Serveur vers Client
 */
export interface ServerToClientEvents {
  'room:updated': (room: Room) => void;
  'room:userJoined': (user: User) => void;
  'room:userLeft': (userId: string) => void;
  'room:closed': (reason: string) => void;
  'vote:cast': (userId: string, hasVoted: boolean) => void;
  'vote:revealed': (votes: Record<string, Vote>) => void;
  'vote:reset': () => void;
  'error': (message: string) => void;
  'emoji:received': (data: { fromUserId: string; fromUserName: string; targetUserId: string; emoji: string }) => void;
}

/**
 * Données utilisateur pour un vote affiché sur la table
 */
export interface TableVote {
  userId: string;
  userName: string;
  hasVoted: boolean;
  vote?: Vote;
  position: { x: number; y: number; rotation: number };
}

/**
 * Item du backlog personnel d'un utilisateur
 */
export interface BacklogItem {
  id: string;
  title: string;
  description?: string;
  estimatedPoints?: string;
  estimatedAt?: number;
  roomCode?: string;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Statistiques globales pour l'administration
 */
export interface AdminStats {
  totalUsers: number;
  totalRooms: number;
  totalItems: number;
  totalBacklogItems: number;
  activeSessions: number;
  usersToday: number;
  roomsToday: number;
}

/**
 * Information de session pour l'administration
 */
export interface SessionInfo {
  token: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Compte utilisateur étendu pour l'administration
 */
export interface AdminUserAccount extends UserAccount {
  sessionCount: number;
  roomCount: number;
  backlogCount: number;
}
