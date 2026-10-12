/**
 * Tests de robustesse : aucun payload client (hors contrat, sans callback, type inattendu…)
 * ne doit faire tomber le serveur. Couvre la régression « room:checkPassword {} »
 * et un fuzz exhaustif de tous les événements client -> serveur (table EVENT_SHAPES).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from '../../../server/socket/handlers';
import { EVENT_SHAPES } from '../../../server/socket/safeHandler';
import { ClientToServerEvents, ServerToClientEvents, Room, UserAccount } from '../../../src/types';

const TEST_PORT = 3096;

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;
const uncaught = vi.fn();
let originalEnv: { trustProxy?: string; rateLimit?: string; adminEmail?: string };

let clientCounter = 0;
function createClient(): TypedClientSocket {
  const ip = `10.96.${Math.floor(clientCounter / 256)}.${(clientCounter % 256) + 1}`;
  clientCounter++;
  return ioc(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    autoConnect: false,
    extraHeaders: { 'x-forwarded-for': ip },
  }) as TypedClientSocket;
}

function connectClient(client: TypedClientSocket): Promise<void> {
  return new Promise((resolve) => {
    client.on('connect', resolve);
    client.connect();
  });
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

/** Émission hors contrat : les types clients sont volontairement contournés */
function rawEmit(client: TypedClientSocket, event: string, ...args: unknown[]): void {
  (client as unknown as { emit: (ev: string, ...a: unknown[]) => void }).emit(event, ...args);
}

function createRoom(client: TypedClientSocket, userName = 'PO') {
  return new Promise<{ room: Room; userId: string }>((resolve) => {
    client.emit('room:create', { userName }, (room, userId) => resolve({ room, userId }));
  });
}

function registerAccount(client: TypedClientSocket, email: string) {
  return new Promise<{ account: UserAccount; sessionToken: string }>((resolve, reject) => {
    client.emit('auth:register', { email, password: 'password123', name: 'Fuzz', role: 'po' }, (success, account, error, sessionToken) => {
      if (success && account && sessionToken) resolve({ account, sessionToken });
      else reject(new Error(error ?? 'register failed'));
    });
  });
}

/** Authentifie un socket neuf sur un compte déjà créé (sans bcrypt : via le sessionToken) */
function reconnectAccount(client: TypedClientSocket, session: { account: UserAccount; sessionToken: string }) {
  return new Promise<void>((resolve, reject) => {
    client.emit('auth:reconnect', { accountId: session.account.id, sessionToken: session.sessionToken }, (success) => {
      if (success) resolve();
      else reject(new Error('auth:reconnect refusé'));
    });
  });
}

function waitForRoomUpdate(client: TypedClientSocket, predicate: (room: Room) => boolean): Promise<Room> {
  return new Promise((resolve) => {
    const listener = (room: Room) => {
      if (predicate(room)) {
        client.off('room:updated', listener);
        resolve(room);
      }
    };
    client.on('room:updated', listener);
  });
}

/** Crée une room avec un item sélectionné et un vote démarré */
async function setupVotingRoom(client: TypedClientSocket): Promise<void> {
  await createRoom(client);
  const withItem = waitForRoomUpdate(client, (r) => r.items.length === 1);
  client.emit('item:create', { title: 'Item fuzz', description: '' });
  const room = await withItem;
  const voting = waitForRoomUpdate(client, (r) => r.state === 'voting');
  client.emit('item:select', { itemId: room.items[0].id });
  client.emit('vote:start');
  await voting;
}

async function expectServerAlive(): Promise<void> {
  const client = createClient();
  await connectClient(client);
  const result = await new Promise<{ hasPassword: boolean; exists: boolean } | 'timeout'>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 2000);
    client.emit('room:checkPassword', { roomId: 'AAAAAA' }, (hasPassword, exists) => {
      clearTimeout(timer);
      resolve({ hasPassword, exists });
    });
  });
  await disconnectClient(client);
  expect(result).not.toBe('timeout');
}

