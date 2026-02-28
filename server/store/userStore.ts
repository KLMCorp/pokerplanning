/**
 * Store pour la gestion des utilisateurs et de l'historique
 * Persistance SQLite pour survivre aux redémarrages serveur
 */

import { UserAccount, UserRole, AuthType, RoomHistory, ItemHistory, DeckConfig, TableConfig, BacklogItem, AdminStats, SessionInfo, AdminUserAccount } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import bcrypt from 'bcrypt';

// ====== Interfaces pour les résultats de requêtes SQLite ======

/** Row type for SELECT queries on the users table */
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  created_at: number;
  deck_config: string | null;
  avatar_url: string | null;
  table_config: string | null;
  room_ttl_minutes: number | null;
  auth_type: string | null;
  layout_config: string | null;
}

/** Row type for SELECT queries on the room_histories table */
interface RoomHistoryRow {
  id: string;
  account_id: string;
  room_code: string;
  created_at: number;
  closed_at: number | null;
  creator_id: string;
  creator_name: string;
  participant_count: number;
  items: string;
  is_active: number;
}

/** Row type for room_histories joined with users (admin queries) */
interface RoomHistoryWithCreatorRow extends RoomHistoryRow {
  creator_email: string | null;
}

/** Row type for SELECT queries on the session_tokens table */
interface SessionTokenRow {
  token: string;
  user_id: string;
  created_at: number;
  last_used_at: number;
}

/** Row type for session_tokens joined with users (admin queries) */
interface SessionWithUserRow extends SessionTokenRow {
  user_name: string;
  user_email: string;
}

/** Row type for SELECT queries on the user_backlogs table */
interface BacklogItemRow {
  id: string;
  account_id: string;
  title: string;
  description: string | null;
  estimated_points: string | null;
  estimated_at: number | null;
  room_code: string | null;
  created_at: number;
  updated_at: number;
  priority: number | null;
}

/** Row type for SELECT queries on the password_reset_tokens table */
interface ResetTokenRow {
  token: string;
  user_id: string;
  expires_at: number;
  used: number;
  attempts: number;
}

// Nombre max de tentatives de validation d'un code de reset (anti brute-force global)
const MAX_RESET_TOKEN_ATTEMPTS = 5;

/** Row type for COUNT(*) aggregate queries */
interface CountRow {
  count: number;
}

/** Row type for MAX(priority) aggregate query */
interface MaxPriorityRow {
  maxP: number;
}

/** Row type for users with admin aggregate counts */
interface AdminUserRow extends UserRow {
  session_count: number;
  room_count: number;
  backlog_count: number;
}

/** Row type for users in getAllBacklogs (minimal fields) */
interface UserSummaryRow {
  id: string;
  name: string;
  email: string;
}

/** Row type for findRoomCreators query */
interface RoomCreatorRow {
  room_code: string;
  account_id: string;
}

// Nombre de rounds pour bcrypt (10-12 recommandé pour un bon compromis sécurité/performance)
const BCRYPT_ROUNDS = 12;

// TTL par défaut des rooms en minutes (3 heures)
const DEFAULT_ROOM_TTL_MINUTES = parseInt(process.env.ROOM_TTL_MINUTES || '180', 10);
const MAX_ROOM_TTL_MINUTES = DEFAULT_ROOM_TTL_MINUTES; // Le max est celui du .env
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Chemin de la base de données (configurable via env)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pokerplanning.db');

