# Modèles de données

## Types principaux

### UserRole

```typescript
type UserRole = 'dev' | 'po';
```

### TableConfig

```typescript
interface TableConfig {
  feltColor?: string;    // Couleur du feutre (ex: "#1a7a3d")
  borderColor?: string;  // Couleur de la bordure (ex: "#8B4513")
  imageUrl?: string;     // Image de fond personnalisée
}
```

### UserAccount

```typescript
interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
  deckConfig?: DeckConfig;   // Deck personnalisé
  avatarUrl?: string;        // Avatar personnalisé
  tableConfig?: TableConfig; // Table personnalisée
}
```

### CardConfig

```typescript
interface CardConfig {
  value: string;          // Valeur logique
  label: string;          // Affichage
  frontImageUrl?: string; // Image du recto
}
```

### DeckConfig

```typescript
interface DeckConfig {
  cards: CardConfig[];
  backImageUrl?: string; // Image du dos
}
```

### Vote

```typescript
interface Vote {
  value: string;    // Valeur de la carte
  createdAt: number;
}
```

### Item

```typescript
interface Item {
  id: string;
  title: string;
  description: string;
  order: number;
  votes: Record<string, Vote>; // odot -> Vote
  finalScore?: string;
}
```

### User

```typescript
interface User {
  id: string;
  name: string;
  isPO: boolean;
  cardColor?: string;     // Couleur hex choisie par l'utilisateur
  cardBackUrl?: string;   // URL du dos de carte (aléatoire)
}
```

### RoomState

```typescript
type RoomState = 'idle' | 'voting' | 'revealed';
```

### Room

```typescript
interface Room {
  id: string;
  poUserId: string;
  users: Record<string, User>;
  items: Item[];
  activeItemId: string | null;
  state: RoomState;
  deck: DeckConfig;
  hasPassword: boolean;
  tableConfig?: TableConfig;
}
```

### RoomClosedPayload

```typescript
type RoomClosedReason = 'po_left' | 'expired';

interface RoomClosedPayload {
  roomId: string;
  reason: RoomClosedReason; // 'po_left' : PO parti ou non revenu ; 'expired' : TTL écoulé
}
```

Émis par le serveur (`room:closed`) à tous les participants de la room fermée. Une room simplement vidée est supprimée sans notification.

### AdminActiveRoomSummary

```typescript
interface AdminActiveRoomParticipant {
  id: string;
  name: string;
  isPO: boolean;
}

interface AdminActiveRoomSummary {
  id: string;
  poName: string | null;
  participants: AdminActiveRoomParticipant[];
  userCount: number;
  itemCount: number;
  state: RoomState;
  hasPassword: boolean;
  createdAt: number;
  expiresAt: number;
}
```

Retourné par `admin:getActiveRooms`.

### VoteStatistics

```typescript
interface VoteStatistics {
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  totalVotes: number;
  numericVotes: number[];
}
```

### BacklogItem

```typescript
interface BacklogItem {
  id: string;
  accountId: string;
  title: string;
  description: string;
  priority: number;           // Priorité (1, 2, 3...) pour les items à estimer
  createdAt: number;
  updatedAt: number;
  estimatedPoints?: string;   // Score final si estimé
  estimatedAt?: number;       // Date d'estimation
  estimatedRoomCode?: string; // Code de la room où estimé
}
```

### AdminStats

```typescript
interface AdminStats {
  totalUsers: number;
  totalRooms: number;
  activeRooms: number;
  totalHistories: number;
}
```

### SessionInfo

```typescript
interface SessionInfo {
  odot: string;
  odot: string;
  userName: string;
  roomId?: string;
  connectedAt: number;
}
```

## Historique

### ItemHistory

```typescript
interface ItemHistory {
  id: string;
  title: string;
  description: string;
  finalScore?: string;
  votes: Record<string, {
    voterName: string;
    value: string;
  }>;
}
```

### RoomHistory

```typescript
interface RoomHistory {
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
```

## Événements Socket

### EmojiEvent

```typescript
interface EmojiEvent {
  id: string;
  fromUserId: string;
  fromUserName: string;
  targetUserId: string;
  emoji: string;
  timestamp: number;
}
```

## Relations

```
UserAccount
  |-- deckConfig (DeckConfig)
  |-- tableConfig (TableConfig)
  |-- roomHistories (RoomHistory[])
  |     |-- items (ItemHistory[])
  |-- backlogs (BacklogItem[])

Room
  |-- users (User[])
  |-- items (Item[])
  |     |-- votes (Vote[])
  |-- deck (DeckConfig)
  |-- tableConfig (TableConfig)
```

## Stockage serveur

### Base de données SQLite

Fichier : `data/pokerplanning.db`

#### Table `users`
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deck_config TEXT,      -- JSON
  avatar_url TEXT,
  table_config TEXT      -- JSON
);
```

#### Table `room_histories`
```sql
CREATE TABLE room_histories (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  participant_count INTEGER NOT NULL,
  items TEXT NOT NULL,   -- JSON
  is_active INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES users(id)
);
```

#### Table `password_reset_tokens`
```sql
CREATE TABLE password_reset_tokens (
  token TEXT PRIMARY KEY,        -- sha256 hex (64 car.) de "userId:code" ; le code en clair n'est jamais stocké
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,   -- Timestamp d'expiration (1 heure)
  used INTEGER DEFAULT 0,        -- 0 = non utilisé, 1 = utilisé
  attempts INTEGER DEFAULT 0,    -- Essais de validation (max 5)
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Table `session_tokens`
```sql
CREATE TABLE session_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER,             -- Ajouté par migration (30 jours)
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Table `user_backlogs`
```sql
CREATE TABLE user_backlogs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,     -- Priorité pour les items à estimer
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  estimated_points TEXT,           -- Score final
  estimated_at INTEGER,            -- Date d'estimation
  estimated_room_code TEXT,        -- Room où estimé
  FOREIGN KEY (account_id) REFERENCES users(id)
);
```

### Données en mémoire (volatiles)

```typescript
// Association socket -> compte (session)
const socketToAccount: Map<string, string>;

// Rooms actives
const rooms: Map<string, Room>;

// Mots de passe des rooms
const roomPasswords: Map<string, string>;

// Association socket -> room/user
const socketToUser: Map<string, { roomId: string; userId: string }>;
```

Les rooms actives sont perdues au redémarrage (comportement attendu).

## Stockage client

### localStorage

```typescript
// Compte utilisateur
const STORAGE_KEY = 'pokerPlanning_auth';
// Contient: UserAccount sérialisé en JSON

// Thème
const THEME_KEY = 'pokerPlanning_theme';
// Contient: 'dark' | 'light'

// Langue
const LOCALE_KEY = 'pokerPlanning_locale';
// Contient: 'fr' | 'en'
```