const KNOWN_FIELDS = [
  'roomId', 'userName', 'password', 'cardColor', 'email', 'name', 'role', 'authType', 'pseudo', 'code',
  'newPassword', 'accountId', 'sessionToken', 'historyId', 'deck', 'type', 'cardValue', 'imageData', 'fileName',
  'tableConfig', 'ttlMinutes', 'layoutConfig', 'userId', 'secret', 'settings', 'targetUserId', 'title',
  'description', 'itemId', 'newOrder', 'score', 'value', 'durationMs', 'emoji', 'itemIds', 'newPriority', 'token',
];

function hostileObject(value: unknown): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of KNOWN_FIELDS) obj[field] = value;
  return obj;
}

const FUZZ_PAYLOADS: unknown[] = [
  undefined,
  null,
  42,
  'str',
  [],
  true,
  {},
  hostileObject(null),
  hostileObject(42),
  hostileObject({}),
  hostileObject(['x']),
  hostileObject(true),
  // Clés de prototype dans tous les champs chaîne
  hostileObject('__proto__'),
  hostileObject('constructor'),
  // Objets JSON possédant une clé propre `__proto__` (JSON.parse la crée comme propriété propre)
  JSON.parse('{"__proto__":{"isPO":true,"polluted":true}}'),
  JSON.parse('{"__proto__":{"isPO":true},"targetUserId":"__proto__","userId":"__proto__","itemId":"__proto__","settings":{"__proto__":{"isPO":true}}}'),
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Robustesse serveur', () => {
  beforeAll(async () => {
    originalEnv = {
      trustProxy: process.env.TRUST_PROXY,
      rateLimit: process.env.ROOM_CREATE_RATE_LIMIT_PER_MINUTE,
      adminEmail: process.env.ADMIN_EMAIL,
    };
    process.on('uncaughtException', uncaught);
    process.env.TRUST_PROXY = '1';
    process.env.ROOM_CREATE_RATE_LIMIT_PER_MINUTE = '1000';

    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
    });
    setupSocketHandlers(ioServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });
  });

  afterAll(async () => {
    process.off('uncaughtException', uncaught);
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('TRUST_PROXY', originalEnv.trustProxy);
    restore('ROOM_CREATE_RATE_LIMIT_PER_MINUTE', originalEnv.rateLimit);
    restore('ADMIN_EMAIL', originalEnv.adminEmail);

    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    expect(uncaught).not.toHaveBeenCalled();
    expect(({} as Record<string, unknown>).isPO).toBeUndefined();
  });

  describe('régressions', () => {
    it('room:checkPassword {} → ack(false,false) et serveur vivant', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ hasPassword: boolean; exists: boolean }>((resolve) => {
        rawEmit(client, 'room:checkPassword', {}, (hasPassword: boolean, exists: boolean) =>
          resolve({ hasPassword, exists })
        );
      });

      expect(result).toEqual({ hasPassword: false, exists: false });
      await disconnectClient(client);
      await expectServerAlive();
    });

    it('admin:checkAccess sans callback → serveur vivant', async () => {
      const client = createClient();
      await connectClient(client);

      rawEmit(client, 'admin:checkAccess');
      await wait(100);

      await disconnectClient(client);
      await expectServerAlive();
    });

    it('room:join roomId non-string → ack(false, …, \'Données invalides\')', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        rawEmit(client, 'room:join', { roomId: 123, userName: 'Dev' }, (success: boolean, _r: unknown, _u: unknown, error?: string) =>
          resolve({ success, error })
        );
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Données invalides');
      await disconnectClient(client);
    });

    it('vote:cast null en pleine session de vote → serveur vivant', async () => {
      const po = createClient();
      await connectClient(po);
      await setupVotingRoom(po);

      rawEmit(po, 'vote:cast', null);
      rawEmit(po, 'vote:cast', { value: null });
      await wait(100);

      await disconnectClient(po);
      await expectServerAlive();
    });
  });

  describe('fuzz exhaustif', () => {
    /**
     * Choix : un client NEUF (IP XFF unique, socket.id neuf) pour chaque couple (événement, payload).
     * Les rate limits (socket.id 100/min, `ip:auth` 10/min, `ip:forgot` 3/min…) ne s'épuisent ainsi jamais :
     * chaque payload atteint réellement les gardes du handler. Les comptes (c) et (d) sont créés une seule fois
     * (bcrypt coûteux) puis rejoués par auth:reconnect ; les rooms sont reconstruites à chaque client.
     */
    type FuzzContext = { name: string; prepare: () => Promise<void>; setup: (client: TypedClientSocket) => Promise<void> };
    let sessionC: { account: UserAccount; sessionToken: string };
    let sessionD: { account: UserAccount; sessionToken: string };

    const contexts: FuzzContext[] = [
      {
        name: '(a) socket anonyme',
        prepare: async () => {},
        setup: async () => {},
      },
      {
        name: '(b) PO d\'une room avec item sélectionné et vote démarré',
        prepare: async () => {},
        setup: async (client) => {
          await setupVotingRoom(client);
        },
      },
      {
        name: '(c) compte enregistré et PO de sa room',
        prepare: async () => {
          const client = createClient();
          await connectClient(client);
          sessionC = await registerAccount(client, `fuzz-c-${Date.now()}-${Math.random()}@example.com`);
          await disconnectClient(client);
        },
        setup: async (client) => {
          await reconnectAccount(client, sessionC);
          await createRoom(client);
        },
      },
      {
        name: '(d) admin',
        prepare: async () => {
          const client = createClient();
          await connectClient(client);
          const email = `fuzz-admin-${Date.now()}-${Math.random()}@example.com`;
          sessionD = await registerAccount(client, email);
          process.env.ADMIN_EMAIL = email;
          await disconnectClient(client);
        },
        setup: async (client) => {
          await reconnectAccount(client, sessionD);
        },
      },
    ];

    async function fuzzOne(context: FuzzContext, event: string, payload: unknown): Promise<void> {
      const client = createClient();
      await connectClient(client);
      try {
        await context.setup(client);
        rawEmit(client, event, payload, () => {});
        rawEmit(client, event, payload);
        // Les messages d'un socket sont traités dans l'ordre : la sonde répond après les handlers synchrones
        await new Promise<void>((resolve) => {
          client.emit('room:checkPassword', { roomId: 'AAAAAA' }, () => resolve());
        });
        rawEmit(client, 'room:leave');
      } finally {
        await disconnectClient(client);
      }
    }

    async function runPool(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
      let next = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (next < tasks.length) {
          const task = tasks[next++];
          await task();
        }
      });
      await Promise.all(workers);
    }

    it.each(contexts)('$name', async (context) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await context.prepare();

        const tasks = Object.keys(EVENT_SHAPES).flatMap((event) =>
          FUZZ_PAYLOADS.map((payload) => () => fuzzOne(context, event, payload))
        );
        await runPool(tasks, 8);
        await wait(300);

        // Un handler qui jette (même sans tuer le serveur) est une régression : le wrapper l'a loggé
        const handlerFailures = errorSpy.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].startsWith('[socket] handler')
        );
        expect(handlerFailures.map((call) => `${String(call[1])}: ${String(call[2])}`)).toEqual([]);
        expect(({} as Record<string, unknown>).isPO).toBeUndefined();
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        await expectServerAlive();
      } finally {
        errorSpy.mockRestore();
      }
    }, 240000);
  });

  describe('enregistrement des handlers', () => {
    it('chaque événement de EVENT_SHAPES (et disconnect) est enregistré, rien d\'autre', async () => {
      const client = createClient();
      await connectClient(client);

      const serverSocket = ioServer.sockets.sockets.get(client.id!)!;
      // 'error' est un listener interne de Socket.IO (noop), pas un handler applicatif
      const registered = serverSocket.eventNames().map(String).filter((name) => name !== 'error').sort();
      const expected = [...Object.keys(EVENT_SHAPES), 'disconnect'].sort();

      expect(registered).toEqual(expected);
      await disconnectClient(client);
    });
  });
});
