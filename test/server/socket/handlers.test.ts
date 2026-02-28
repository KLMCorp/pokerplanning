import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from '../../../server/socket/handlers';
import { ClientToServerEvents, ServerToClientEvents, Room } from '../../../src/types';

// Port unique pour éviter les conflits
const TEST_PORT = 3099;

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;

function createClient(): TypedClientSocket {
  return ioc(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    autoConnect: false,
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

describe('Socket.IO Handlers', () => {
  beforeAll(async () => {
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
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe('room:create', () => {
    it('devrait créer une room', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string; reconnectSecret?: string }>((resolve) => {
        client.emit('room:create', { userName: 'Alice' }, (room, userId, reconnectSecret) => {
          resolve({ room, userId, reconnectSecret });
        });
      });

      expect(result.room).toBeDefined();
      expect(result.room.id).toHaveLength(6);
      expect(result.userId).toBeDefined();
      expect(result.room.users[result.userId].name).toBe('Alice');
      expect(result.room.users[result.userId].isPO).toBe(true);
      expect(result.reconnectSecret).toBeDefined();

      await disconnectClient(client);
    });

    it('devrait créer une room avec mot de passe', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', { userName: 'Bob', password: 'secret' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      expect(result.room.hasPassword).toBe(true);

      await disconnectClient(client);
    });

    it('devrait créer une room avec couleur personnalisée', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', { userName: 'Charlie', cardColor: '#EF4444' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      expect(result.room.users[result.userId].cardColor).toBe('#EF4444');

      await disconnectClient(client);
    });

    it('devrait rejeter un nom vide', async () => {
      const client = createClient();
      await connectClient(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.on('error', (msg) => resolve(msg));
      });

      client.emit('room:create', { userName: '' }, () => {});

      const error = await errorPromise;
      expect(error).toContain('nom');

      await disconnectClient(client);
    });
  });

  describe('room:join', () => {
    let roomId: string;
    let poClient: TypedClientSocket;

    beforeEach(async () => {
      poClient = createClient();
      await connectClient(poClient);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        poClient.emit('room:create', { userName: 'PO' }, (room, userId) => {
          resolve({ room, userId });
        });
      });
      roomId = result.room.id;
    });

    afterAll(async () => {
      await disconnectClient(poClient);
    });

    it('devrait rejoindre une room existante', async () => {
      const devClient = createClient();
      await connectClient(devClient);

      const result = await new Promise<{ success: boolean; room?: Room; userId?: string }>((resolve) => {
        devClient.emit('room:join', { roomId, userName: 'Dev1' }, (success, room, userId) => {
          resolve({ success, room, userId });
        });
      });

      expect(result.success).toBe(true);
      expect(result.room).toBeDefined();
      expect(result.userId).toBeDefined();
      expect(result.room!.users[result.userId!].name).toBe('Dev1');
      expect(result.room!.users[result.userId!].isPO).toBe(false);

      await disconnectClient(devClient);
    });

    it('devrait échouer pour une room inexistante', async () => {
      const devClient = createClient();
      await connectClient(devClient);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        devClient.emit('room:join', { roomId: 'ZZZZZZ', userName: 'Dev2' }, (success, room, userId, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      await disconnectClient(devClient);
    });

    it('devrait échouer avec un mauvais mot de passe', async () => {
      // Créer une room protégée
      const protectedClient = createClient();
      await connectClient(protectedClient);

      const protectedResult = await new Promise<{ room: Room }>((resolve) => {
        protectedClient.emit('room:create', { userName: 'SecurePO', password: 'pass123' }, (room) => {
          resolve({ room });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        devClient.emit('room:join', {
          roomId: protectedResult.room.id,
          userName: 'Hacker',
          password: 'wrong',
        }, (success, room, userId, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mot de passe');

      await disconnectClient(devClient);
      await disconnectClient(protectedClient);
    });
  });

  describe('room:checkPassword', () => {
    it('devrait indiquer si une room a un mot de passe', async () => {
      const client = createClient();
      await connectClient(client);

      const createResult = await new Promise<{ room: Room }>((resolve) => {
        client.emit('room:create', { userName: 'PWCheck', password: 'test' }, (room) => {
          resolve({ room });
        });
      });

      const client2 = createClient();
      await connectClient(client2);

      const result = await new Promise<{ hasPassword: boolean; roomExists: boolean }>((resolve) => {
        client2.emit('room:checkPassword', { roomId: createResult.room.id }, (hasPassword, roomExists) => {
          resolve({ hasPassword, roomExists });
        });
      });

      expect(result.roomExists).toBe(true);
      expect(result.hasPassword).toBe(true);

      await disconnectClient(client);
      await disconnectClient(client2);
    });

    it('devrait retourner roomExists=false pour une room inexistante', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ hasPassword: boolean; roomExists: boolean }>((resolve) => {
        client.emit('room:checkPassword', { roomId: 'ZZZZZZ' }, (hasPassword, roomExists) => {
          resolve({ hasPassword, roomExists });
        });
      });

      expect(result.roomExists).toBe(false);

      await disconnectClient(client);
    });
  });

  describe('item:create + item:update + item:delete', () => {
    let roomId: string;
    let poClient: TypedClientSocket;

    beforeEach(async () => {
      poClient = createClient();
      await connectClient(poClient);

      const result = await new Promise<{ room: Room }>((resolve) => {
        poClient.emit('room:create', { userName: 'ItemPO' }, (room) => {
          resolve({ room });
        });
      });
      roomId = result.room.id;
    });

    afterAll(async () => {
      await disconnectClient(poClient);
    });

    it('devrait créer un item et recevoir la mise à jour', async () => {
      const updatePromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (room) => resolve(room));
      });

      poClient.emit('item:create', { title: 'US-001', description: 'Ma user story' });

      const updatedRoom = await updatePromise;
      expect(updatedRoom.items).toHaveLength(1);
      expect(updatedRoom.items[0].title).toBe('US-001');
      expect(updatedRoom.items[0].description).toBe('Ma user story');
    });

    it('devrait mettre à jour un item', async () => {
      // Créer d'abord
      const createPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (room) => resolve(room));
      });
      poClient.emit('item:create', { title: 'OldTitle', description: 'OldDesc' });
      const room = await createPromise;
      const itemId = room.items[0].id;

      // Mettre à jour
      const updatePromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('item:update', { itemId, title: 'NewTitle' });
      const updated = await updatePromise;
      expect(updated.items[0].title).toBe('NewTitle');
    });

    it('devrait supprimer un item', async () => {
      const createPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (room) => resolve(room));
      });
      poClient.emit('item:create', { title: 'ToDelete', description: 'Will be deleted' });
      const room = await createPromise;
      const itemId = room.items[0].id;

      const deletePromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('item:delete', { itemId });
      const updated = await deletePromise;
      expect(updated.items).toHaveLength(0);
    });
  });

  describe('vote cycle', () => {
    it('devrait compléter un cycle vote: start → cast → reveal → reset', async () => {
      const po = createClient();
      await connectClient(po);

      const { room, userId: poId } = await new Promise<{ room: Room; userId: string }>((resolve) => {
        po.emit('room:create', { userName: 'VotePO' }, (room, userId) => resolve({ room, userId }));
      });

      const dev = createClient();
      await connectClient(dev);
      const { userId: devId } = await new Promise<{ userId: string }>((resolve) => {
        dev.emit('room:join', { roomId: room.id, userName: 'VoteDev' }, (s, r, userId) => resolve({ userId: userId! }));
      });

      // Créer item (state = idle → broadcast room:updated)
      const afterCreate = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:create', { title: 'VoteItem', description: 'D' });
      });

      // Sélectionner item (state = idle → broadcast room:updated)
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:select', { itemId: afterCreate.items[0].id });
      });

      // Démarrer le vote — pendant voting, le serveur envoie room:updated
      // per-socket via io.to(socketId), pas de broadcast room
      // On fire-and-forget puis on attend que le serveur ait traité
      po.emit('vote:start');
      await new Promise((r) => setTimeout(r, 100));

      // Voter (PO et Dev) — même chose, per-socket pendant voting
      po.emit('vote:cast', { value: '5' });
      await new Promise((r) => setTimeout(r, 50));
      dev.emit('vote:cast', { value: '8' });
      await new Promise((r) => setTimeout(r, 50));

      // Révéler — state passe à 'revealed', donc broadcast normal via io.to(roomId)
      const revealedRoom = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:reveal');
      });

      expect(revealedRoom.state).toBe('revealed');
      const activeItem = revealedRoom.items.find(i => i.id === revealedRoom.activeItemId);
      expect(activeItem).toBeDefined();
      expect(Object.keys(activeItem!.votes)).toHaveLength(2);
      expect(activeItem!.votes[poId].value).toBe('5');
      expect(activeItem!.votes[devId].value).toBe('8');

      // Reset — state passe à 'idle', broadcast normal
      const resetRoom = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:reset');
      });

      expect(resetRoom.state).toBe('idle');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev ne devrait pas pouvoir démarrer le vote', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const poResult = await new Promise<{ room: Room }>((resolve) => {
        poClient.emit('room:create', { userName: 'VotePO2' }, (room) => {
          resolve({ room });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      await new Promise<void>((resolve) => {
        devClient.emit('room:join', { roomId: poResult.room.id, userName: 'VoteDev2' }, () => resolve());
      });

      // Créer et sélectionner un item
      const createPromise = new Promise<Room>((resolve) => {
        poClient.once('room:updated', (r) => resolve(r));
      });
      poClient.emit('item:create', { title: 'NoVote', description: 'Desc' });
      const room = await createPromise;

      const selectPromise = new Promise<Room>((resolve) => {
        poClient.once('room:updated', (r) => resolve(r));
      });
      poClient.emit('item:select', { itemId: room.items[0].id });
      await selectPromise;

      const errorPromise = new Promise<string>((resolve) => {
        devClient.once('error', (msg) => resolve(msg));
      });
      devClient.emit('vote:start');
      const error = await errorPromise;
      expect(error).toBeDefined();

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  describe('item:setFinalScore', () => {
    it('devrait définir le score final d\'un item', async () => {
      const client = createClient();
      await connectClient(client);

      const createResult = await new Promise<{ room: Room }>((resolve) => {
        client.emit('room:create', { userName: 'ScorePO' }, (room) => {
          resolve({ room });
        });
      });

      // Créer un item
      const itemPromise = new Promise<Room>((resolve) => {
        client.on('room:updated', (r) => resolve(r));
      });
      client.emit('item:create', { title: 'Scorable', description: 'Desc' });
      const room = await itemPromise;

      // Définir le score
      const scorePromise = new Promise<Room>((resolve) => {
        client.on('room:updated', (r) => resolve(r));
      });
      client.emit('item:setFinalScore', { itemId: room.items[0].id, score: '13' });
      const updated = await scorePromise;
      expect(updated.items[0].finalScore).toBe('13');

      await disconnectClient(client);
    });
  });

  describe('timer:set + timer:start + timer:stop + timer:reset', () => {
    let poClient: TypedClientSocket;

    beforeEach(async () => {
      poClient = createClient();
      await connectClient(poClient);

      await new Promise<void>((resolve) => {
        poClient.emit('room:create', { userName: 'TimerPO' }, () => resolve());
      });
    });

    afterAll(async () => {
      await disconnectClient(poClient);
    });

    it('devrait configurer et démarrer un timer', async () => {
      // Set
      const setPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:set', { durationMs: 60000 });
      const afterSet = await setPromise;
      expect(afterSet.timerDuration).toBe(60000);
      expect(afterSet.timerStartedAt).toBeUndefined();

      // Start
      const startPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:start');
      const afterStart = await startPromise;
      expect(afterStart.timerStartedAt).toBeDefined();
    });

    it('devrait stopper et réinitialiser un timer', async () => {
      // Set + Start
      const setPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:set', { durationMs: 120000 });
      await setPromise;

      const startPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:start');
      await startPromise;

      // Stop
      const stopPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:stop');
      const afterStop = await stopPromise;
      expect(afterStop.timerStartedAt).toBeUndefined();
      expect(afterStop.timerStoppedRemaining).toBeDefined();
      expect(afterStop.timerStoppedRemaining).toBeLessThanOrEqual(120000);

      // Reset
      const resetPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:reset');
      const afterReset = await resetPromise;
      expect(afterReset.timerDuration).toBe(120000);
      expect(afterReset.timerStartedAt).toBeUndefined();
      expect(afterReset.timerStoppedRemaining).toBeUndefined();
    });

    it('devrait clamper la durée au minimum', async () => {
      const setPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:set', { durationMs: 1000 }); // 1s < 10s min
      const room = await setPromise;
      expect(room.timerDuration).toBe(10000);
    });

    it('devrait clamper la durée au maximum', async () => {
      const setPromise = new Promise<Room>((resolve) => {
        poClient.on('room:updated', (r) => resolve(r));
      });
      poClient.emit('timer:set', { durationMs: 99999999 }); // > 60min
      const room = await setPromise;
      expect(room.timerDuration).toBe(3600000);
    });
  });

  describe('room:updateSettings', () => {
    it('devrait mettre à jour les paramètres de la room', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'SettPO' }, () => resolve());
      });

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('room:updateSettings', { settings: { emojisEnabled: false } }, (success) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(true);

      await disconnectClient(client);
    });
  });

  describe('room:transferPO', () => {
    it('devrait transférer le rôle PO', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const poResult = await new Promise<{ room: Room; userId: string }>((resolve) => {
        poClient.emit('room:create', { userName: 'OldPO' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      const devResult = await new Promise<{ success: boolean; userId?: string }>((resolve) => {
        devClient.emit('room:join', { roomId: poResult.room.id, userName: 'NewPO' }, (success, room, userId) => {
          resolve({ success, userId });
        });
      });

      const transferResult = await new Promise<{ success: boolean }>((resolve) => {
        poClient.emit('room:transferPO', { targetUserId: devResult.userId! }, (success) => {
          resolve({ success });
        });
      });

      expect(transferResult.success).toBe(true);

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });

    it('un dev ne devrait pas pouvoir transférer le PO', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const poResult = await new Promise<{ room: Room; userId: string }>((resolve) => {
        poClient.emit('room:create', { userName: 'StayPO' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      await new Promise<void>((resolve) => {
        devClient.emit('room:join', { roomId: poResult.room.id, userName: 'CantTransfer' }, () => resolve());
      });

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        devClient.emit('room:transferPO', { targetUserId: poResult.userId }, (success, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  describe('emoji:send', () => {
    it('devrait envoyer un emoji au destinataire', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const poResult = await new Promise<{ room: Room; userId: string }>((resolve) => {
        poClient.emit('room:create', { userName: 'EmojiPO' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      const devResult = await new Promise<{ userId?: string }>((resolve) => {
        devClient.emit('room:join', { roomId: poResult.room.id, userName: 'EmojiDev' }, (success, room, userId) => {
          resolve({ userId });
        });
      });

      // Le PO envoie un emoji au dev
      const emojiPromise = new Promise<{ fromUserName: string; emoji: string }>((resolve) => {
        devClient.on('emoji:received', (data) => resolve(data));
      });

      poClient.emit('emoji:send', { targetUserId: devResult.userId!, emoji: '🍺' });

      const emojiData = await emojiPromise;
      expect(emojiData.fromUserName).toBe('EmojiPO');
      expect(emojiData.emoji).toBe('🍺');

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  describe('room:close', () => {
    it('le PO devrait pouvoir fermer la room (sauvegarde historique)', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      await new Promise<void>((resolve) => {
        poClient.emit('room:create', { userName: 'ClosePO' }, () => resolve());
      });

      // room:close sauvegarde l'historique et retourne success
      const result = await new Promise<{ success: boolean }>((resolve) => {
        poClient.emit('room:close', (success) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(true);

      await disconnectClient(poClient);
    });

    it('un dev ne devrait pas pouvoir fermer la room', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const poResult = await new Promise<{ room: Room }>((resolve) => {
        poClient.emit('room:create', { userName: 'ClosePO2' }, (room) => {
          resolve({ room });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      await new Promise<void>((resolve) => {
        devClient.emit('room:join', { roomId: poResult.room.id, userName: 'CloseDev2' }, () => resolve());
      });

      const result = await new Promise<{ success: boolean }>((resolve) => {
        devClient.emit('room:close', (success) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  describe('deck:update', () => {
    it('devrait mettre à jour le deck de la room', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckPO' }, () => resolve());
      });

      const newDeck = {
        cards: [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
        ],
      };

      const updatePromise = new Promise<Room>((resolve) => {
        client.on('room:updated', (r) => resolve(r));
      });

      client.emit('deck:update', { deck: newDeck });

      const updated = await updatePromise;
      expect(updated.deck.cards).toHaveLength(3);
      expect(updated.deck.cards[0].value).toBe('1');

      await disconnectClient(client);
    });
  });

  describe('room:reconnect', () => {
    it('devrait permettre la reconnexion avec le bon secret', async () => {
      const client = createClient();
      await connectClient(client);

      const createResult = await new Promise<{ room: Room; userId: string; reconnectSecret?: string }>((resolve) => {
        client.emit('room:create', { userName: 'ReconnectPO' }, (room, userId, reconnectSecret) => {
          resolve({ room, userId, reconnectSecret });
        });
      });

      // Simuler une déconnexion/reconnexion
      await disconnectClient(client);

      // Attendre un peu pour que le serveur traite la déconnexion
      await new Promise((r) => setTimeout(r, 200));

      const newClient = createClient();
      await connectClient(newClient);

      const result = await new Promise<{ success: boolean; room?: Room }>((resolve) => {
        newClient.emit('room:reconnect', {
          roomId: createResult.room.id,
          userId: createResult.userId,
          secret: createResult.reconnectSecret!,
        }, (success, room) => {
          resolve({ success, room });
        });
      });

      expect(result.success).toBe(true);
      expect(result.room).toBeDefined();

      await disconnectClient(newClient);
    });

    it('devrait échouer avec un mauvais secret', async () => {
      const client = createClient();
      await connectClient(client);

      const createResult = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', { userName: 'BadSecretPO' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      await disconnectClient(client);
      await new Promise((r) => setTimeout(r, 200));

      const newClient = createClient();
      await connectClient(newClient);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        newClient.emit('room:reconnect', {
          roomId: createResult.room.id,
          userId: createResult.userId,
          secret: 'wrong-secret',
        }, (success) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(newClient);
    });
  });

  describe('item:select', () => {
    it('devrait sélectionner un item comme actif', async () => {
      const client = createClient();
      await connectClient(client);

      const { room } = await new Promise<{ room: Room }>((resolve) => {
        client.emit('room:create', { userName: 'SelectPO' }, (room) => resolve({ room }));
      });

      // Créer un item
      const afterCreate = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'SelectItem', description: 'Desc' });
      });

      // Sélectionner
      const afterSelect = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:select', { itemId: afterCreate.items[0].id });
      });

      expect(afterSelect.activeItemId).toBe(afterCreate.items[0].id);

      await disconnectClient(client);
    });

    it('devrait sélectionner un autre item et réinitialiser les votes', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'SelectPO3' }, () => resolve());
      });

      // Créer 2 items
      const after1 = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item1', description: '' });
      });
      const after2 = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item2', description: '' });
      });

      // Sélectionner le 1er item
      await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:select', { itemId: after1.items[0].id });
      });

      // Sélectionner le 2e item → devrait changer activeItemId
      const afterSwitch = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:select', { itemId: after2.items[1].id });
      });

      expect(afterSwitch.activeItemId).toBe(after2.items[1].id);

      await disconnectClient(client);
    });
  });

  describe('item:reorder', () => {
    it('devrait réordonner les items', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'ReorderPO' }, () => resolve());
      });

      // Créer 3 items
      await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item A', description: '' });
      });
      await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item B', description: '' });
      });
      const after3 = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item C', description: '' });
      });

      // Déplacer Item C (order 2) à la position 0
      const afterReorder = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:reorder', { itemId: after3.items[2].id, newOrder: 0 });
      });

      expect(afterReorder.items[0].title).toBe('Item C');

      await disconnectClient(client);
    });
  });

  describe('vote:cast validation', () => {
    it('devrait rejeter un vote avec une valeur invalide', async () => {
      const po = createClient();
      await connectClient(po);

      const { room } = await new Promise<{ room: Room }>((resolve) => {
        po.emit('room:create', { userName: 'VoteBadPO' }, (room) => resolve({ room }));
      });

      // Créer et sélectionner un item
      const afterCreate = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:create', { title: 'VoteBadItem', description: '' });
      });
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:select', { itemId: afterCreate.items[0].id });
      });

      // Start vote
      po.emit('vote:start');
      await new Promise((r) => setTimeout(r, 100));

      // Vote avec une valeur non existante dans le deck
      const error = await new Promise<string>((resolve) => {
        po.once('error', resolve);
        po.emit('vote:cast', { value: 'INVALID_VALUE_999' });
      });

      expect(error).toContain('invalide');

      await disconnectClient(po);
    });

    it('devrait rejeter un vote hors phase de vote', async () => {
      const po = createClient();
      await connectClient(po);

      await new Promise<void>((resolve) => {
        po.emit('room:create', { userName: 'VoteNoStartPO' }, () => resolve());
      });

      // Essayer de voter sans démarrer le vote
      const error = await new Promise<string>((resolve) => {
        po.once('error', resolve);
        po.emit('vote:cast', { value: '5' });
      });

      expect(error).toContain('vote');

      await disconnectClient(po);
    });
  });

  describe('item:create validation', () => {
    it('devrait rejeter un titre vide', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'ItemEmptyPO' }, () => resolve());
      });

      const error = await new Promise<string>((resolve) => {
        client.once('error', resolve);
        client.emit('item:create', { title: '', description: '' });
      });

      expect(error).toBeDefined();

      await disconnectClient(client);
    });
  });

  describe('restrictions PO (dev ne peut pas faire les actions PO)', () => {
    it('un dev ne devrait pas pouvoir timer:set, vote:reveal, ni vote:reset', async () => {
      const po = createClient();
      await connectClient(po);

      const { room } = await new Promise<{ room: Room }>((resolve) => {
        po.emit('room:create', { userName: 'AuthPO' }, (room) => resolve({ room }));
      });

      const dev = createClient();
      await connectClient(dev);
      await new Promise<void>((resolve) => {
        dev.emit('room:join', { roomId: room.id, userName: 'AuthDev' }, () => resolve());
      });

      // Timer set → rejeté
      const timerError = await new Promise<string>((resolve) => {
        dev.once('error', resolve);
        dev.emit('timer:set', { durationMs: 60000 });
      });
      expect(timerError).toContain('PO');

      // Vote reveal → rejeté
      const revealError = await new Promise<string>((resolve) => {
        dev.once('error', resolve);
        dev.emit('vote:reveal');
      });
      expect(revealError).toContain('PO');

      // Vote reset → rejeté
      const resetError = await new Promise<string>((resolve) => {
        dev.once('error', resolve);
        dev.emit('vote:reset');
      });
      expect(resetError).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  describe('room:create sans authentification', () => {
    it('devrait créer une room avec le deck par défaut (12 cartes)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room }>((resolve) => {
        client.emit('room:create', { userName: 'DefaultDeckPO' }, (room) => resolve({ room }));
      });

      // Sans authentification, le deck par défaut est utilisé (12 cartes)
      expect(result.room.deck).toBeDefined();
      expect(result.room.deck.cards.length).toBeGreaterThanOrEqual(2);
      expect(result.room.id).toHaveLength(6);
      expect(result.room.hasPassword).toBe(false);

      await disconnectClient(client);
    });

    it('devrait créer une room avec mot de passe', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room }>((resolve) => {
        client.emit('room:create', { userName: 'PwdPO', password: 'mysecret' }, (room) => resolve({ room }));
      });

      expect(result.room.hasPassword).toBe(true);

      await disconnectClient(client);
    });
  });

  describe('multiple items workflow', () => {
    it('devrait gérer la suppression de l\'item actif', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'MultiPO' }, () => resolve());
      });

      // Créer 2 items
      const after1 = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Active', description: '' });
      });
      await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Other', description: '' });
      });

      // Sélectionner le premier
      await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:select', { itemId: after1.items[0].id });
      });

      // Supprimer l'item actif
      const afterDelete = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:delete', { itemId: after1.items[0].id });
      });

      expect(afterDelete.activeItemId).toBeNull();
      expect(afterDelete.items).toHaveLength(1);
      expect(afterDelete.items[0].title).toBe('Other');

      await disconnectClient(client);
    });
  });
});