// Créer le dossier data si nécessaire
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Connexion à la base de données
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Création des tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deck_config TEXT,
    avatar_url TEXT,
    table_config TEXT
  );

  CREATE TABLE IF NOT EXISTS room_histories (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    room_code TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    creator_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    participant_count INTEGER NOT NULL,
    items TEXT NOT NULL,
    is_active INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS session_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_backlogs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    estimated_points TEXT,
    estimated_at INTEGER,
    room_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_room_histories_account_id ON room_histories(account_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_session_tokens_user_id ON session_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_session_tokens_token ON session_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_session_tokens_last_used ON session_tokens(last_used_at);
  CREATE INDEX IF NOT EXISTS idx_user_backlogs_account_id ON user_backlogs(account_id);
`);

db.prepare('CREATE INDEX IF NOT EXISTS idx_room_histories_room_code_active ON room_histories(room_code, is_active)').run();

// Migration : ajouter la colonne room_ttl_minutes si elle n'existe pas
try {
  db.prepare('SELECT room_ttl_minutes FROM users LIMIT 1').get();
} catch {
  console.log('Adding room_ttl_minutes column to users table...');
  db.exec('ALTER TABLE users ADD COLUMN room_ttl_minutes INTEGER');
}

// Migration : ajouter la colonne auth_type si elle n'existe pas
try {
  db.prepare('SELECT auth_type FROM users LIMIT 1').get();
} catch {
  console.log('Adding auth_type column to users table...');
  db.exec("ALTER TABLE users ADD COLUMN auth_type TEXT DEFAULT 'email'");
}

// Migration : ajouter la colonne layout_config si elle n'existe pas
try {
  db.prepare('SELECT layout_config FROM users LIMIT 1').get();
} catch {
  console.log('Adding layout_config column to users table...');
  db.exec('ALTER TABLE users ADD COLUMN layout_config TEXT');
}

// Migration : ajouter la colonne priority aux backlogs
try {
  db.prepare('SELECT priority FROM user_backlogs LIMIT 1').get();
} catch {
  console.log('Adding priority column to user_backlogs table...');
  db.exec('ALTER TABLE user_backlogs ADD COLUMN priority INTEGER DEFAULT 0');
  // Initialiser les priorités uniquement pour les items pending (non estimes) par created_at ASC
  const accounts = db.prepare('SELECT DISTINCT account_id FROM user_backlogs WHERE estimated_points IS NULL').all() as { account_id: string }[];
  for (const acc of accounts) {
    const items = db.prepare('SELECT id FROM user_backlogs WHERE account_id = ? AND estimated_points IS NULL ORDER BY created_at ASC').all(acc.account_id) as { id: string }[];
    for (let i = 0; i < items.length; i++) {
      db.prepare('UPDATE user_backlogs SET priority = ? WHERE id = ?').run(i + 1, items[i].id);
    }
  }
}

// Migration : ajouter la colonne expires_at aux session_tokens
try {
  db.prepare('SELECT expires_at FROM session_tokens LIMIT 1').get();
} catch {
  console.log('Adding expires_at column to session_tokens table...');
  // 30 jours par défaut pour les sessions existantes
  const defaultExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  db.exec(`ALTER TABLE session_tokens ADD COLUMN expires_at INTEGER DEFAULT ${defaultExpiry}`);
}

// Migration : ajouter la colonne attempts aux password_reset_tokens
try {
  db.prepare('SELECT attempts FROM password_reset_tokens LIMIT 1').get();
} catch {
  console.log('Adding attempts column to password_reset_tokens table...');
  db.exec('ALTER TABLE password_reset_tokens ADD COLUMN attempts INTEGER DEFAULT 0');
}

console.log(`SQLite database initialized at ${DB_FILE}`);

// Nettoyage périodique des sessions expirées et des tokens de réinitialisation (toutes les 24h)
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const sessionCleanupInterval = setInterval(() => {
  cleanupExpiredSessions();
  db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ? OR used = 1').run(Date.now());
}, CLEANUP_INTERVAL_MS);

/**
 * Arrête le nettoyage périodique (appelé lors du shutdown)
 */
export function stopCleanupInterval(): void {
  clearInterval(sessionCleanupInterval);
}

// Association socketId -> accountId pour les sessions (en mémoire uniquement)
const socketToAccount: Map<string, string> = new Map();

/**
 * Parse JSON de manière sécurisée, retourne undefined en cas d'erreur
 */
function safeJsonParse<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.error('Failed to parse JSON data');
    return undefined;
  }
}

/**
 * Hash un mot de passe avec bcrypt (sécurisé)
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Vérifie un mot de passe contre son hash bcrypt
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Support de la migration depuis SHA-256 (ancien format)
  if (!hash.startsWith('$2')) {
    // Ancien hash SHA-256 — comparaison constant-time pour éviter les timing attacks
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sha256Hash, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  }
  return bcrypt.compare(password, hash);
}

/**
 * Crée un nouveau compte utilisateur
 */
export async function register(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  authType: AuthType = 'email',
  pseudo?: string
): Promise<{ success: boolean; account?: UserAccount; error?: string }> {
  // Valider le mot de passe (renforcé : minimum 8 caractères, maximum 256)
  if (password.length < 8 || password.length > 256) {
    return { success: false, error: 'Le mot de passe doit faire entre 8 et 256 caractères' };
  }

  let dbEmail: string;

  if (authType === 'pseudo') {
    // Valider le pseudo
    if (!pseudo || !pseudo.trim()) {
      return { success: false, error: 'Le pseudo est requis' };
    }
    const pseudoRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!pseudoRegex.test(pseudo.trim())) {
      return { success: false, error: 'Le pseudo doit contenir entre 3 et 20 caractères (lettres, chiffres, _ ou -)' };
    }
    dbEmail = `pseudo:${pseudo.trim().toLowerCase()}`;

    // Vérifier si le pseudo existe déjà
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(dbEmail);
    if (existingUser) {
      return { success: false, error: 'Ce pseudo est déjà utilisé' };
    }
  } else {
    const normalizedEmail = email.toLowerCase().trim();

    // Valider l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return { success: false, error: 'Email invalide' };
    }

    // Vérifier si l'email existe déjà (message générique pour éviter l'énumération)
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
      return { success: false, error: 'Inscription impossible avec ces informations' };
    }

    dbEmail = normalizedEmail;
  }

  const userId = uuidv4();
  const passwordHash = await hashPassword(password);

  try {
    db.prepare(`
      INSERT INTO users (id, email, name, role, password_hash, created_at, auth_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, dbEmail, name.trim(), role, passwordHash, Date.now(), authType);

    const account: UserAccount = {
      id: userId,
      email: authType === 'pseudo' ? '' : dbEmail,
      name: name.trim(),
      role,
      createdAt: Date.now(),
      authType,
      pseudo: authType === 'pseudo' ? pseudo!.trim() : undefined,
    };

    return { success: true, account };
  } catch (error) {
    console.error('Error registering user:', error);
    return { success: false, error: 'Erreur lors de l\'inscription' };
  }
}

/**
 * Connecte un utilisateur
 */
