/**
 * Tests d'intégration du cycle de vie des rooms :
 * suppression centralisée (PO parti, expiration TTL), notification room:closed,
 * quitter l'ancienne room à la création/jointure, normalisation des codes,
 * clôture de l'historique, nettoyage des uploads et contrat admin:getActiveRooms.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers, _getDisconnectTimerCountForTests } from '../../../server/socket/handlers';
import * as roomStore from '../../../server/store/roomStore';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  Room,
  RoomClosedPayload,
  RoomHistory,
  UserAccount,
  AdminActiveRoomSummary,
} from '../../../src/types';

const TEST_PORT = 3094;
const UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads');
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

interface Tracked {
  closed: RoomClosedPayload[];
  errors: string[];
}

let httpServer: HttpServer;
let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;
let originalEnv: { trustProxy?: string; rateLimit?: string; adminEmail?: string };

const tracked = new Map<TypedClientSocket, Tracked>();
const allClients: TypedClientSocket[] = [];
const createdRoomIds = new Set<string>();
const createdUserIds = new Set<string>();

// IP unique par client (TRUST_PROXY=1 lit X-Forwarded-For) : aucun rate limit n'est épuisé
let clientCounter = 0;
function createClient(): TypedClientSocket {
  const ip = `10.94.${Math.floor(clientCounter / 256)}.${(clientCounter % 256) + 1}`;
  clientCounter++;
  const client = ioc(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    autoConnect: false,
    extraHeaders: { 'x-forwarded-for': ip },
  }) as TypedClientSocket;
  const t: Tracked = { closed: [], errors: [] };
  client.on('room:closed', (payload) => t.closed.push(payload));
  client.on('error', (message) => t.errors.push(message));
  tracked.set(client, t);
  allClients.push(client);
  return client;
}

function connectClient(client: TypedClientSocket): Promise<void> {
  return new Promise((resolve) => {
    client.on('connect', resolve);
    client.connect();
  });
}

async function newConnectedClient(): Promise<TypedClientSocket> {
  const client = createClient();
  await connectClient(client);
  return client;
}

function disconnectClient(client: TypedClientSocket): Promise<void> {
  return new Promise((resolve) => {
    if (!client.connected) {
      resolve();
      return;
    }
    client.on('disconnect', () => resolve());
    client.disconnect();
  });
}

/** Poll court (25 ms) jusqu'à ce que le prédicat soit vrai */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: délai dépassé');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Attend un room:updated satisfaisant le prédicat (l'écoute est posée avant l'émission) */
function waitForRoomUpdate(client: TypedClientSocket, predicate: (room: Room) => boolean): Promise<Room> {
  return new Promise<Room>((resolve) => {
    const listener = (room: Room) => {
      if (predicate(room)) {
        client.off('room:updated', listener);
        resolve(room);
      }
    };
    client.on('room:updated', listener);
  });
}

function createRoom(client: TypedClientSocket, userName = 'PO', password?: string) {
  return new Promise<{ room: Room; userId: string; reconnectSecret?: string }>((resolve) => {
    client.emit('room:create', { userName, password }, (room, userId, reconnectSecret) => {
      createdRoomIds.add(room.id);
      resolve({ room, userId, reconnectSecret });
    });
  });
}

function joinRoom(client: TypedClientSocket, roomId: string, userName = 'Dev', password?: string) {
  return new Promise<{ success: boolean; room?: Room; userId?: string; error?: string; secret?: string }>((resolve) => {
    client.emit('room:join', { roomId, userName, password }, (success, room, userId, error, secret) => {
      resolve({ success, room, userId, error, secret });
    });
  });
}

function registerAccount(client: TypedClientSocket, email: string, name = 'Lifecycle') {
  return new Promise<{ account: UserAccount; sessionToken: string }>((resolve, reject) => {
    client.emit('auth:register', { email, password: 'password123', name, role: 'po' }, (success, account, error, sessionToken) => {
      if (success && account && sessionToken) {
        createdUserIds.add(account.id);
        resolve({ account, sessionToken });
      } else reject(new Error(error ?? 'register failed'));
    });
  });
}

function getHistory(client: TypedClientSocket) {
  return new Promise<RoomHistory[]>((resolve) => client.emit('auth:getHistory', (rooms) => resolve(rooms)));
}

function serverRooms(client: TypedClientSocket): Set<string> {
  return ioServer.sockets.sockets.get(client.id as string)!.rooms;
}

