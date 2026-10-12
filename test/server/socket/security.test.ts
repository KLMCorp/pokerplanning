import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from '../../../server/socket/handlers';
import { ClientToServerEvents, ServerToClientEvents, Room, DeckConfig } from '../../../src/types';

// Port unique pour éviter les conflits avec les autres tests
const TEST_PORT = 3098;

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

describe('Sécurité — sanitization des entrées', () => {
  beforeAll(async () => {
    // Plus de 10 créations de room depuis la même IP : on relève le rate limit de room:create
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
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // ====== XSS — Échappement HTML ======

  describe('XSS — conservation brute dans les noms (échappement au rendu React)', () => {
    it('devrait conserver les balises HTML telles quelles dans le nom lors de room:create', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', { userName: '<script>alert(1)</script>' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const userName = result.room.users[result.userId].name;
      expect(userName).toBe('<script>alert(1)</script>');

      await disconnectClient(client);
    });

    it('devrait conserver les balises HTML telles quelles dans le nom lors de room:join', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const createResult = await new Promise<{ room: Room }>((resolve) => {
        poClient.emit('room:create', { userName: 'SafePO' }, (room) => resolve({ room }));
      });

      const devClient = createClient();
      await connectClient(devClient);

      const joinResult = await new Promise<{ success: boolean; room?: Room; userId?: string }>((resolve) => {
        devClient.emit('room:join', {
          roomId: createResult.room.id,
          userName: '<img onerror="alert(1)" src=x>',
        }, (success, room, userId) => {
          resolve({ success, room, userId });
        });
      });

      expect(joinResult.success).toBe(true);
      const userName = joinResult.room!.users[joinResult.userId!].name;
      // Aucun échappement côté serveur : React échappe le texte au rendu
      expect(userName).toBe('<img onerror="alert(1)" src=x>');

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  describe('XSS — conservation brute dans les items (échappement au rendu React)', () => {
    it('devrait conserver les balises script dans le titre d\'un item', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'XssPO' }, () => resolve());
      });

      const updatePromise = new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
      });
      client.emit('item:create', {
        title: '<script>alert("xss")</script>',
        description: '<img src=x onerror=alert(1)>',
      });
      const room = await updatePromise;

      expect(room.items[0].title).toContain('<script>');
      expect(room.items[0].title).toBe('<script>alert("xss")</script>');
      expect(room.items[0].description).toBe('<img src=x onerror=alert(1)>');

      await disconnectClient(client);
    });

    it('devrait conserver les balises HTML telles quelles dans item:update', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'UpdateXssPO' }, () => resolve());
      });

      // Créer un item propre
      const created = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Clean', description: 'Clean desc' });
      });

      // Le mettre à jour avec du HTML malveillant
      const updated = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:update', {
          itemId: created.items[0].id,
          title: '"><svg onload=alert(1)>',
          description: "' onfocus='alert(1)' autofocus='",
        });
      });

      expect(updated.items[0].title).toBe('"><svg onload=alert(1)>');
      expect(updated.items[0].description).toBe("' onfocus='alert(1)' autofocus='");

      await disconnectClient(client);
    });

    it('devrait conserver le score final tel quel dans item:setFinalScore', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'ScoreXss' }, () => resolve());
      });

      const created = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item', description: '' });
      });

      const updated = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:setFinalScore', { itemId: created.items[0].id, score: '<b>13</b>' });
      });

      expect(updated.items[0].finalScore).toBe('<b>13</b>');

      await disconnectClient(client);
    });
  });

  describe('XSS — conservation brute des 5 caractères HTML sensibles', () => {
    it('devrait conserver &, <, >, ", \' tels quels dans les noms', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', { userName: 'A&B<C>D"E\'F' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const name = result.room.users[result.userId].name;
      expect(name).toBe('A&B<C>D"E\'F');

      await disconnectClient(client);
    });
  });

  // ====== Gardes de type runtime (isString) ======

  describe('gardes typeof — rejet des types non-string', () => {
    it('devrait rejeter un userName numérique dans room:create', async () => {
      const client = createClient();
      await connectClient(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      // Envoi d'un nombre au lieu d'une string (bypass TypeScript via cast)
      (client as any).emit('room:create', { userName: 12345 }, () => {});
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un userName numérique dans room:join', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const { room } = await new Promise<{ room: Room }>((resolve) => {
        poClient.emit('room:create', { userName: 'TypePO' }, (room) => resolve({ room }));
      });

      const devClient = createClient();
      await connectClient(devClient);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        (devClient as any).emit('room:join', {
          roomId: room.id,
          userName: 42,
        }, (success: boolean, room: any, userId: any, error: string) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });

    it('devrait rejeter un title non-string dans item:create', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'TypeItemPO' }, () => resolve());
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      (client as any).emit('item:create', { title: 123, description: 'desc' });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un title non-string dans item:update', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'TypeUpdatePO' }, () => resolve());
      });

      const created = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Valid', description: '' });
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      (client as any).emit('item:update', { itemId: created.items[0].id, title: { evil: true } });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });
  });

  // ====== Validation du deck ======

  describe('deck:update — validation de structure', () => {
    it('devrait rejeter un deck avec plus de 30 cartes', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckLimitPO' }, () => resolve());
      });

      const oversizedDeck: DeckConfig = {
        cards: Array.from({ length: 31 }, (_, i) => ({
          value: `${i}`,
          label: `Card ${i}`,
        })),
      };

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('deck:update', { deck: oversizedDeck });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait accepter un deck avec exactement 30 cartes', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'Deck30PO' }, () => resolve());
      });

      const maxDeck: DeckConfig = {
        cards: Array.from({ length: 30 }, (_, i) => ({
          value: `${i}`,
          label: `Card ${i}`,
        })),
      };

      const updatePromise = new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
      });
      client.emit('deck:update', { deck: maxDeck });
      const room = await updatePromise;
      expect(room.deck.cards).toHaveLength(30);

      await disconnectClient(client);
    });

    it('devrait rejeter un deck avec un tableau vide', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckEmptyPO' }, () => resolve());
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('deck:update', { deck: { cards: [] } });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un deck avec des URLs d\'image externes', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckUrlPO' }, () => resolve());
      });

      const maliciousDeck: DeckConfig = {
        cards: [{ value: '1', label: '1', frontImageUrl: 'https://evil.com/steal.js' }],
      };

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('deck:update', { deck: maliciousDeck });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un deck avec une backImageUrl externe', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckBackUrlPO' }, () => resolve());
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('deck:update', {
        deck: {
          cards: [{ value: '1', label: '1' }],
          backImageUrl: 'http://evil.com/tracker.png',
        },
      });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait accepter un deck avec des URLs locales valides', async () => {
      const client = createClient();
      await connectClient(client);

      const roomId = await new Promise<string>((resolve) => {
        client.emit('room:create', { userName: 'DeckLocalPO' }, (room) => resolve(room.id));
      });

      // Les URLs d'uploads doivent appartenir au dossier de la room (ou être des images statiques)
      const validDeck: DeckConfig = {
        cards: [
          { value: '1', label: '1', frontImageUrl: `/uploads/${roomId}/card.png` },
          { value: '2', label: '2', frontImageUrl: '/images/cartes/heart.png' },
        ],
        backImageUrl: `/uploads/${roomId}/back.png`,
      };

      const updatePromise = new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
      });
      client.emit('deck:update', { deck: validDeck });
      const room = await updatePromise;
      expect(room.deck.cards).toHaveLength(2);

      await disconnectClient(client);
    });

    it('devrait sanitizer les valeurs et labels des cartes dans le deck', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckSanitPO' }, () => resolve());
      });

      const xssDeck: DeckConfig = {
        cards: [
          { value: '<script>', label: '<b>Bold</b>' },
          { value: '5', label: 'Normal' },
        ],
      };

      const updatePromise = new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
      });
      client.emit('deck:update', { deck: xssDeck });
      const room = await updatePromise;

      expect(room.deck.cards[0].value).toBe('<script>');
      expect(room.deck.cards[0].label).toBe('<b>Bold</b>');
      expect(room.deck.cards[1].label).toBe('Normal');

      await disconnectClient(client);
    });

    it('devrait rejeter un deck avec des valeurs de carte trop longues', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckLongPO' }, () => resolve());
      });

      const longValueDeck: DeckConfig = {
        cards: [{ value: 'A'.repeat(21), label: 'X' }],
      };

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('deck:update', { deck: longValueDeck });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un deck avec des labels trop longs', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'DeckLongLblPO' }, () => resolve());
      });

      const longLabelDeck: DeckConfig = {
        cards: [{ value: '1', label: 'B'.repeat(31) }],
      };

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('deck:update', { deck: longLabelDeck });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });
  });

  // ====== Validation du layout ======

  describe('auth:updateLayoutConfig — validation', () => {
    // Note: ces tests ne passent par l'authentification, donc callback(false) sans erreur spécifique.
    // On valide que le serveur ne crash pas avec des données invalides.

    it('devrait rejeter un layout avec des panneaux invalides (non authentifié)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        (client as any).emit('auth:updateLayoutConfig', {
          layoutConfig: [['invalidPanel', 'anotherBad']],
        }, (success: boolean) => {
          resolve({ success });
        });
      });

      // Sans authentification, le callback retourne false
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait rejeter un layout non-tableau (non authentifié)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        (client as any).emit('auth:updateLayoutConfig', {
          layoutConfig: 'not-an-array',
        }, (success: boolean) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait rejeter un layout avec trop de lignes (non authentifié)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        (client as any).emit('auth:updateLayoutConfig', {
          layoutConfig: [
            ['pokerTable'], ['cardPicker'], ['controlsStats'],
            ['itemList'], ['estimatedItems'], ['userList'],
            ['pokerTable'], // 7e ligne → trop
          ],
        }, (success: boolean) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait rejeter un layout avec trop de panneaux par ligne (non authentifié)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        (client as any).emit('auth:updateLayoutConfig', {
          layoutConfig: [['pokerTable', 'cardPicker', 'controlsStats', 'itemList']], // 4 panneaux
        }, (success: boolean) => {
          resolve({ success });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== Limite de mot de passe ======

  describe('limites de mot de passe', () => {
    it('devrait rejeter un mot de passe trop long dans room:create', async () => {
      const client = createClient();
      await connectClient(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });

      const longPassword = 'A'.repeat(257);
      client.emit('room:create', { userName: 'LongPwdPO', password: longPassword }, () => {});
      const error = await errorPromise;
      expect(error).toContain('Mot de passe trop long');

      await disconnectClient(client);
    });

    it('devrait accepter un mot de passe de 256 caractères dans room:create', async () => {
      const client = createClient();
      await connectClient(client);

      const maxPassword = 'B'.repeat(256);
      const result = await new Promise<{ room: Room }>((resolve) => {
        client.emit('room:create', { userName: 'MaxPwdPO', password: maxPassword }, (room) => {
          resolve({ room });
        });
      });

      expect(result.room).toBeDefined();
      expect(result.room.hasPassword).toBe(true);

      await disconnectClient(client);
    });

    it('devrait rejeter un mot de passe trop long dans room:join', async () => {
      const poClient = createClient();
      await connectClient(poClient);

      const { room } = await new Promise<{ room: Room }>((resolve) => {
        poClient.emit('room:create', { userName: 'PwdJoinPO', password: 'short' }, (room) => {
          resolve({ room });
        });
      });

      const devClient = createClient();
      await connectClient(devClient);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        devClient.emit('room:join', {
          roomId: room.id,
          userName: 'PwdJoinDev',
          password: 'C'.repeat(257),
        }, (success, r, userId, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mot de passe trop long');

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  // ====== Caractères de contrôle ======

  describe('suppression des caractères de contrôle', () => {
    it('devrait supprimer les caractères de contrôle dans le nom', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', { userName: 'Al\x00ic\x07e' }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const name = result.room.users[result.userId].name;
      expect(name).not.toContain('\x00');
      expect(name).not.toContain('\x07');
      expect(name).toContain('Alice');

      await disconnectClient(client);
    });

    it('devrait supprimer les caractères de contrôle dans les titres d\'items', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'CtrlPO' }, () => resolve());
      });

      const room = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'US\x00-\x1F001', description: 'Desc\x07ription' });
      });

      expect(room.items[0].title).not.toContain('\x00');
      expect(room.items[0].title).not.toContain('\x1F');
      expect(room.items[0].description).not.toContain('\x07');

      await disconnectClient(client);
    });
  });

  // ====== Payloads combinés XSS ======

  describe('payloads XSS avancés (conservation brute, échappement au rendu React)', () => {
    it('devrait conserver une injection SVG telle quelle', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'SvgPO' }, () => resolve());
      });

      const room = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', {
          title: '<svg/onload=alert(1)>',
          description: '<math><mtext><table><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
        });
      });

      expect(room.items[0].title).toBe('<svg/onload=alert(1)>');
      expect(room.items[0].description).toContain('<img onerror=alert(1) src=1>');

      await disconnectClient(client);
    });

    it('devrait conserver une injection event handler telle quelle', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ room: Room; userId: string }>((resolve) => {
        client.emit('room:create', {
          userName: 'x" onclick="alert(1)',
        }, (room, userId) => {
          resolve({ room, userId });
        });
      });

      const name = result.room.users[result.userId].name;
      expect(name).toBe('x" onclick="alert(1)');

      await disconnectClient(client);
    });

    it('devrait conserver une injection via balise iframe telle quelle', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'IframePO' }, () => resolve());
      });

      const room = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', {
          title: '<iframe src="javascript:alert(1)">',
          description: '<object data="javascript:alert(1)">',
        });
      });

      expect(room.items[0].title).toBe('<iframe src="javascript:alert(1)">');
      expect(room.items[0].description).toBe('<object data="javascript:alert(1)">');

      await disconnectClient(client);
    });
  });

  // ====== Validation des structures invalides ======

  describe('deck:update — rejet des structures malformées', () => {
    it('devrait rejeter un deck sans tableau cards', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'BadDeckPO' }, () => resolve());
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      (client as any).emit('deck:update', { deck: { cards: 'not-array' } });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un deck avec des cartes sans value/label', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'NoValPO' }, () => resolve());
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      (client as any).emit('deck:update', { deck: { cards: [{ foo: 'bar' }] } });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un deck null', async () => {
      const client = createClient();
      await connectClient(client);

      await new Promise<void>((resolve) => {
        client.emit('room:create', { userName: 'NullDeckPO' }, () => resolve());
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      (client as any).emit('deck:update', { deck: null });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });
  });
});