export async function login(
  email: string,
  password: string,
  authType: AuthType = 'email',
  pseudo?: string
): Promise<{ success: boolean; account?: UserAccount; error?: string }> {
  let lookupEmail: string;

  if (authType === 'pseudo') {
    if (!pseudo || !pseudo.trim()) {
      return { success: false, error: 'Le pseudo est requis' };
    }
    lookupEmail = `pseudo:${pseudo.trim().toLowerCase()}`;
  } else {
    lookupEmail = email.toLowerCase().trim();
  }

  const user = db.prepare(`
    SELECT id, email, name, role, created_at, deck_config, avatar_url, table_config, room_ttl_minutes, password_hash, auth_type, layout_config
    FROM users WHERE email = ?
  `).get(lookupEmail) as UserRow | undefined;

  if (!user) {
    return { success: false, error: authType === 'pseudo' ? 'Pseudo ou mot de passe incorrect' : 'Email ou mot de passe incorrect' };
  }

  const isValidPassword = await verifyPassword(password, user.password_hash);
  if (!isValidPassword) {
    return { success: false, error: authType === 'pseudo' ? 'Pseudo ou mot de passe incorrect' : 'Email ou mot de passe incorrect' };
  }

  // Migration automatique des anciens hash SHA-256 vers bcrypt
  if (!user.password_hash.startsWith('$2')) {
    const newHash = await hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  }

  const userAuthType = (user.auth_type || 'email') as AuthType;
  const isPseudo = userAuthType === 'pseudo';

  const account: UserAccount = {
    id: user.id,
    email: isPseudo ? '' : user.email,
    name: user.name,
    role: user.role as UserRole,
    createdAt: user.created_at,
    deckConfig: safeJsonParse(user.deck_config),
    avatarUrl: user.avatar_url || undefined,
    tableConfig: safeJsonParse(user.table_config),
    roomTtlMinutes: user.room_ttl_minutes || undefined,
    authType: userAuthType,
    pseudo: isPseudo ? user.email.replace('pseudo:', '') : undefined,
    layoutConfig: safeJsonParse(user.layout_config),
  };

  return { success: true, account };
}

/**
 * Récupère un compte par son ID
 */
export function getAccount(accountId: string): UserAccount | undefined {
  const user = db.prepare(`
    SELECT id, email, name, role, created_at, deck_config, avatar_url, table_config, room_ttl_minutes, auth_type, layout_config
    FROM users WHERE id = ?
  `).get(accountId) as UserRow | undefined;

  if (!user) return undefined;

  const authType = (user.auth_type || 'email') as AuthType;
  const isPseudo = authType === 'pseudo';

  return {
    id: user.id,
    email: isPseudo ? '' : user.email,
    name: user.name,
    role: user.role as UserRole,
    createdAt: user.created_at,
    deckConfig: safeJsonParse(user.deck_config),
    avatarUrl: user.avatar_url || undefined,
    tableConfig: safeJsonParse(user.table_config),
    roomTtlMinutes: user.room_ttl_minutes || undefined,
    authType,
    pseudo: isPseudo ? user.email.replace('pseudo:', '') : undefined,
    layoutConfig: safeJsonParse(user.layout_config),
  };
}

/**
 * Associe un socket à un compte
 */
export function setSocketAccount(socketId: string, accountId: string): void {
  socketToAccount.set(socketId, accountId);
}

/**
 * Récupère l'accountId d'un socket
 */
export function getSocketAccount(socketId: string): string | undefined {
  return socketToAccount.get(socketId);
}

/**
 * Déconnecte un socket
 */
export function clearSocketAccount(socketId: string): void {
  socketToAccount.delete(socketId);
}

// Durée de vie d'un token de session (30 jours)
const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Nombre max de sessions actives par utilisateur
const MAX_SESSIONS_PER_USER = 10;

/**
 * Crée un token de session pour un utilisateur
 * Retourne un token cryptographiquement sécurisé, expire après 30 jours
 * Supprime les sessions les plus anciennes si la limite est atteinte
 */