const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random()}@example.com`;

describe('Cycle de vie des rooms', () => {
  beforeAll(async () => {
    originalEnv = {
      trustProxy: process.env.TRUST_PROXY,
      rateLimit: process.env.ROOM_CREATE_RATE_LIMIT_PER_MINUTE,
      adminEmail: process.env.ADMIN_EMAIL,
    };
    process.env.TRUST_PROXY = '1';
    process.env.ROOM_CREATE_RATE_LIMIT_PER_MINUTE = '1000';

    httpServer = createServer();
    ioServer = new Server(httpServer, { cors: { origin: '*' }, transports: ['websocket'] });
    setupSocketHandlers(ioServer);
    await new Promise<void>((resolve) => httpServer.listen(TEST_PORT, resolve));
  });

  afterEach(async () => {
    // Quitter avant de se déconnecter : évite les timers de grâce résiduels (30 s) entre tests
    for (const client of allClients) {
      if (client.connected) client.emit('room:leave');
    }
    await Promise.all(allClients.map(disconnectClient));
    allClients.length = 0;
    tracked.clear();
  });

  afterAll(async () => {
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    // Nettoyage disque : aucun dossier de room ou d'utilisateur de test ne doit subsister
    for (const roomId of createdRoomIds) {
      fs.rmSync(path.join(UPLOADS_ROOT, roomId), { recursive: true, force: true });
    }
    for (const userId of createdUserIds) {
      fs.rmSync(path.join(UPLOADS_ROOT, 'users', userId), { recursive: true, force: true });
    }

    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('TRUST_PROXY', originalEnv.trustProxy);
    restore('ROOM_CREATE_RATE_LIMIT_PER_MINUTE', originalEnv.rateLimit);
    restore('ADMIN_EMAIL', originalEnv.adminEmail);
  });

  // ====== room:create / room:join quittent l'ancienne room ======

  it('PO de A crée B → le dev de A reçoit room:closed {A, po_left}, A disparaît, le PO quitte la room socket A', async () => {
    const po = await newConnectedClient();
    const { room: roomA } = await createRoom(po);
    const dev = await newConnectedClient();
    await joinRoom(dev, roomA.id);

    const { room: roomB } = await createRoom(po, 'PO');

    await waitFor(() => tracked.get(dev)!.closed.length > 0);
    expect(tracked.get(dev)!.closed).toEqual([{ roomId: roomA.id, reason: 'po_left' }]);
    expect(roomStore.getRoom(roomA.id)).toBeUndefined();
    expect(roomStore.getRoom(roomB.id)).toBeDefined();
    expect(roomStore.getUserInfo(po.id as string)?.roomId).toBe(roomB.id);
    expect(serverRooms(po).has(roomA.id)).toBe(false);
    expect(serverRooms(po).has(roomB.id)).toBe(true);
    expect(roomStore.getUserInfo(dev.id as string)).toBeUndefined();
  });

  it('dev de A rejoint B → le PO de A reçoit room:updated sans le dev, B contient le dev', async () => {
    const poA = await newConnectedClient();
    const { room: roomA } = await createRoom(poA, 'POA');
    const poB = await newConnectedClient();
    const { room: roomB } = await createRoom(poB, 'POB');
    const dev = await newConnectedClient();
    const joinedA = await joinRoom(dev, roomA.id);

    const withoutDev = waitForRoomUpdate(poA, (r) => r.id === roomA.id && !Object.hasOwn(r.users, joinedA.userId!));
    const joinedB = await joinRoom(dev, roomB.id);

    expect(joinedB.success).toBe(true);
    const updated = await withoutDev;
    expect(Object.keys(updated.users)).toHaveLength(1);
    expect(Object.hasOwn(roomStore.getRoom(roomB.id)!.users, joinedB.userId!)).toBe(true);
    expect([...serverRooms(dev)].sort()).toEqual([dev.id as string, roomB.id].sort());
  });

  it('dev de A rejoint B avec un mauvais mot de passe → échec et il reste dans A', async () => {
    const poA = await newConnectedClient();
    const { room: roomA } = await createRoom(poA, 'POA');
    const poB = await newConnectedClient();
    const { room: roomB } = await createRoom(poB, 'POB', 'secret');
    const dev = await newConnectedClient();
    await joinRoom(dev, roomA.id);

    const result = await joinRoom(dev, roomB.id, 'Dev', 'mauvais');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Mot de passe incorrect');
    expect(roomStore.getUserInfo(dev.id as string)?.roomId).toBe(roomA.id);
    expect(serverRooms(dev).has(roomA.id)).toBe(true);
  });

  it('dev de A rejoint une room inexistante → échec et il reste dans A', async () => {
    const poA = await newConnectedClient();
    const { room: roomA } = await createRoom(poA, 'POA');
    const dev = await newConnectedClient();
    await joinRoom(dev, roomA.id);

    const result = await joinRoom(dev, 'ZZZZZZ');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Room introuvable');
    expect(roomStore.getUserInfo(dev.id as string)?.roomId).toBe(roomA.id);
  });

  it('join vers la même room → idempotent (même userId et secret, pas de doublon)', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);
    const dev = await newConnectedClient();
    const first = await joinRoom(dev, room.id);
    const usersBefore = Object.keys(roomStore.getRoom(room.id)!.users).length;

    const second = await joinRoom(dev, room.id);

    expect(second.success).toBe(true);
    expect(second.userId).toBe(first.userId);
    expect(second.secret).toBe(first.secret);
    expect(second.secret).toBeDefined();
    expect(Object.keys(roomStore.getRoom(room.id)!.users)).toHaveLength(usersBefore);
  });

  it("join avec un code en minuscules et des espaces → rejoint la room et reçoit room:updated", async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);
    const dev = await newConnectedClient();

    const result = await joinRoom(dev, ` ${room.id.toLowerCase()} `);

    expect(result.success).toBe(true);
    expect(serverRooms(dev).has(room.id)).toBe(true);

    const withItem = waitForRoomUpdate(dev, (r) => r.items.some((i) => i.title === 'Item normalisé'));
    po.emit('item:create', { title: 'Item normalisé', description: '' });
    await withItem;
  });

  it("join avec un code invalide ('ABCDE', '../x') → Room introuvable", async () => {
    const dev = await newConnectedClient();

    for (const bad of ['ABCDE', '../x', 'ABCDE1']) {
      const result = await joinRoom(dev, bad);
      expect(result.success, bad).toBe(false);
      expect(result.error, bad).toBe('Room introuvable');
    }
  });

  it('room:checkPassword normalise le code et refuse un code invalide', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po, 'PO', 'pwd');
    const client = await newConnectedClient();

    const normalized = await new Promise<{ hasPassword: boolean; exists: boolean }>((resolve) => {
      client.emit('room:checkPassword', { roomId: ` ${room.id.toLowerCase()} ` }, (hasPassword, exists) => resolve({ hasPassword, exists }));
    });
    const invalid = await new Promise<{ hasPassword: boolean; exists: boolean }>((resolve) => {
      client.emit('room:checkPassword', { roomId: '../x' }, (hasPassword, exists) => resolve({ hasPassword, exists }));
    });

    expect(normalized).toEqual({ hasPassword: true, exists: true });
    expect(invalid).toEqual({ hasPassword: false, exists: false });
  });

  it('room:reconnect alors que le socket est mappé ailleurs → quitte l\'autre room', async () => {
    const poA = await newConnectedClient();
    const { room: roomA } = await createRoom(poA, 'POA');
    const d1 = await newConnectedClient();
    const joinedA = await joinRoom(d1, roomA.id);
    const poB = await newConnectedClient();
    const { room: roomB } = await createRoom(poB, 'POB');
    const x = await newConnectedClient();
    const joinedB = await joinRoom(x, roomB.id, 'X');

    // La session de d1 passe en attente de reconnexion (délai de grâce)
    const pendingKeyBefore = roomStore._debugStateSizes().pendingDisconnects;
    await disconnectClient(d1);
    await waitFor(() => roomStore._debugStateSizes().pendingDisconnects === pendingKeyBefore + 1);

    const withoutX = waitForRoomUpdate(poB, (r) => r.id === roomB.id && !Object.hasOwn(r.users, joinedB.userId!));
    const reconnect = await new Promise<boolean>((resolve) => {
      x.emit('room:reconnect', { roomId: roomA.id, userId: joinedA.userId!, secret: joinedA.secret! }, (success) => resolve(success));
    });

    expect(reconnect).toBe(true);
    await withoutX;
    expect(roomStore.getUserInfo(x.id as string)).toEqual({ roomId: roomA.id, userId: joinedA.userId });
    expect(serverRooms(x).has(roomB.id)).toBe(false);
    expect(serverRooms(x).has(roomA.id)).toBe(true);
  });

  it('room:reconnect avec un faux secret : ack false, timer de grâce conservé, le dev finit retiré', async () => {
    // Délai de grâce court (variable lue à chaque déconnexion) : évite d'attendre 30 s
    const originalGrace = process.env.RECONNECT_GRACE_PERIOD_MS;
    process.env.RECONNECT_GRACE_PERIOD_MS = '600';
    try {
      const po = await newConnectedClient();
      const { room } = await createRoom(po);
      const dev = await newConnectedClient();
      const joined = await joinRoom(dev, room.id);

      const timersBefore = _getDisconnectTimerCountForTests();
      await disconnectClient(dev);
      await waitFor(() => _getDisconnectTimerCountForTests() === timersBefore + 1);

      // Un autre socket, qui connaît le userId (visible dans room:updated), tente avec un faux secret
      const attacker = await newConnectedClient();
      const ack = await new Promise<boolean>((resolve) => {
        attacker.emit('room:reconnect', { roomId: room.id, userId: joined.userId!, secret: 'faux-secret' }, (success) => resolve(success));
      });

      expect(ack).toBe(false);
      expect(_getDisconnectTimerCountForTests()).toBe(timersBefore + 1);

      // Le timer n'a pas été annulé : le dev est retiré à l'expiration du délai de grâce
      await waitFor(() => !Object.hasOwn(roomStore.getRoom(room.id)!.users, joined.userId!), 3000);
      // (<= : des timers résiduels d'autres tests peuvent avoir été purgés entre-temps)
      expect(_getDisconnectTimerCountForTests()).toBeLessThanOrEqual(timersBefore);
      expect(roomStore.getRoom(room.id)).toBeDefined();
    } finally {
      if (originalGrace === undefined) delete process.env.RECONNECT_GRACE_PERIOD_MS;
      else process.env.RECONNECT_GRACE_PERIOD_MS = originalGrace;
    }
  });

  it('room:reconnect invalide d\'un PO vers une autre room : sa room n\'est pas fermée', async () => {
    const poA = await newConnectedClient();
    const { room: roomA } = await createRoom(poA, 'POA');
    const poB = await newConnectedClient();
    const { room: roomB } = await createRoom(poB, 'POB');
    const devB = await newConnectedClient();
    const joinedB = await joinRoom(devB, roomB.id);
    await disconnectClient(devB);
    await waitFor(() => roomStore.getUserInfo(devB.id as string) === undefined);

    const ack = await new Promise<boolean>((resolve) => {
      poA.emit('room:reconnect', { roomId: roomB.id, userId: joinedB.userId!, secret: 'faux-secret' }, (success) => resolve(success));
    });

    expect(ack).toBe(false);
    expect(roomStore.getRoom(roomA.id)).toBeDefined();
    expect(roomStore.getUserInfo(poA.id as string)?.roomId).toBe(roomA.id);
    expect(tracked.get(poA)!.closed).toEqual([]);
  });

  // ====== TTL ======

  it('TTL : les deux reçoivent room:closed {expired}, le dev est démappé et ne génère aucune erreur ensuite', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);
    const dev = await newConnectedClient();
    await joinRoom(dev, room.id);

    roomStore.getRoom(room.id)!.expiresAt = Date.now() - 1;
    roomStore.cleanupExpiredRooms();

    await waitFor(() => tracked.get(po)!.closed.length > 0 && tracked.get(dev)!.closed.length > 0);
    expect(tracked.get(po)!.closed).toEqual([{ roomId: room.id, reason: 'expired' }]);
    expect(tracked.get(dev)!.closed).toEqual([{ roomId: room.id, reason: 'expired' }]);
    expect(roomStore.getUserInfo(dev.id as string)).toBeUndefined();
    expect(serverRooms(dev).has(room.id)).toBe(false);

    // Un vote tardif est ignoré silencieusement (pas de « room fantôme »)
    dev.emit('vote:cast', { value: '5' });
    await new Promise((r) => setTimeout(r, 300));
    expect(tracked.get(dev)!.errors).toEqual([]);
  });

  it('TTL avec un dev en délai de grâce : le timer de déconnexion est annulé', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);
    const dev = await newConnectedClient();
    await joinRoom(dev, room.id);

    const timersBefore = _getDisconnectTimerCountForTests();
    await disconnectClient(dev);
    await waitFor(() => _getDisconnectTimerCountForTests() === timersBefore + 1);

    roomStore.getRoom(room.id)!.expiresAt = Date.now() - 1;
    roomStore.cleanupExpiredRooms();

    expect(_getDisconnectTimerCountForTests()).toBe(timersBefore);
  });

  // ====== Historique ======

  it('PO connecté (compte) quitte → l\'historique est clos (isActive=false, closedAt défini)', async () => {
    const po = await newConnectedClient();
    await registerAccount(po, uniqueEmail('hist'));
    const { room } = await createRoom(po, 'POHist');
    const dev = await newConnectedClient();
    await joinRoom(dev, room.id);

    const before = (await getHistory(po)).find((h) => h.roomCode === room.id);
    expect(before?.isActive).toBe(true);

    po.emit('room:leave');
    await waitFor(() => roomStore.getRoom(room.id) === undefined);

    const after = (await getHistory(po)).find((h) => h.roomCode === room.id);
    expect(after).toBeDefined();
    expect(after!.isActive).toBe(false);
    expect(typeof after!.closedAt).toBe('number');
    expect(after!.participantCount).toBe(2);
  });

  // ====== Uploads ======

  it('uploads de room : supprimés quand la room est supprimée', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);

    const upload = await new Promise<{ success: boolean; url?: string }>((resolve) => {
      po.emit('deck:uploadImage', { type: 'back', imageData: PNG_1X1, fileName: 'b.png' }, (success, url) => resolve({ success, url }));
    });
    expect(upload.success).toBe(true);
    const dir = path.join(UPLOADS_ROOT, room.id);
    expect(fs.existsSync(path.join(dir, 'back.png'))).toBe(true);

    po.emit('room:leave');

    await waitFor(() => !fs.existsSync(dir), 2000);
  });

  it('upload deck pendant la suppression de la room → (false, Room introuvable) et aucun dossier résiduel', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);

    // Le départ du PO est émis juste après l'upload : la room disparaît avant l'écriture du fichier
    const uploadResult = new Promise<{ success: boolean; error?: string }>((resolve) => {
      po.emit('deck:uploadImage', { type: 'back', imageData: PNG_1X1, fileName: 'b.png' }, (success, url) => resolve({ success, error: url }));
    });
    po.emit('room:leave');
    const result = await uploadResult;

    // Selon l'ordre exact, l'upload peut aussi être refusé en amont (PO déjà parti) : dans tous les cas, échec
    expect(result.success).toBe(false);
    const dir = path.join(UPLOADS_ROOT, room.id);
    await waitFor(() => !fs.existsSync(dir), 2000);
  });

  // ====== Deck de room (DeckSettings) ======

  it("deck:update avec l'URL d'une autre room → 'error' 'Configuration de deck invalide', deck inchangé", async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);
    const otherRoomUrl = '/uploads/ZZZZ22/back.png';

    po.emit('deck:update', { deck: { cards: room.deck.cards, backImageUrl: otherRoomUrl } });

    await waitFor(() => tracked.get(po)!.errors.includes('Configuration de deck invalide'));
    expect(roomStore.getRoom(room.id)!.deck.backImageUrl).toBeUndefined();
  });

  it('deck:update qui retire le dos → room:updated sans backImageUrl', async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);
    const upload = await new Promise<{ success: boolean; url?: string }>((resolve) => {
      po.emit('deck:uploadImage', { type: 'back', imageData: PNG_1X1, fileName: 'b.png' }, (success, url) => resolve({ success, url }));
    });
    expect(upload.success).toBe(true);
    expect(roomStore.getRoom(room.id)!.deck.backImageUrl).toBe(upload.url);

    const removed = waitForRoomUpdate(po, (r) => r.id === room.id && r.deck.backImageUrl === undefined);
    po.emit('deck:update', { deck: { cards: room.deck.cards } });

    const updated = await removed;
    expect(updated.deck.backImageUrl).toBeUndefined();
    expect(roomStore.getRoom(room.id)!.deck.backImageUrl).toBeUndefined();
  });

  it("deck:uploadImage front sur une carte inexistante → (false, 'Carte introuvable') et aucun fichier écrit", async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      po.emit('deck:uploadImage', { type: 'front', cardValue: '999', imageData: PNG_1X1, fileName: 'c.png' }, (success, url) => resolve({ success, error: url }));
    });

    expect(result).toEqual({ success: false, error: 'Carte introuvable' });
    expect(fs.existsSync(path.join(UPLOADS_ROOT, room.id))).toBe(false);
  });

  it("deck:uploadImage → l'URL retournée contient ?t= et est celle du deck de la room", async () => {
    const po = await newConnectedClient();
    const { room } = await createRoom(po);

    const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
      po.emit('deck:uploadImage', { type: 'front', cardValue: '5', imageData: PNG_1X1, fileName: 'c.png' }, (success, url) => resolve({ success, url }));
    });

    expect(result.success).toBe(true);
    expect(result.url).toMatch(new RegExp(`^/uploads/${room.id}/card_5\\.png\\?t=\\d+$`));
    const card = roomStore.getRoom(room.id)!.deck.cards.find((c) => c.value === '5');
    expect(card?.frontImageUrl).toBe(result.url);
  });

  it("recto importé dans la room A → la carte de la room B (deck par défaut) n'a pas de frontImageUrl", async () => {
    const poA = await newConnectedClient();
    const { room: roomA } = await createRoom(poA, 'POA');
    const uploaded = await new Promise<{ success: boolean; url?: string }>((resolve) => {
      poA.emit('deck:uploadImage', { type: 'front', cardValue: '5', imageData: PNG_1X1, fileName: 'c.png' }, (success, url) => resolve({ success, url }));
    });
    expect(uploaded.success).toBe(true);
    expect(roomStore.getRoom(roomA.id)!.deck.cards.find((c) => c.value === '5')?.frontImageUrl).toBe(uploaded.url);

    const poB = await newConnectedClient();
    const { room: roomB } = await createRoom(poB, 'POB');

    expect(roomB.deck.cards.find((c) => c.value === '5')?.frontImageUrl).toBeUndefined();
    expect(roomStore.getRoom(roomB.id)!.deck.cards.every((c) => c.frontImageUrl === undefined)).toBe(true);
  });

  it('admin:deleteUser → uploads du compte supprimés, sessions socket invalidées', async () => {
    const adminEmail = uniqueEmail('admin-lc');
    process.env.ADMIN_EMAIL = adminEmail;
    const admin = await newConnectedClient();
    await registerAccount(admin, adminEmail, 'Admin');

    const victim = await newConnectedClient();
    const { account } = await registerAccount(victim, uniqueEmail('victim'), 'Victim');
    const avatar = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      victim.emit('auth:uploadAvatar', { imageData: PNG_1X1, fileName: 'a.png' }, (success, err) => resolve({ success, error: err }));
    });
    expect(avatar.success).toBe(true);
    const dir = path.join(UPLOADS_ROOT, 'users', account.id);
    expect(fs.existsSync(dir)).toBe(true);

    const deleted = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      admin.emit('admin:deleteUser', { userId: account.id }, (success, error) => resolve({ success, error }));
    });

    expect(deleted.success).toBe(true);
    await waitFor(() => !fs.existsSync(dir), 2000);
    expect(await getHistory(victim)).toEqual([]);
    const afterDelete = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      victim.emit('auth:uploadAvatar', { imageData: PNG_1X1, fileName: 'a.png' }, (success, err) => resolve({ success, error: err }));
    });
    expect(afterDelete).toEqual({ success: false, error: 'Session expirée' });
  });

  // ====== Admin ======

  it('admin:getActiveRooms → résumés avec les clés exactes de AdminActiveRoomSummary', async () => {
    const adminEmail = uniqueEmail('admin-rooms');
    process.env.ADMIN_EMAIL = adminEmail;
    const admin = await newConnectedClient();
    await registerAccount(admin, adminEmail, 'Admin');

    const po = await newConnectedClient();
    const { room } = await createRoom(po, 'PO résumé', 'pwd');
    const dev = await newConnectedClient();
    await joinRoom(dev, room.id, 'Dev résumé', 'pwd');

    const result = await new Promise<{ success: boolean; rooms?: AdminActiveRoomSummary[] }>((resolve) => {
      admin.emit('admin:getActiveRooms', (success, rooms) => resolve({ success, rooms }));
    });

    expect(result.success).toBe(true);
    const summary = result.rooms!.find((r) => r.id === room.id)!;
    expect(Object.keys(summary).sort()).toEqual(
      ['createdAt', 'expiresAt', 'hasPassword', 'id', 'itemCount', 'participants', 'poName', 'state', 'userCount'].sort()
    );
    expect(summary.poName).toBe('PO résumé');
    expect(summary.userCount).toBe(2);
    expect(summary.hasPassword).toBe(true);
    expect(summary.participants.map((p) => p.name).sort()).toEqual(['Dev résumé', 'PO résumé']);
    expect(summary.participants.find((p) => p.name === 'PO résumé')!.isPO).toBe(true);
    for (const p of summary.participants) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
    }
  });
});