export function createSessionToken(userId: string): string {
  // Supprimer les sessions excédentaires (garder les MAX_SESSIONS_PER_USER - 1 plus récentes)
  const count = (db.prepare('SELECT COUNT(*) as count FROM session_tokens WHERE user_id = ?').get(userId) as { count: number }).count;
  if (count >= MAX_SESSIONS_PER_USER) {
    db.prepare(`
      DELETE FROM session_tokens WHERE token IN (
        SELECT token FROM session_tokens WHERE user_id = ? ORDER BY last_used_at ASC LIMIT ?
      )
    `).run(userId, count - MAX_SESSIONS_PER_USER + 1);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TOKEN_TTL_MS;

  db.prepare(`
    INSERT INTO session_tokens (token, user_id, created_at, last_used_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, now, now, expiresAt);

  return token;
}

/**
 * Valide un token de session et retourne l'userId associé
 * Met à jour last_used_at si valide. Rejette les sessions expirées.
 */
export function validateSessionToken(token: string, userId: string): boolean {
  if (!token || !userId) return false;

  const row = db.prepare(`
    SELECT user_id, expires_at FROM session_tokens WHERE token = ? AND user_id = ?
  `).get(token, userId) as Pick<SessionTokenRow, 'user_id'> & { expires_at?: number } | undefined;

  if (!row) return false;

  // Vérifier l'expiration du token
  if (row.expires_at && Date.now() > row.expires_at) {
    db.prepare('DELETE FROM session_tokens WHERE token = ?').run(token);
    return false;
  }

  // Met à jour last_used_at
  db.prepare('UPDATE session_tokens SET last_used_at = ? WHERE token = ?').run(Date.now(), token);

  return true;
}

/**
 * Révoque un token de session (logout)
 */
export function revokeSessionToken(token: string): void {
  if (token) {
    db.prepare('DELETE FROM session_tokens WHERE token = ?').run(token);
  }
}

/**
 * Révoque tous les tokens de session d'un utilisateur
 */
export function revokeAllUserSessions(userId: string): void {
  db.prepare('DELETE FROM session_tokens WHERE user_id = ?').run(userId);
}

/**
 * Nettoie les tokens de session expirés ou inactifs (plus de 30 jours)
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  db.prepare('DELETE FROM session_tokens WHERE last_used_at < ? OR (expires_at IS NOT NULL AND expires_at < ?)').run(thirtyDaysAgo, now);
}

/**
 * Ajoute une room à l'historique d'un utilisateur
 */
export function addRoomToHistory(
  accountId: string,
  roomCode: string,
  creatorName: string
): RoomHistory {
  const history: RoomHistory = {
    id: uuidv4(),
    roomCode,
    createdAt: Date.now(),
    creatorId: accountId,
    creatorName,
    participantCount: 1,
    items: [],
    isActive: true,
  };

  db.prepare(`
    INSERT INTO room_histories (id, account_id, room_code, created_at, creator_id, creator_name, participant_count, items, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    history.id,
    accountId,
    history.roomCode,
    history.createdAt,
    history.creatorId,
    history.creatorName,
    history.participantCount,
    JSON.stringify(history.items),
    history.isActive ? 1 : 0
  );

  return history;
}

/**
 * Met à jour l'historique d'une room
 */
export function updateRoomHistory(
  accountId: string,
  roomCode: string,
  updates: {
    participantCount?: number;
    items?: ItemHistory[];
    isActive?: boolean;
    closedAt?: number;
  }
): void {
  const history = db.prepare(`
    SELECT id FROM room_histories
    WHERE account_id = ? AND room_code = ? AND is_active = 1
  `).get(accountId, roomCode) as Pick<RoomHistoryRow, 'id'> | undefined;

  if (!history) return;

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.participantCount !== undefined) {
    setClauses.push('participant_count = ?');
    values.push(updates.participantCount);
  }
  if (updates.items !== undefined) {
    setClauses.push('items = ?');
    values.push(JSON.stringify(updates.items));
  }
  if (updates.isActive !== undefined) {
    setClauses.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  if (updates.closedAt !== undefined) {
    setClauses.push('closed_at = ?');
    values.push(updates.closedAt);
  }

  if (setClauses.length > 0) {
    values.push(history.id);
    db.prepare(`UPDATE room_histories SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }
}

/**
 * Récupère l'historique des rooms d'un utilisateur
 */
export function getRoomHistory(accountId: string): RoomHistory[] {
  const rows = db.prepare(`
    SELECT * FROM room_histories
    WHERE account_id = ?
    ORDER BY created_at DESC
  `).all(accountId) as RoomHistoryRow[];

  return rows.map(row => ({
    id: row.id,
    roomCode: row.room_code,
    createdAt: row.created_at,
    closedAt: row.closed_at || undefined,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    participantCount: row.participant_count,
    items: safeJsonParse(row.items) || [],
    isActive: row.is_active === 1,
  }));
}

/**
 * Supprime une room de l'historique
 */
export function deleteRoomHistory(accountId: string, historyId: string): boolean {
  const result = db.prepare(`
    DELETE FROM room_histories
    WHERE id = ? AND account_id = ?
  `).run(historyId, accountId);

  return result.changes > 0;
}

/**
 * Trouve l'accountId du créateur d'une room active
 */
export function findRoomCreator(roomCode: string): string | undefined {
  const row = db.prepare(`
    SELECT account_id FROM room_histories
    WHERE room_code = ? AND is_active = 1
  `).get(roomCode) as Pick<RoomHistoryRow, 'account_id'> | undefined;

  return row?.account_id;
}

/**
 * Trouve les accountIds des créateurs de plusieurs rooms actives en une seule requête
 */
export function findRoomCreators(roomCodes: string[]): Map<string, string> {
  if (roomCodes.length === 0) return new Map();

  const placeholders = roomCodes.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT room_code, account_id FROM room_histories
    WHERE room_code IN (${placeholders}) AND is_active = 1
  `).all(...roomCodes) as RoomCreatorRow[];

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.room_code, row.account_id);
  }
  return result;
}

/**
 * Met à jour la configuration du deck d'un utilisateur
 */
export function updateDeckConfig(accountId: string, deck: DeckConfig): boolean {
  const result = db.prepare(`
    UPDATE users SET deck_config = ? WHERE id = ?
  `).run(JSON.stringify(deck), accountId);

  return result.changes > 0;
}

/**
 * Récupère la configuration du deck d'un utilisateur
 */
export function getDeckConfig(accountId: string): DeckConfig | undefined {
  const row = db.prepare('SELECT deck_config FROM users WHERE id = ?').get(accountId) as Pick<UserRow, 'deck_config'> | undefined;
  return safeJsonParse(row?.deck_config);
}

/**
 * Met à jour l'avatar d'un utilisateur
 */
export function updateAvatar(accountId: string, avatarUrl: string): boolean {
  const result = db.prepare(`
    UPDATE users SET avatar_url = ? WHERE id = ?
  `).run(avatarUrl, accountId);

  return result.changes > 0;
}

/**
 * Récupère l'avatar d'un utilisateur
 */
export function getAvatar(accountId: string): string | undefined {
  const row = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(accountId) as Pick<UserRow, 'avatar_url'> | undefined;
  return row?.avatar_url || undefined;
}

/**
 * Met à jour la configuration de la table d'un utilisateur
 */
export function updateTableConfig(accountId: string, tableConfig: TableConfig): boolean {
  const result = db.prepare(`
    UPDATE users SET table_config = ? WHERE id = ?
  `).run(JSON.stringify(tableConfig), accountId);

  return result.changes > 0;
}

/**
 * Met à jour la configuration du layout de la room d'un utilisateur
 */
export function updateLayoutConfig(accountId: string, layoutConfig: object): boolean {
  const result = db.prepare(`
    UPDATE users SET layout_config = ? WHERE id = ?
  `).run(JSON.stringify(layoutConfig), accountId);

  return result.changes > 0;
}

/**
 * Récupère la configuration de la table d'un utilisateur
 */
export function getTableConfig(accountId: string): TableConfig | undefined {
  const row = db.prepare('SELECT table_config FROM users WHERE id = ?').get(accountId) as Pick<UserRow, 'table_config'> | undefined;
  return safeJsonParse(row?.table_config);
}

/**
 * Trouve un utilisateur par email
 */
export function findUserByEmail(email: string): { id: string; name: string } | undefined {
  const normalizedEmail = email.toLowerCase().trim();
  const row = db.prepare('SELECT id, name FROM users WHERE email = ?').get(normalizedEmail) as Pick<UserRow, 'id' | 'name'> | undefined;
  return row ? { id: row.id, name: row.name } : undefined;
}

/**
 * Crée un code de réinitialisation de mot de passe à 6 chiffres
 * Expire après 1 heure
 */
export function createPasswordResetToken(userId: string): string {
  // Supprimer les anciens tokens non utilisés pour cet utilisateur
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);

  // Créer un code à 6 chiffres
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 heure

  db.prepare(`
    INSERT INTO password_reset_tokens (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(code, userId, expiresAt);

  return code;
}

/**
 * Valide un token de réinitialisation et retourne l'userId
 * Limite le nombre de tentatives à MAX_RESET_TOKEN_ATTEMPTS pour éviter le brute-force
 */
export function validateResetToken(token: string): { valid: boolean; userId?: string; error?: string } {
  const row = db.prepare(`
    SELECT user_id, expires_at, used, attempts FROM password_reset_tokens WHERE token = ?
  `).get(token) as ResetTokenRow | undefined;

  if (!row) {
    // Incrémenter les tentatives sur tous les tokens non utilisés de cet utilisateur serait idéal,
    // mais sans connaître l'utilisateur, on ne peut rien faire ici.
    return { valid: false, error: 'Code invalide' };
  }

  // Incrémenter le compteur de tentatives à chaque validation (même si échouée)
  db.prepare('UPDATE password_reset_tokens SET attempts = attempts + 1 WHERE token = ?').run(token);

  if (row.used === 1) {
    return { valid: false, error: 'Ce code a déjà été utilisé' };
  }

  if ((row.attempts || 0) >= MAX_RESET_TOKEN_ATTEMPTS) {
    return { valid: false, error: 'Trop de tentatives, veuillez redemander un code' };
  }

  if (Date.now() > row.expires_at) {
    return { valid: false, error: 'Ce code a expiré' };
  }

  return { valid: true, userId: row.user_id };
}

/**
 * Réinitialise le mot de passe avec un token valide
 * Utilise une transaction pour garantir l'atomicité (update pwd + mark token used)
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const validation = validateResetToken(token);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  if (newPassword.length < 8 || newPassword.length > 256) {
    return { success: false, error: 'Le mot de passe doit faire entre 8 et 256 caractères' };
  }

  const passwordHash = await hashPassword(newPassword);

  // Transaction atomique : update mot de passe + marquer le token comme utilisé
  const resetTransaction = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, validation.userId);
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
  });
  resetTransaction();

  return { success: true };
}

// ====== TTL DES ROOMS ======

/**
 * Récupère le TTL max configuré dans le .env
 */
export function getMaxRoomTtlMinutes(): number {
  return MAX_ROOM_TTL_MINUTES;
}

/**
 * Récupère le TTL effectif pour un utilisateur (le sien ou le default, jamais > max)
 */
export function getEffectiveRoomTtl(accountId: string | undefined): number {
  if (!accountId) return DEFAULT_ROOM_TTL_MINUTES;

  const account = getAccount(accountId);
  if (!account || !account.roomTtlMinutes) return DEFAULT_ROOM_TTL_MINUTES;

  // Ne jamais dépasser le max
  return Math.min(account.roomTtlMinutes, MAX_ROOM_TTL_MINUTES);
}

/**
 * Met à jour le TTL des rooms pour un utilisateur
 */
export function updateRoomTtl(accountId: string, ttlMinutes: number): { success: boolean; error?: string } {
  // Validation
  if (ttlMinutes < 1) {
    return { success: false, error: 'Le TTL doit être au moins 1 minute' };
  }

  if (ttlMinutes > MAX_ROOM_TTL_MINUTES) {
    return { success: false, error: `Le TTL ne peut pas dépasser ${MAX_ROOM_TTL_MINUTES} minutes` };
  }

  try {
    const result = db.prepare(`
      UPDATE users SET room_ttl_minutes = ? WHERE id = ?
    `).run(ttlMinutes, accountId);

    return { success: result.changes > 0 };
  } catch (error) {
    console.error('Error updating room TTL:', error);
    return { success: false, error: 'Erreur lors de la mise à jour' };
  }
}

// ====== BACKLOG PERSONNEL ======

/**
 * Crée un nouvel item dans le backlog personnel
 */
// Nombre max d'items dans le backlog par utilisateur
const MAX_BACKLOG_ITEMS_PER_USER = 500;

export function createBacklogItem(
  accountId: string,
  title: string,
  description?: string
): BacklogItem | null {
  const id = uuidv4();
  const now = Date.now();

  try {
    // Vérifier la limite d'items par utilisateur
    const countRow = db.prepare('SELECT COUNT(*) as count FROM user_backlogs WHERE account_id = ?').get(accountId) as { count: number };
    if (countRow.count >= MAX_BACKLOG_ITEMS_PER_USER) {
      return null;
    }

    // Priority only for pending (non-estimated) items
    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(priority), 0) as maxP FROM user_backlogs WHERE account_id = ? AND estimated_points IS NULL'
    ).get(accountId) as MaxPriorityRow | undefined;
    const priority = (maxRow?.maxP || 0) + 1;

    db.prepare(`
      INSERT INTO user_backlogs (id, account_id, title, description, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, accountId, title.trim(), description?.trim() || null, priority, now, now);

    return {
      id,
      title: title.trim(),
      description: description?.trim(),
      priority,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Error creating backlog item:', error);
    return null;
  }
}

/**
 * Récupère tous les items du backlog d'un utilisateur
 */
export function getBacklogItems(accountId: string): BacklogItem[] {
  // Pending items first (sorted by priority), then estimated items (sorted by estimated_at desc)
  const rows = db.prepare(`
    SELECT * FROM user_backlogs
    WHERE account_id = ?
    ORDER BY
      CASE WHEN estimated_points IS NULL THEN 0 ELSE 1 END,
      CASE WHEN estimated_points IS NULL THEN priority ELSE NULL END ASC,
      estimated_at DESC
  `).all(accountId) as BacklogItemRow[];

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    estimatedPoints: row.estimated_points || undefined,
    estimatedAt: row.estimated_at || undefined,
    roomCode: row.room_code || undefined,
    priority: row.estimated_points ? 0 : (row.priority || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Met à jour un item du backlog
 */
export function updateBacklogItem(
  accountId: string,
  itemId: string,
  updates: { title?: string; description?: string }
): boolean {
  const setClauses: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title.trim());
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description.trim() || null);
  }

  values.push(itemId, accountId);

  try {
    const result = db.prepare(`
      UPDATE user_backlogs SET ${setClauses.join(', ')}
      WHERE id = ? AND account_id = ?
    `).run(...values);

    return result.changes > 0;
  } catch (error) {
    console.error('Error updating backlog item:', error);
    return false;
  }
}

/**
 * Supprime un item du backlog
 */
export function deleteBacklogItem(accountId: string, itemId: string): boolean {
  try {
    // Récupérer la priorité et le statut de l'item avant suppression
    const item = db.prepare(
      'SELECT priority, estimated_points FROM user_backlogs WHERE id = ? AND account_id = ?'
    ).get(itemId, accountId) as Pick<BacklogItemRow, 'priority' | 'estimated_points'> | undefined;

    const result = db.prepare(`
      DELETE FROM user_backlogs WHERE id = ? AND account_id = ?
    `).run(itemId, accountId);

    // Only recompact priorities for pending (non-estimated) items
    if (result.changes > 0 && item?.priority && !item.estimated_points) {
      db.prepare(`
        UPDATE user_backlogs SET priority = priority - 1
        WHERE account_id = ? AND estimated_points IS NULL AND priority > ?
      `).run(accountId, item.priority);
    }

    return result.changes > 0;
  } catch (error) {
    console.error('Error deleting backlog item:', error);
    return false;
  }
}

/**
 * Met à jour le score d'un item du backlog après estimation
 */
export function updateBacklogItemScore(
  accountId: string,
  itemId: string,
  score: string,
  roomCode: string
): boolean {
  try {
    // Get current priority before marking as estimated
    const item = db.prepare(
      'SELECT priority, estimated_points FROM user_backlogs WHERE id = ? AND account_id = ?'
    ).get(itemId, accountId) as Pick<BacklogItemRow, 'priority' | 'estimated_points'> | undefined;

    const result = db.prepare(`
      UPDATE user_backlogs
      SET estimated_points = ?, estimated_at = ?, room_code = ?, updated_at = ?, priority = 0
      WHERE id = ? AND account_id = ?
    `).run(score, Date.now(), roomCode, Date.now(), itemId, accountId);

    // Recompact pending priorities if item was previously pending
    if (result.changes > 0 && item?.priority && !item.estimated_points) {
      db.prepare(`
        UPDATE user_backlogs SET priority = priority - 1
        WHERE account_id = ? AND estimated_points IS NULL AND priority > ?
      `).run(accountId, item.priority);
    }

    return result.changes > 0;
  } catch (error) {
    console.error('Error updating backlog item score:', error);
    return false;
  }
}

/**
 * Réordonne un item du backlog vers une nouvelle priorité
 */
export function reorderBacklogItem(accountId: string, itemId: string, newPriority: number): boolean {
  try {
    const reorderTransaction = db.transaction(() => {
      const item = db.prepare(
        'SELECT priority, estimated_points FROM user_backlogs WHERE id = ? AND account_id = ?'
      ).get(itemId, accountId) as Pick<BacklogItemRow, 'priority' | 'estimated_points'> | undefined;

      if (!item || item.estimated_points) return false; // Only pending items

      const oldPriority = item.priority;
      if (oldPriority === null) return false;
      if (oldPriority === newPriority) return true;

      if (newPriority < 1) return false;

      const maxRow = db.prepare(
        'SELECT COALESCE(MAX(priority), 0) as maxP FROM user_backlogs WHERE account_id = ? AND estimated_points IS NULL'
      ).get(accountId) as MaxPriorityRow | undefined;
      if (!maxRow || newPriority > maxRow.maxP) return false;

      if (newPriority < oldPriority) {
        db.prepare(`
          UPDATE user_backlogs SET priority = priority + 1
          WHERE account_id = ? AND estimated_points IS NULL AND priority >= ? AND priority < ?
        `).run(accountId, newPriority, oldPriority);
      } else {
        db.prepare(`
          UPDATE user_backlogs SET priority = priority - 1
          WHERE account_id = ? AND estimated_points IS NULL AND priority > ? AND priority <= ?
        `).run(accountId, oldPriority, newPriority);
      }

      db.prepare(
        'UPDATE user_backlogs SET priority = ? WHERE id = ? AND account_id = ?'
      ).run(newPriority, itemId, accountId);

      return true;
    });
    return reorderTransaction();
  } catch (error) {
    console.error('Error reordering backlog item:', error);
    return false;
  }
}

/**
 * Trouve un item du backlog par son titre pour un utilisateur
 */
export function findBacklogItemByTitle(accountId: string, title: string): BacklogItem | null {
  const row = db.prepare(`
    SELECT * FROM user_backlogs
    WHERE account_id = ? AND title = ?
  `).get(accountId, title) as BacklogItemRow | undefined;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    estimatedPoints: row.estimated_points || undefined,
    estimatedAt: row.estimated_at || undefined,
    roomCode: row.room_code || undefined,
    priority: row.priority || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ====== ADMINISTRATION ======

/**
 * Vérifie si un compte est admin (basé sur ADMIN_EMAIL)
 */
export function isAdmin(accountId: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();

  if (!adminEmail) {
    return false;
  }

  const account = getAccount(accountId);
  if (!account) {
    return false;
  }

  return account.email.toLowerCase() === adminEmail;
}

/**
 * Récupère tous les utilisateurs avec statistiques
 */
export function getAllUsers(): AdminUserAccount[] {
  const users = db.prepare(`
    SELECT
      u.id, u.email, u.name, u.role, u.created_at, u.deck_config, u.avatar_url, u.table_config, u.auth_type, u.layout_config,
      COALESCE(st.session_count, 0) as session_count,
      COALESCE(rh.room_count, 0) as room_count,
      COALESCE(ub.backlog_count, 0) as backlog_count
    FROM users u
    LEFT JOIN (SELECT user_id, COUNT(*) as session_count FROM session_tokens GROUP BY user_id) st ON st.user_id = u.id
    LEFT JOIN (SELECT account_id, COUNT(*) as room_count FROM room_histories GROUP BY account_id) rh ON rh.account_id = u.id
    LEFT JOIN (SELECT account_id, COUNT(*) as backlog_count FROM user_backlogs GROUP BY account_id) ub ON ub.account_id = u.id
    ORDER BY u.created_at DESC
  `).all() as AdminUserRow[];

  return users.map(user => {
    const authType = (user.auth_type || 'email') as AuthType;
    const isPseudo = authType === 'pseudo';
    return {
      id: user.id,
      email: isPseudo ? '' : user.email,
      name: user.name,
      role: user.role as UserRole,
      createdAt: user.created_at,
      deckConfig: safeJsonParse(user.deck_config),
      avatarUrl: user.avatar_url || undefined,
      tableConfig: safeJsonParse(user.table_config),
      authType,
      pseudo: isPseudo ? user.email.replace('pseudo:', '') : undefined,
      layoutConfig: safeJsonParse(user.layout_config),
      sessionCount: user.session_count,
      roomCount: user.room_count,
      backlogCount: user.backlog_count,
    };
  });
}

/**
 * Récupère toutes les sessions actives
 */
export function getAllSessions(): SessionInfo[] {
  const sessions = db.prepare(`
    SELECT
      st.token, st.user_id, st.created_at, st.last_used_at,
      u.name as user_name, u.email as user_email
    FROM session_tokens st
    JOIN users u ON st.user_id = u.id
    ORDER BY st.last_used_at DESC
  `).all() as SessionWithUserRow[];

  return sessions.map(session => ({
    token: session.token.substring(0, 8) + '...', // Masquer le token complet
    userId: session.user_id,
    userName: session.user_name,
    userEmail: session.user_email,
    createdAt: session.created_at,
    lastUsedAt: session.last_used_at,
  }));
}

/**
 * Récupère tout l'historique des rooms
 */
export function getAllRoomHistories(): RoomHistory[] {
  const rows = db.prepare(`
    SELECT rh.*, u.name as creator_name, u.email as creator_email
    FROM room_histories rh
    LEFT JOIN users u ON rh.account_id = u.id
    ORDER BY rh.created_at DESC
  `).all() as RoomHistoryWithCreatorRow[];

  return rows.map(row => ({
    id: row.id,
    roomCode: row.room_code,
    createdAt: row.created_at,
    closedAt: row.closed_at || undefined,
    creatorId: row.creator_id,
    creatorName: row.creator_name || 'Inconnu',
    participantCount: row.participant_count,
    items: safeJsonParse(row.items) || [],
    isActive: row.is_active === 1,
  }));
}

/**
 * Récupère tous les backlogs groupés par utilisateur
 */
export function getAllBacklogs(): { userId: string; userName: string; userEmail: string; items: BacklogItem[] }[] {
  const users = db.prepare(`
    SELECT id, name, email FROM users
    WHERE id IN (SELECT DISTINCT account_id FROM user_backlogs)
    ORDER BY name
  `).all() as UserSummaryRow[];

  // Fetch all backlog items in a single query instead of N+1
  const allItems = db.prepare(`
    SELECT * FROM user_backlogs
    ORDER BY
      CASE WHEN estimated_points IS NULL THEN 0 ELSE 1 END,
      CASE WHEN estimated_points IS NULL THEN priority ELSE NULL END ASC,
      estimated_at DESC
  `).all() as BacklogItemRow[];

  // Group items by account_id
  const itemsByAccount = new Map<string, BacklogItem[]>();
  for (const row of allItems) {
    const item: BacklogItem = {
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      estimatedPoints: row.estimated_points || undefined,
      estimatedAt: row.estimated_at || undefined,
      roomCode: row.room_code || undefined,
      priority: row.estimated_points ? 0 : (row.priority || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const accountItems = itemsByAccount.get(row.account_id);
    if (accountItems) {
      accountItems.push(item);
    } else {
      itemsByAccount.set(row.account_id, [item]);
    }
  }

  return users.map(user => ({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    items: itemsByAccount.get(user.id) || [],
  }));
}

/**
 * Récupère les statistiques globales
 */
export function getGlobalStats(): AdminStats {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();

  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as CountRow).count;
  const totalRooms = (db.prepare('SELECT COUNT(*) as count FROM room_histories').get() as CountRow).count;
  const totalItems = (db.prepare(`
    SELECT SUM(json_array_length(items)) as count FROM room_histories
  `).get() as CountRow).count || 0;
  const totalBacklogItems = (db.prepare('SELECT COUNT(*) as count FROM user_backlogs').get() as CountRow).count;
  const activeSessions = (db.prepare('SELECT COUNT(*) as count FROM session_tokens').get() as CountRow).count;
  const usersToday = (db.prepare('SELECT COUNT(*) as count FROM users WHERE created_at >= ?').get(todayTimestamp) as CountRow).count;
  const roomsToday = (db.prepare('SELECT COUNT(*) as count FROM room_histories WHERE created_at >= ?').get(todayTimestamp) as CountRow).count;

  return {
    totalUsers,
    totalRooms,
    totalItems,
    totalBacklogItems,
    activeSessions,
    usersToday,
    roomsToday,
  };
}

/**
 * Supprime un utilisateur et toutes ses données
 */
export function deleteUser(userId: string): boolean {
  try {
    const deleteTransaction = db.transaction(() => {
      db.prepare('DELETE FROM session_tokens WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM user_backlogs WHERE account_id = ?').run(userId);
      db.prepare('DELETE FROM room_histories WHERE account_id = ?').run(userId);
      return db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
    const result = deleteTransaction();
    return result.changes > 0;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

/**
 * Révoque une session spécifique (pour l'admin)
 * Note: Le token fourni est masqué, on doit chercher par préfixe
 */
export function revokeSessionByPrefix(tokenPrefix: string): boolean {
  // Le tokenPrefix est du format "abc12345..."
  const prefix = tokenPrefix.replace('...', '');

  // Valider que le préfixe contient uniquement des caractères hex et a une longueur suffisante
  // Cette validation garantit aussi l'absence de caractères LIKE spéciaux (%, _)
  if (!prefix || prefix.length < 8 || !/^[0-9a-fA-F]+$/.test(prefix)) {
    return false;
  }

  try {
    // Échapper les caractères spéciaux LIKE par sécurité (même si la regex ci-dessus les bloque)
    const escapedPrefix = prefix.replace(/[%_]/g, '\\$&');
    const result = db.prepare(`
      DELETE FROM session_tokens WHERE token LIKE ? ESCAPE '\\'
    `).run(escapedPrefix + '%');
    return result.changes > 0;
  } catch (error) {
    console.error('Error revoking session:', error);
    return false;
  }
}
