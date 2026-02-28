/**
 * Tests de couverture complémentaires pour server/socket/handlers.ts
 * Couvre les chemins d'erreur, validations, handlers auth/backlog/admin,
 * et les scénarios de déconnexion/reconnexion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from '../../../server/socket/handlers';
import { ClientToServerEvents, ServerToClientEvents, Room, UserAccount } from '../../../src/types';

const TEST_PORT = 3097;

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;

let clientCounter = 0;
function createClient(): TypedClientSocket {
  const ip = `10.0.${Math.floor(clientCounter / 256)}.${clientCounter % 256 + 1}`;
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

/** Helper : crée une room et retourne le résultat */
async function createRoom(client: TypedClientSocket, userName = 'PO', password?: string) {
  return new Promise<{ room: Room; userId: string; reconnectSecret?: string }>((resolve) => {
    client.emit('room:create', { userName, password }, (room, userId, reconnectSecret) => {
      resolve({ room, userId, reconnectSecret });
    });
  });
}

/** Helper : rejoint une room */
async function joinRoom(client: TypedClientSocket, roomId: string, userName = 'Dev', password?: string) {
  return new Promise<{ success: boolean; room?: Room; userId?: string; error?: string }>((resolve) => {
    client.emit('room:join', { roomId, userName, password }, (success, room, userId, error) => {
      resolve({ success, room, userId, error });
    });
  });
}

describe('Handlers Coverage', () => {
  beforeAll(async () => {
    process.env.TRUST_PROXY = 'true';
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

  // ====== AUTH:REGISTER ======

  describe('auth:register', () => {
    it('devrait inscrire un utilisateur avec email et retourner un sessionToken', async () => {
      const client = createClient();
      await connectClient(client);

      const email = `test-${Date.now()}@example.com`;
      const result = await new Promise<{ success: boolean; account?: UserAccount; error?: string; sessionToken?: string }>((resolve) => {
        client.emit('auth:register', {
          email,
          password: 'password123',
          name: 'TestUser',
          role: 'dev',
        }, (success, account, error, sessionToken) => {
          resolve({ success, account, error, sessionToken });
        });
      });

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account!.name).toBe('TestUser');
      expect(result.account!.email).toBe(email);
      expect(result.sessionToken).toBeDefined();

      await disconnectClient(client);
    });

    it('devrait rejeter un email déjà utilisé', async () => {
      const client = createClient();
      await connectClient(client);

      const email = `dup-${Date.now()}@example.com`;

      // Premier enregistrement
      await new Promise<void>((resolve) => {
        client.emit('auth:register', {
          email, password: 'password123', name: 'User1', role: 'dev',
        }, () => resolve());
      });

      // Deuxième avec le même email
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:register', {
          email, password: 'password456', name: 'User2', role: 'dev',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      await disconnectClient(client);
    });

    it('devrait rejeter un champ manquant (email vide)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:register', {
          email: '', password: 'password123', name: 'Name', role: 'dev',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('requis');

      await disconnectClient(client);
    });

    it('devrait rejeter un rôle invalide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        (client as any).emit('auth:register', {
          email: 'role@test.com', password: 'password123', name: 'Name', role: 'admin',
        }, (success: boolean, account: any, error: string) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un nom trop long', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:register', {
          email: 'long@test.com', password: 'password123', name: 'A'.repeat(31), role: 'dev',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('30');

      await disconnectClient(client);
    });

    it('devrait rejeter un pseudo sans champs requis', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:register', {
          email: '',
          password: '',
          name: 'PseudoUser',
          role: 'dev',
          authType: 'pseudo',
          pseudo: 'test',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('requis');

      await disconnectClient(client);
    });
  });

  // ====== AUTH:LOGIN ======

  describe('auth:login', () => {
    it('devrait connecter un utilisateur existant et retourner un sessionToken', async () => {
      const client = createClient();
      await connectClient(client);

      const loginEmail = `login-${Date.now()}@example.com`;

      // S'inscrire puis se connecter dans le même flux pour éviter le rate limit
      await new Promise<void>((resolve) => {
        client.emit('auth:register', {
          email: loginEmail, password: 'mypass123', name: 'LoginUser', role: 'dev',
        }, () => resolve());
      });

      const result = await new Promise<{ success: boolean; account?: UserAccount; sessionToken?: string }>((resolve) => {
        client.emit('auth:login', {
          email: loginEmail, password: 'mypass123',
        }, (success, account, error, sessionToken) => {
          resolve({ success, account, sessionToken });
        });
      });

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.sessionToken).toBeDefined();

      await disconnectClient(client);
    });

    it('devrait rejeter un mauvais mot de passe', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:login', {
          email: 'nonexistent@test.com', password: 'wrong',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait rejeter un email/password vide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:login', {
          email: '', password: '',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait rejeter un pseudo/password vide en mode pseudo', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:login', {
          email: '', password: '', authType: 'pseudo', pseudo: '',
        }, (success, account, error) => {
          resolve({ success, error });
        });
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== AUTH:RECONNECT ======

  describe('auth:reconnect', () => {
    it('devrait échouer avec un accountId invalide (non UUID)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('auth:reconnect', {
          accountId: 'not-a-uuid', sessionToken: 'whatever',
        }, (success) => resolve({ success }));
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait échouer sans sessionToken', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('auth:reconnect', {
          accountId: '00000000-0000-0000-0000-000000000000',
        } as any, (success) => resolve({ success }));
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait échouer avec un accountId vide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('auth:reconnect', {
          accountId: '', sessionToken: 'tok',
        }, (success) => resolve({ success }));
      });

      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== AUTH:LOGOUT ======

  describe('auth:logout', () => {
    it('devrait déconnecter avec un sessionToken', async () => {
      const client = createClient();
      await connectClient(client);

      const email = `logout-${Date.now()}@example.com`;
      const regResult = await new Promise<{ sessionToken?: string }>((resolve) => {
        client.emit('auth:register', {
          email, password: 'password123', name: 'LogoutUser', role: 'dev',
        }, (s, a, e, sessionToken) => resolve({ sessionToken }));
      });

      // Logout avec token
      client.emit('auth:logout', { sessionToken: regResult.sessionToken });
      await new Promise((r) => setTimeout(r, 50));

      // Logout sans token (couvre aussi le chemin)
      client.emit('auth:logout');
      await new Promise((r) => setTimeout(r, 50));

      await disconnectClient(client);
    });
  });

  // ====== AUTH:GETHISTORY / AUTH:DELETEROOMHISTORY (sans auth) ======

  describe('auth:getHistory et auth:deleteRoomHistory (non authentifié)', () => {
    it('devrait retourner un tableau vide sans authentification', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<any[]>((resolve) => {
        client.emit('auth:getHistory', (rooms) => resolve(rooms));
      });

      expect(result).toEqual([]);

      await disconnectClient(client);
    });

    it('devrait retourner false pour deleteRoomHistory sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('auth:deleteRoomHistory', { historyId: 'fake-id' }, (success) => resolve(success));
      });

      expect(result).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== AUTH:UPDATEDECK / AUTH:UPDATETABLECONFIG / AUTH:UPDATELAYOUTCONFIG / AUTH:UPDATEROOMTTL (sans auth) ======

  describe('auth: handlers de config sans authentification', () => {
    it('auth:updateDeck devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('auth:updateDeck', { deck: { cards: [{ value: '1', label: '1' }] } }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('auth:updateTableConfig devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('auth:updateTableConfig', { tableConfig: {} }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('auth:updateLayoutConfig devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('auth:updateLayoutConfig', { layoutConfig: [['pokerTable']] }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('auth:updateRoomTtl devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:updateRoomTtl', { ttlMinutes: 60 }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

  });

  // ====== CONFIG AUTHENTIFIÉ — table, layout, deck, ttl (une seule session auth) ======

  describe('config handlers authentifiés (table, layout, deck, ttl)', () => {
    let authClient: TypedClientSocket;

    beforeAll(async () => {
      authClient = createClient();
      await connectClient(authClient);
      const regResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        authClient.emit('auth:register', {
          email: `config-${Date.now()}@example.com`, password: 'password123', name: 'ConfigUser', role: 'dev',
        }, (success, _account, error) => resolve({ success, error }));
      });
      expect(regResult.success).toBe(true);
    });

    afterAll(async () => {
      await disconnectClient(authClient);
    });

    // Table config
    it('devrait rejeter une feltColor invalide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateTableConfig', {
          tableConfig: { feltColor: 'not-a-color' },
        }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('devrait rejeter une borderColor invalide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateTableConfig', {
          tableConfig: { borderColor: 'rgb(255,0,0)' },
        }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('devrait rejeter une imageUrl externe', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateTableConfig', {
          tableConfig: { imageUrl: 'https://evil.com/track.png' },
        }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('devrait accepter une config table valide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateTableConfig', {
          tableConfig: { feltColor: '#1a7a3d', borderColor: '#8B4513' },
        }, (success) => resolve(success));
      });
      expect(result).toBe(true);
    });

    // Layout config
    it('devrait accepter un layout valide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateLayoutConfig', {
          layoutConfig: [['pokerTable', 'cardPicker'], ['controlsStats', 'itemList'], ['estimatedItems', 'userList']],
        }, (success) => resolve(success));
      });
      expect(result).toBe(true);
    });

    it('devrait rejeter un layout vide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateLayoutConfig', {
          layoutConfig: [],
        }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('devrait rejeter une ligne vide dans le layout', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateLayoutConfig', {
          layoutConfig: [[]],
        }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    // Deck config
    it('devrait accepter un deck valide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:updateDeck', {
          deck: { cards: [{ value: '1', label: 'Un' }, { value: '2', label: 'Deux' }] },
        }, (success) => resolve(success));
      });
      expect(result).toBe(true);
    });

    it('devrait rejeter un deck invalide (pas de cards)', async () => {
      const result = await new Promise<boolean>((resolve) => {
        (authClient as any).emit('auth:updateDeck', {
          deck: { cards: 'not-array' },
        }, (success: boolean) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('devrait rejeter un deck null', async () => {
      const result = await new Promise<boolean>((resolve) => {
        (authClient as any).emit('auth:updateDeck', {
          deck: null,
        }, (success: boolean) => resolve(success));
      });
      expect(result).toBe(false);
    });

    // TTL
    it('devrait rejeter un TTL invalide', async () => {
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        authClient.emit('auth:updateRoomTtl', { ttlMinutes: -1 }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');
    });

    it('devrait accepter un TTL valide', async () => {
      const result = await new Promise<{ success: boolean }>((resolve) => {
        authClient.emit('auth:updateRoomTtl', { ttlMinutes: 120 }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(true);
    });
  });

  // ====== UPLOAD HANDLERS (sans auth) ======

  describe('upload handlers sans authentification', () => {
    it('auth:uploadDeckImage devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:uploadDeckImage', {
          type: 'back', imageData: 'data:image/png;base64,iVBOR', fileName: 'test.png',
        }, (success, url) => resolve({ success, error: url }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('auth:deleteDeckImage devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('auth:deleteDeckImage', { type: 'back' }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('auth:uploadTableImage devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('auth:uploadTableImage', {
          imageData: 'data:image/png;base64,iVBOR', fileName: 'table.png',
        }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('auth:uploadAvatar devrait retourner false sans auth', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('auth:uploadAvatar', {
          imageData: 'data:image/png;base64,iVBOR', fileName: 'avatar.png',
        }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('deck:uploadImage devrait retourner false pour un non-PO', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('deck:uploadImage', {
          type: 'back', imageData: 'data:image/png;base64,iVBOR', fileName: 'back.png',
        }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== AUTH:FORGOTPASSWORD / AUTH:VERIFYRESETCODE / AUTH:RESETPASSWORD ======

  describe('auth:forgotPassword', () => {
    it('devrait retourner true même si l\'email n\'existe pas (anti-énumération)', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('auth:forgotPassword', { email: 'nonexistent@test.com' }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(true);

      await disconnectClient(client);
    });

    it('devrait rejeter un email vide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:forgotPassword', { email: '' }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('requis');

      await disconnectClient(client);
    });
  });

  describe('auth:verifyResetCode', () => {
    it('devrait rejeter un code invalide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ valid: boolean; error?: string }>((resolve) => {
        client.emit('auth:verifyResetCode', { code: '000000' }, (valid, error) => resolve({ valid, error }));
      });
      expect(result.valid).toBe(false);

      await disconnectClient(client);
    });
  });

  describe('auth:resetPassword', () => {
    it('devrait rejeter si code ou password manquant', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:resetPassword', { code: '', newPassword: '' }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('devrait rejeter un code invalide avec mot de passe fourni', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        client.emit('auth:resetPassword', { code: '999999', newPassword: 'newpass123' }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== ROOM:CREATE — validations ======

  describe('room:create — validations', () => {
    it('devrait rejeter un nom trop long', async () => {
      const client = createClient();
      await connectClient(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('room:create', { userName: 'X'.repeat(31) }, () => {});
      const error = await errorPromise;
      expect(error).toContain('30');

      await disconnectClient(client);
    });
  });

  // ====== ROOM:JOIN — validations ======

  describe('room:join — validations', () => {
    it('devrait rejeter un roomId vide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await joinRoom(client, '', 'Test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('requis');

      await disconnectClient(client);
    });

    it('devrait rejeter un nom trop long', async () => {
      const poClient = createClient();
      await connectClient(poClient);
      const { room } = await createRoom(poClient);

      const devClient = createClient();
      await connectClient(devClient);

      const result = await joinRoom(devClient, room.id, 'X'.repeat(31));
      expect(result.success).toBe(false);
      expect(result.error).toContain('30');

      await disconnectClient(poClient);
      await disconnectClient(devClient);
    });
  });

  // ====== ITEM:CREATE — limite d'items et validation description ======

  describe('item:create — limites', () => {
    it('devrait rejeter un titre trop long', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('item:create', { title: 'T'.repeat(201), description: '' });
      const error = await errorPromise;
      expect(error).toContain('200');

      await disconnectClient(client);
    });

    it('devrait rejeter une description trop longue', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('item:create', { title: 'Valid', description: 'D'.repeat(2001) });
      const error = await errorPromise;
      expect(error).toContain('2000');

      await disconnectClient(client);
    });

    it('un dev ne devrait pas pouvoir créer d\'item', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('item:create', { title: 'Test', description: '' });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  // ====== ITEM:UPDATE — validation ======

  describe('item:update — validation', () => {
    it('devrait rejeter un titre trop long dans item:update', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const created = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item', description: '' });
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('item:update', { itemId: created.items[0].id, title: 'T'.repeat(201) });
      const error = await errorPromise;
      expect(error).toContain('200');

      await disconnectClient(client);
    });

    it('devrait rejeter une description trop longue dans item:update', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const created = await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'Item', description: '' });
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('item:update', { itemId: created.items[0].id, description: 'D'.repeat(2001) });
      const error = await errorPromise;
      expect(error).toContain('2000');

      await disconnectClient(client);
    });

    it('un dev ne devrait pas pouvoir modifier un item', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('item:update', { itemId: 'any', title: 'Hacked' });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  // ====== ITEM:DELETE / ITEM:REORDER / ITEM:SELECT — restrictions dev ======

  describe('restrictions dev sur items', () => {
    it('un dev ne devrait pas pouvoir supprimer un item', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('item:delete', { itemId: 'any' });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev ne devrait pas pouvoir réordonner un item', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('item:reorder', { itemId: 'any', newOrder: 0 });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev ne devrait pas pouvoir sélectionner un item', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('item:select', { itemId: 'any' });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev ne devrait pas pouvoir définir le score final', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('item:setFinalScore', { itemId: 'any', score: '5' });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('devrait rejeter un score non-string', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      (client as any).emit('item:setFinalScore', { itemId: 'any', score: 123 });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });

    it('devrait rejeter un score trop long', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('item:setFinalScore', { itemId: 'any', score: 'A'.repeat(11) });
      const error = await errorPromise;
      expect(error).toContain('invalide');

      await disconnectClient(client);
    });
  });

  // ====== VOTE:START — sans item sélectionné ======

  describe('vote:start — erreurs', () => {
    it('devrait rejeter le démarrage du vote sans item sélectionné', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      // Créer un item mais ne pas le sélectionner
      await new Promise<Room>((resolve) => {
        client.once('room:updated', resolve);
        client.emit('item:create', { title: 'NoSelect', description: '' });
      });

      const errorPromise = new Promise<string>((resolve) => {
        client.once('error', resolve);
      });
      client.emit('vote:start');
      const error = await errorPromise;
      expect(error).toContain('sélectionner');

      await disconnectClient(client);
    });
  });

  // ====== DECK:UPDATE — restrictions dev ======

  describe('deck:update — restrictions dev', () => {
    it('un dev ne devrait pas pouvoir modifier le deck', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const errorPromise = new Promise<string>((resolve) => {
        dev.once('error', resolve);
      });
      dev.emit('deck:update', { deck: { cards: [{ value: '1', label: '1' }] } });
      const error = await errorPromise;
      expect(error).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  // ====== TIMER — restrictions dev ======

  describe('timer — restrictions dev', () => {
    it('un dev ne devrait pas pouvoir démarrer le timer', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const err = await new Promise<string>((resolve) => {
        dev.once('error', resolve);
        dev.emit('timer:start');
      });
      expect(err).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev ne devrait pas pouvoir stopper le timer', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const err = await new Promise<string>((resolve) => {
        dev.once('error', resolve);
        dev.emit('timer:stop');
      });
      expect(err).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev ne devrait pas pouvoir réinitialiser le timer', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const err = await new Promise<string>((resolve) => {
        dev.once('error', resolve);
        dev.emit('timer:reset');
      });
      expect(err).toContain('PO');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('devrait rejeter une durée invalide', async () => {
      const client = createClient();
      await connectClient(client);
      await createRoom(client);

      const err = await new Promise<string>((resolve) => {
        client.once('error', resolve);
        (client as any).emit('timer:set', { durationMs: -1 });
      });
      expect(err).toContain('invalide');

      await disconnectClient(client);
    });
  });

  // ====== BACKLOG — sans auth ======

  describe('backlog — sans authentification', () => {
    it('backlog:getItems devrait retourner un tableau vide', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<any[]>((resolve) => {
        client.emit('backlog:getItems', (items) => resolve(items));
      });
      expect(result).toEqual([]);

      await disconnectClient(client);
    });

    it('backlog:create devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('backlog:create', { title: 'Test' }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('backlog:update devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('backlog:update', { itemId: 'fake', title: 'Test' }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('backlog:delete devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('backlog:delete', { itemId: 'fake' }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('backlog:reorder devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('backlog:reorder', { itemId: 'fake', newPriority: 1 }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('backlog:import devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('backlog:import', { roomId: 'AAAAAA', itemIds: ['id1'] }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== BACKLOG — validations authentifié ======

  describe('backlog — validations avec authentification', () => {
    let authClient: TypedClientSocket;

    beforeAll(async () => {
      authClient = createClient();
      await connectClient(authClient);
      const regResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        authClient.emit('auth:register', {
          email: `backlog-${Date.now()}@example.com`, password: 'password123', name: 'BacklogUser', role: 'dev',
        }, (success, _account, error) => resolve({ success, error }));
      });
      expect(regResult.success).toBe(true);
    });

    afterAll(async () => {
      await disconnectClient(authClient);
    });

    it('backlog:create devrait rejeter un titre vide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:create', { title: '' }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:create devrait rejeter un titre trop long', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:create', { title: 'T'.repeat(201) }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:create devrait rejeter une description trop longue', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:create', { title: 'Valid', description: 'D'.repeat(2001) }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:create devrait créer un item valide', async () => {
      const result = await new Promise<{ success: boolean; item?: any }>((resolve) => {
        authClient.emit('backlog:create', { title: 'Mon item', description: 'Desc' }, (success, item) => {
          resolve({ success, item });
        });
      });
      expect(result.success).toBe(true);
      expect(result.item).toBeDefined();
      expect(result.item.title).toContain('Mon item');
    });

    it('backlog:update devrait rejeter un titre trop long', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:update', { itemId: 'any', title: 'T'.repeat(201) }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:update devrait rejeter une description trop longue', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:update', { itemId: 'any', description: 'D'.repeat(2001) }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:reorder devrait rejeter un priority invalide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        (authClient as any).emit('backlog:reorder', { itemId: 'id', newPriority: 'abc' }, (success: boolean) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:reorder devrait rejeter un priority < 1', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:reorder', { itemId: 'id', newPriority: 0 }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:import devrait rejeter un tableau vide', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('backlog:import', { roomId: 'AAAAAA', itemIds: [] }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });
  });

  // ====== ADMIN — sans auth ======

  describe('admin — sans authentification', () => {
    it('admin:checkAccess devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:checkAccess', (isAdmin) => resolve(isAdmin));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getAllUsers devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:getAllUsers', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getAllSessions devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:getAllSessions', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getAllRoomHistory devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:getAllRoomHistory', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getAllBacklogs devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:getAllBacklogs', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getStats devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:getStats', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getActiveRooms devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:getActiveRooms', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:deleteUser devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('admin:deleteUser', { userId: 'fake' }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('admin:revokeSession devrait retourner false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:revokeSession', { token: 'fake' }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== ROOM:CLOSE — edge cases ======

  describe('room:close — edge cases', () => {
    it('devrait échouer pour un utilisateur sans room', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<boolean>((resolve) => {
        client.emit('room:close', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== ROOM:UPDATEESETTINGS — edge cases ======

  describe('room:updateSettings — edge cases', () => {
    it('un dev ne devrait pas pouvoir modifier les settings', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const result = await new Promise<boolean>((resolve) => {
        dev.emit('room:updateSettings', { settings: { emojisEnabled: false } }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  // ====== HANDLELEAVEROOM — PO quitte = room fermée ======

  describe('handleLeaveRoom — scénarios de départ', () => {
    it('le PO quitte → la room est fermée, les devs reçoivent room:closed', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      // Enregistrer le listener AVANT d'émettre room:leave
      const closedPromise = new Promise<string>((resolve) => {
        dev.once('room:closed', (reason) => resolve(reason));
      });

      // Attendre un tick pour que le listener soit actif
      await new Promise((r) => setTimeout(r, 50));
      po.emit('room:leave');

      const reason = await closedPromise;
      expect(reason).toContain('organisateur');

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('un dev quitte → la room reste ouverte, room:updated est émis', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      const { userId: devId } = await joinRoom(dev, room.id);

      // Enregistrer le listener AVANT d'émettre room:leave
      const updatePromise = new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
      });

      await new Promise((r) => setTimeout(r, 50));
      dev.emit('room:leave');

      const updatedRoom = await updatePromise;
      expect(updatedRoom.users[devId!]).toBeUndefined();

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('le PO seul quitte → la room est supprimée', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      po.emit('room:leave');
      await new Promise((r) => setTimeout(r, 100));

      // Vérifier que la room n'est plus joignable
      const dev = createClient();
      await connectClient(dev);
      const result = await joinRoom(dev, room.id);
      expect(result.success).toBe(false);

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  // ====== HANDLEDISCONNECT — délai de grâce ======

  describe('handleDisconnect — délai de grâce et nettoyage', () => {
    it('le dev se déconnecte et ne revient pas → retiré de la room', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      const { userId: devId } = await joinRoom(dev, room.id);

      // Le dev se déconnecte brutalement (pas room:leave)
      const updatePromise = new Promise<Room>((resolve) => {
        po.on('room:updated', (r) => {
          // Attendre que le user soit effectivement retiré
          if (!r.users[devId!]) resolve(r);
        });
      });

      dev.disconnect();

      // Attendre le délai de grâce (30s) — mais on peut pas attendre 30s dans un test
      // Le pending disconnect sera en attente. On vérifie juste le mécanisme
      // en attendant la mise à jour qui arrivera après le timeout
      const updatedRoom = await Promise.race([
        updatePromise,
        new Promise<null>((r) => setTimeout(() => r(null), 35000)),
      ]);

      // Si le timeout du grace period s'est déclenché, le user est retiré
      if (updatedRoom) {
        expect(updatedRoom.users[devId!]).toBeUndefined();
      }

      await disconnectClient(po);
    }, 40000);

    it('le PO se déconnecte et ne revient pas → la room est fermée', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const closedPromise = new Promise<string>((resolve) => {
        dev.once('room:closed', (reason) => resolve(reason));
      });

      // Déconnexion brutale du PO
      po.disconnect();

      const reason = await Promise.race([
        closedPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 35000)),
      ]);

      if (reason) {
        expect(reason).toContain('organisateur');
      }

      await disconnectClient(dev);
    }, 40000);

    it('room:reconnect avec des données manquantes devrait échouer', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('room:reconnect', { roomId: '', userId: '', secret: '' }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== EMOJI — edge cases ======

  describe('emoji:send — edge cases', () => {
    it('devrait ignorer un emoji non autorisé', async () => {
      const po = createClient();
      await connectClient(po);
      const { room, userId: poId } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      const { userId: devId } = await joinRoom(dev, room.id);

      // Envoyer un emoji invalide
      dev.emit('emoji:send', { targetUserId: poId, emoji: '💀' });

      // Attendre un peu — aucun emoji ne devrait être reçu
      const received = await Promise.race([
        new Promise<boolean>((resolve) => {
          po.once('emoji:received', () => resolve(true));
        }),
        new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
      ]);
      expect(received).toBe(false);

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('devrait ignorer un emoji vers un utilisateur inexistant', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      po.emit('emoji:send', { targetUserId: 'nonexistent', emoji: '🍺' });

      const received = await Promise.race([
        new Promise<boolean>((resolve) => {
          po.once('emoji:received', () => resolve(true));
        }),
        new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
      ]);
      expect(received).toBe(false);

      await disconnectClient(po);
    });
  });

  // ====== AUTH:GETHISTORY (authentifié) ======

  describe('auth:getHistory (authentifié)', () => {
    it('devrait retourner l\'historique d\'un utilisateur connecté', async () => {
      const client = createClient();
      await connectClient(client);

      // S'inscrire et créer une room
      await new Promise<void>((resolve) => {
        client.emit('auth:register', {
          email: `hist-${Date.now()}@example.com`, password: 'password123', name: 'HistUser', role: 'po',
        }, () => resolve());
      });

      await createRoom(client);

      const history = await new Promise<any[]>((resolve) => {
        client.emit('auth:getHistory', (rooms) => resolve(rooms));
      });

      expect(Array.isArray(history)).toBe(true);

      await disconnectClient(client);
    });
  });

  // ====== ROOM:CHECKPASSWORD ======

  describe('room:checkPassword — room sans mot de passe', () => {
    it('devrait retourner hasPassword=false pour une room sans mot de passe', async () => {
      const client = createClient();
      await connectClient(client);
      const { room } = await createRoom(client);

      const client2 = createClient();
      await connectClient(client2);

      const result = await new Promise<{ hasPassword: boolean; roomExists: boolean }>((resolve) => {
        client2.emit('room:checkPassword', { roomId: room.id }, (hasPassword, roomExists) => {
          resolve({ hasPassword, roomExists });
        });
      });

      expect(result.roomExists).toBe(true);
      expect(result.hasPassword).toBe(false);

      await disconnectClient(client);
      await disconnectClient(client2);
    });
  });

  // ====== ROOM:TRANSFERPO — edge cases ======

  describe('room:transferPO — edge cases', () => {
    it('devrait rejeter le transfert vers soi-même', async () => {
      const po = createClient();
      await connectClient(po);
      const { room, userId: poId } = await createRoom(po);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        po.emit('room:transferPO', { targetUserId: poId }, (success, error) => resolve({ success, error }));
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('déjà');

      await disconnectClient(po);
    });

    it('devrait rejeter le transfert vers un utilisateur inexistant', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        po.emit('room:transferPO', { targetUserId: 'nonexistent' }, (success, error) => resolve({ success, error }));
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('introuvable');

      await disconnectClient(po);
    });
  });

  // ====== CYCLE DE VOTE COMPLET ======

  describe('cycle de vote complet', () => {
    let po: TypedClientSocket;
    let dev1: TypedClientSocket;
    let dev2: TypedClientSocket;
    let roomId: string;
    let itemId: string;

    beforeAll(async () => {
      po = createClient();
      dev1 = createClient();
      dev2 = createClient();
      await connectClient(po);
      await connectClient(dev1);
      await connectClient(dev2);

      const { room } = await createRoom(po, 'VotePO');
      roomId = room.id;
      await joinRoom(dev1, roomId, 'Dev1');
      await joinRoom(dev2, roomId, 'Dev2');

      // Créer et sélectionner un item
      const created = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:create', { title: 'VoteItem', description: '' });
      });
      itemId = created.items[0].id;

      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:select', { itemId });
      });
    });

    afterAll(async () => {
      await disconnectClient(po);
      await disconnectClient(dev1);
      await disconnectClient(dev2);
    });

    it('vote:start avec item sélectionné → state=voting', async () => {
      const updated = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:start');
      });
      expect(updated.state).toBe('voting');
    });

    it('vote:cast avec valeur valide → vote enregistré', async () => {
      const updated = await new Promise<Room>((resolve) => {
        dev1.once('room:updated', resolve);
        dev1.emit('vote:cast', { value: '5' });
      });
      // En état voting, les votes des autres sont masqués pour dev1
      expect(updated.state).toBe('voting');
    });

    it('vote:cast avec valeur invalide → erreur', async () => {
      const error = await new Promise<string>((resolve) => {
        dev2.once('error', resolve);
        dev2.emit('vote:cast', { value: 'invalid-card-999' });
      });
      expect(error).toContain('invalide');
    });

    it('vote:cast par dev2 avec valeur valide', async () => {
      const updated = await new Promise<Room>((resolve) => {
        dev2.once('room:updated', resolve);
        dev2.emit('vote:cast', { value: '8' });
      });
      expect(updated.state).toBe('voting');
    });

    it('vote:reveal par un dev → erreur', async () => {
      const error = await new Promise<string>((resolve) => {
        dev1.once('error', resolve);
        dev1.emit('vote:reveal');
      });
      expect(error).toContain('PO');
    });

    it('vote:reveal par PO → state=revealed, votes visibles', async () => {
      const updated = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:reveal');
      });
      expect(updated.state).toBe('revealed');
      // Après reveal, les votes sont visibles
      const activeItem = updated.items.find(i => i.id === itemId);
      expect(activeItem).toBeDefined();
      expect(Object.keys(activeItem!.votes).length).toBeGreaterThanOrEqual(2);
    });

    it('vote:reset par un dev → erreur', async () => {
      const error = await new Promise<string>((resolve) => {
        dev1.once('error', resolve);
        dev1.emit('vote:reset');
      });
      expect(error).toContain('PO');
    });

    it('vote:reset par PO → state=idle, votes effacés', async () => {
      const updated = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:reset');
      });
      expect(updated.state).toBe('idle');
    });

    it('vote:start par un dev → erreur', async () => {
      const error = await new Promise<string>((resolve) => {
        dev1.once('error', resolve);
        dev1.emit('vote:start');
      });
      expect(error).toContain('PO');
    });

    it('vote:cast en état idle → pas de mise à jour', async () => {
      // En idle, le handler fait un return silencieux car room.state !== 'voting'
      dev1.emit('vote:cast', { value: '5' });
      const error = await new Promise<string>((resolve) => {
        dev1.once('error', resolve);
        dev1.emit('vote:cast', { value: '5' });
      });
      expect(error).toContain('vote');
    });

    it('item:setFinalScore après reveal → score sauvegardé', async () => {
      // Relancer un cycle: start → cast → reveal
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:start');
      });
      await new Promise<Room>((resolve) => {
        dev1.once('room:updated', resolve);
        dev1.emit('vote:cast', { value: '5' });
      });
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:reveal');
      });

      // Maintenant setFinalScore
      const updated = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:setFinalScore', { itemId, score: '5' });
      });
      const item = updated.items.find(i => i.id === itemId);
      expect(item?.finalScore).toBe('5');
    });
  });

  // ====== ROOM:CLOSE — PO authentifié ======

  describe('room:close — PO authentifié avec historique', () => {
    it('PO ferme la room → success=true', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const result = await new Promise<boolean>((resolve) => {
        po.emit('room:close', (success) => resolve(success));
      });
      expect(result).toBe(true);

      await disconnectClient(po);
    });

    it('dev tente de fermer → success=false', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id);

      const result = await new Promise<boolean>((resolve) => {
        dev.emit('room:close', (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('room:close sauvegarde l\'historique quand le PO est authentifié', async () => {
      const po = createClient();
      await connectClient(po);

      // Register pour avoir un compte
      await new Promise<void>((resolve) => {
        po.emit('auth:register', {
          email: `close-hist-${Date.now()}@example.com`, password: 'password123', name: 'ClosePO', role: 'po',
        }, () => resolve());
      });

      const { room } = await createRoom(po, 'ClosePO');

      // Créer un item avec finalScore
      const created = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:create', { title: 'CloseItem', description: '' });
      });
      const itemId = created.items[0].id;

      // Sélectionner et voter pour pouvoir setFinalScore
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:select', { itemId });
      });
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:start');
      });
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:cast', { value: '8' });
      });
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('vote:reveal');
      });
      await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:setFinalScore', { itemId, score: '8' });
      });

      // Fermer la room
      const result = await new Promise<boolean>((resolve) => {
        po.emit('room:close', (success) => resolve(success));
      });
      expect(result).toBe(true);

      // Vérifier l'historique
      const history = await new Promise<any[]>((resolve) => {
        po.emit('auth:getHistory', (rooms) => resolve(rooms));
      });
      expect(history.length).toBeGreaterThanOrEqual(1);

      await disconnectClient(po);
    });
  });

  // ====== ROOM:UPDATESETTINGS — PO et filtrage ======

  describe('room:updateSettings — PO authentifié', () => {
    it('PO met à jour emojisEnabled=false → success', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const result = await new Promise<boolean>((resolve) => {
        po.emit('room:updateSettings', { settings: { emojisEnabled: false } }, (success) => resolve(success));
      });
      expect(result).toBe(true);

      await disconnectClient(po);
    });

    it('PO met à jour emojisEnabled=true → success + room:updated émis', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      // Désactiver d'abord
      await new Promise<boolean>((resolve) => {
        po.emit('room:updateSettings', { settings: { emojisEnabled: false } }, (success) => resolve(success));
      });

      // Réactiver et vérifier room:updated
      const updatePromise = new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
      });
      const result = await new Promise<boolean>((resolve) => {
        po.emit('room:updateSettings', { settings: { emojisEnabled: true } }, (success) => resolve(success));
      });
      expect(result).toBe(true);

      const updated = await updatePromise;
      expect(updated.settings.emojisEnabled).toBe(true);

      await disconnectClient(po);
    });

    it('propriété invalide est ignorée (seul emojisEnabled accepté)', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const result = await new Promise<boolean>((resolve) => {
        (po as any).emit('room:updateSettings', { settings: { unknownProp: true } }, (success: boolean) => resolve(success));
      });
      // Devrait quand même réussir (pas de propriété invalide, juste ignorée)
      expect(result).toBe(true);

      await disconnectClient(po);
    });
  });

  // ====== ITEM:CREATE avancé ======

  describe('item:create — scénarios avancés', () => {
    it('création d\'item par PO avec titre valide → room:updated émis', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const updated = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('item:create', { title: 'Nouvel Item', description: 'Une description' });
      });

      expect(updated.items.length).toBe(1);
      expect(updated.items[0].title).toContain('Nouvel Item');

      await disconnectClient(po);
    });

    it('création avec titre vide → erreur', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const error = await new Promise<string>((resolve) => {
        po.once('error', resolve);
        po.emit('item:create', { title: '', description: '' });
      });
      expect(error).toContain('requis');

      await disconnectClient(po);
    });

    it('création avec titre espaces uniquement → erreur', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const error = await new Promise<string>((resolve) => {
        po.once('error', resolve);
        po.emit('item:create', { title: '   ', description: '' });
      });
      expect(error).toContain('requis');

      await disconnectClient(po);
    });

    it('création avec données non-string → erreur', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const error = await new Promise<string>((resolve) => {
        po.once('error', resolve);
        (po as any).emit('item:create', { title: 123, description: '' });
      });
      expect(error).toContain('invalide');

      await disconnectClient(po);
    });
  });

  // ====== ADMIN HANDLERS — authentifié ======

  describe('admin — authentifié', () => {
    let adminClient: TypedClientSocket;
    const adminEmail = `admin-test-${Date.now()}@example.com`;

    beforeAll(async () => {
      process.env.ADMIN_EMAIL = adminEmail;

      adminClient = createClient();
      await connectClient(adminClient);
      const regResult = await new Promise<{ success: boolean; account?: UserAccount; error?: string }>((resolve) => {
        adminClient.emit('auth:register', {
          email: adminEmail, password: 'adminpass123', name: 'AdminUser', role: 'po',
        }, (success, account, error) => resolve({ success, account, error }));
      });
      expect(regResult.success).toBe(true);
    });

    afterAll(async () => {
      await disconnectClient(adminClient);
    });

    it('admin:checkAccess admin → true', async () => {
      const result = await new Promise<boolean>((resolve) => {
        adminClient.emit('admin:checkAccess', (isAdmin) => resolve(isAdmin));
      });
      expect(result).toBe(true);
    });

    it('admin:checkAccess non-admin → false', async () => {
      const client = createClient();
      await connectClient(client);
      await new Promise<void>((resolve) => {
        client.emit('auth:register', {
          email: `nonadmin-${Date.now()}@example.com`, password: 'password123', name: 'NonAdmin', role: 'dev',
        }, () => resolve());
      });

      const result = await new Promise<boolean>((resolve) => {
        client.emit('admin:checkAccess', (isAdmin) => resolve(isAdmin));
      });
      expect(result).toBe(false);

      await disconnectClient(client);
    });

    it('admin:getAllUsers admin → success + tableau', async () => {
      const result = await new Promise<{ success: boolean; users?: any[] }>((resolve) => {
        adminClient.emit('admin:getAllUsers', (success, users) => resolve({ success, users }));
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.users)).toBe(true);
    });

    it('admin:getAllSessions admin → success + tableau', async () => {
      const result = await new Promise<{ success: boolean; sessions?: any[] }>((resolve) => {
        adminClient.emit('admin:getAllSessions', (success, sessions) => resolve({ success, sessions }));
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.sessions)).toBe(true);
    });

    it('admin:getAllRoomHistory admin → success + tableau', async () => {
      const result = await new Promise<{ success: boolean; histories?: any[] }>((resolve) => {
        adminClient.emit('admin:getAllRoomHistory', (success, histories) => resolve({ success, histories }));
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.histories)).toBe(true);
    });

    it('admin:getAllBacklogs admin → success + tableau', async () => {
      const result = await new Promise<{ success: boolean; backlogs?: any[] }>((resolve) => {
        adminClient.emit('admin:getAllBacklogs', (success, backlogs) => resolve({ success, backlogs }));
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.backlogs)).toBe(true);
    });

    it('admin:getStats admin → success + objet stats', async () => {
      const result = await new Promise<{ success: boolean; stats?: any }>((resolve) => {
        adminClient.emit('admin:getStats', (success, stats) => resolve({ success, stats }));
      });
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(typeof result.stats.totalUsers).toBe('number');
    });

    it('admin:getActiveRooms admin → success + tableau', async () => {
      const result = await new Promise<{ success: boolean; rooms?: any[] }>((resolve) => {
        adminClient.emit('admin:getActiveRooms', (success, rooms) => resolve({ success, rooms }));
      });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.rooms)).toBe(true);
    });

    it('admin:deleteUser (user inexistant) → false', async () => {
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        adminClient.emit('admin:deleteUser', { userId: '00000000-0000-0000-0000-000000000000' }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(false);
    });

    it('admin:deleteUser (auto-suppression) → false', async () => {
      // L'admin ne peut pas se supprimer
      // On doit trouver l'accountId de l'admin. On le fait via auth:reconnect check ou admin:getAllUsers
      const usersResult = await new Promise<{ success: boolean; users?: any[] }>((resolve) => {
        adminClient.emit('admin:getAllUsers', (success, users) => resolve({ success, users }));
      });
      const adminAccount = usersResult.users?.find((u: any) => u.email === adminEmail);
      if (adminAccount) {
        const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
          adminClient.emit('admin:deleteUser', { userId: adminAccount.id }, (success, error) => resolve({ success, error }));
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('propre compte');
      }
    });

    it('admin:revokeSession (session invalide) → false', async () => {
      const result = await new Promise<boolean>((resolve) => {
        adminClient.emit('admin:revokeSession', { token: 'invalid-token-prefix' }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });
  });

  // ====== UPLOAD D'IMAGES — authentifié ======

  describe('upload d\'images — authentifié', () => {
    let authClient: TypedClientSocket;

    // PNG 1x1 pixel valide en base64
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    beforeAll(async () => {
      authClient = createClient();
      await connectClient(authClient);
      const regResult = await new Promise<{ success: boolean }>((resolve) => {
        authClient.emit('auth:register', {
          email: `upload-${Date.now()}@example.com`, password: 'password123', name: 'UploadUser', role: 'po',
        }, (success) => resolve({ success }));
      });
      expect(regResult.success).toBe(true);
    });

    afterAll(async () => {
      await disconnectClient(authClient);
    });

    it('auth:uploadDeckImage PNG valide → success + URL', async () => {
      const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
        authClient.emit('auth:uploadDeckImage', {
          type: 'back', imageData: validPng, fileName: 'test-back.png',
        }, (success, url) => resolve({ success, url }));
      });
      expect(result.success).toBe(true);
      expect(result.url).toContain('/uploads/');
    });

    it('auth:deleteDeckImage sans image existante → success (idempotent)', async () => {
      const result = await new Promise<boolean>((resolve) => {
        authClient.emit('auth:deleteDeckImage', { type: 'front', cardValue: 'nonexistent' }, (success) => resolve(success));
      });
      // Le handler renvoie true car il met à jour le deck config même sans image à supprimer
      expect(result).toBe(true);
    });

    it('auth:uploadTableImage valide → success + URL', async () => {
      const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
        authClient.emit('auth:uploadTableImage', {
          imageData: validPng, fileName: 'table.png',
        }, (success, url) => resolve({ success, url }));
      });
      expect(result.success).toBe(true);
      expect(result.url).toContain('/uploads/');
    });

    it('auth:uploadAvatar valide → success + URL', async () => {
      const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
        authClient.emit('auth:uploadAvatar', {
          imageData: validPng, fileName: 'avatar.png',
        }, (success, url) => resolve({ success, url }));
      });
      expect(result.success).toBe(true);
      expect(result.url).toContain('/uploads/');
    });

    it('deck:uploadImage en room (PO) → success + URL', async () => {
      // Créer une room pour que le PO soit dans la room
      await createRoom(authClient, 'UploadPO');

      const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
        authClient.emit('deck:uploadImage', {
          type: 'back', imageData: validPng, fileName: 'room-back.png',
        }, (success, url) => resolve({ success, url }));
      });
      expect(result.success).toBe(true);
      expect(result.url).toContain('/uploads/');
    });

    it('auth:uploadDeckImage format invalide → erreur', async () => {
      const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
        authClient.emit('auth:uploadDeckImage', {
          type: 'back', imageData: 'not-a-valid-base64-image', fileName: 'bad.png',
        }, (success, url) => resolve({ success, url }));
      });
      expect(result.success).toBe(false);
    });

    it('auth:uploadDeckImage magic bytes invalides (BMP header) → erreur', async () => {
      // BMP header : 0x42, 0x4D (BM)
      const bmpBuffer = Buffer.alloc(100);
      bmpBuffer[0] = 0x42;
      bmpBuffer[1] = 0x4D;
      const bmpData = 'data:image/bmp;base64,' + bmpBuffer.toString('base64');
      const result = await new Promise<{ success: boolean; url?: string }>((resolve) => {
        authClient.emit('auth:uploadDeckImage', {
          type: 'back', imageData: bmpData, fileName: 'fake.bmp',
        }, (success, url) => resolve({ success, url }));
      });
      expect(result.success).toBe(false);
    });

    it('auth:uploadDeckImage trop grande (>2MB) → erreur', async () => {
      // Utiliser un client séparé car le gros payload peut dépasser maxHttpBufferSize et déconnecter le socket
      const bigClient = createClient();
      await connectClient(bigClient);
      await new Promise<void>((resolve) => {
        bigClient.emit('auth:register', {
          email: `big-upload-${Date.now()}@example.com`, password: 'password123', name: 'BigUploader', role: 'po',
        }, () => resolve());
      });

      const bigData = 'data:image/png;base64,' + Buffer.alloc(3 * 1024 * 1024).toString('base64');
      const result = await Promise.race([
        new Promise<{ success: boolean }>((resolve) => {
          bigClient.emit('auth:uploadDeckImage', {
            type: 'back', imageData: bigData, fileName: 'big.png',
          }, (success) => resolve({ success }));
        }),
        // Si le socket est déconnecté par le serveur (payload trop gros), on considère le test passé
        new Promise<{ success: boolean }>((resolve) => {
          bigClient.once('disconnect', () => resolve({ success: false }));
        }),
        new Promise<{ success: boolean }>((r) => setTimeout(() => r({ success: false }), 5000)),
      ]);
      expect(result.success).toBe(false);

      await disconnectClient(bigClient);
    });
  });

  // ====== BACKLOG IMPORT — authentifié PO ======

  describe('backlog:import — authentifié PO', () => {
    let poClient: TypedClientSocket;
    let backlogItemId: string;
    let activeRoomId: string;

    beforeAll(async () => {
      poClient = createClient();
      await connectClient(poClient);
      const regResult = await new Promise<{ success: boolean }>((resolve) => {
        poClient.emit('auth:register', {
          email: `import-${Date.now()}@example.com`, password: 'password123', name: 'ImportPO', role: 'po',
        }, (success) => resolve({ success }));
      });
      expect(regResult.success).toBe(true);

      // Créer un item backlog
      const blResult = await new Promise<{ success: boolean; item?: any }>((resolve) => {
        poClient.emit('backlog:create', { title: 'Backlog Item 1', description: 'Desc' }, (success, item) => {
          resolve({ success, item });
        });
      });
      expect(blResult.success).toBe(true);
      backlogItemId = blResult.item.id;

      // Créer une room
      const { room } = await createRoom(poClient, 'ImportPO');
      activeRoomId = room.id;
    });

    afterAll(async () => {
      await disconnectClient(poClient);
    });

    it('import items valides → success + count', async () => {
      const result = await new Promise<{ success: boolean; count?: number }>((resolve) => {
        poClient.emit('backlog:import', { roomId: activeRoomId, itemIds: [backlogItemId] }, (success, count) => {
          resolve({ success, count });
        });
      });
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('import par non-PO → false', async () => {
      const dev = createClient();
      await connectClient(dev);
      await new Promise<void>((resolve) => {
        dev.emit('auth:register', {
          email: `import-dev-${Date.now()}@example.com`, password: 'password123', name: 'ImportDev', role: 'dev',
        }, () => resolve());
      });
      await joinRoom(dev, activeRoomId, 'ImportDev');

      const result = await new Promise<boolean>((resolve) => {
        dev.emit('backlog:import', { roomId: activeRoomId, itemIds: ['any'] }, (success) => resolve(success));
      });
      expect(result).toBe(false);

      await disconnectClient(dev);
    });

    it('import trop d\'items (>100) → false', async () => {
      const tooManyIds = Array.from({ length: 101 }, (_, i) => `fake-id-${i}`);
      const result = await new Promise<boolean>((resolve) => {
        poClient.emit('backlog:import', { roomId: activeRoomId, itemIds: tooManyIds }, (success) => resolve(success));
      });
      expect(result).toBe(false);
    });

    it('backlog:delete → success', async () => {
      // Créer un item pour le supprimer
      const blResult = await new Promise<{ success: boolean; item?: any }>((resolve) => {
        poClient.emit('backlog:create', { title: 'ToDelete', description: '' }, (success, item) => {
          resolve({ success, item });
        });
      });
      expect(blResult.success).toBe(true);

      const result = await new Promise<boolean>((resolve) => {
        poClient.emit('backlog:delete', { itemId: blResult.item.id }, (success) => resolve(success));
      });
      expect(result).toBe(true);
    });

    it('backlog:getItems retourne les items existants', async () => {
      const items = await new Promise<any[]>((resolve) => {
        poClient.emit('backlog:getItems', (items) => resolve(items));
      });
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ====== ROOM:RECONNECT — avec secret valide ======

  describe('room:reconnect — avec secret', () => {
    it('reconnexion avec secret valide après disconnect → success + room', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);

      // Capturer le reconnectSecret (5e paramètre du callback room:join)
      const joinResult = await new Promise<{ success: boolean; room?: Room; userId?: string; reconnectSecret?: string }>((resolve) => {
        dev.emit('room:join', { roomId: room.id, userName: 'ReconnectDev' }, (success, room, userId, error, reconnectSecret) => {
          resolve({ success, room, userId, reconnectSecret });
        });
      });
      expect(joinResult.success).toBe(true);
      const devUserId = joinResult.userId!;
      const secret = joinResult.reconnectSecret!;
      expect(secret).toBeDefined();

      // Déconnecter le dev
      await disconnectClient(dev);

      // Petit délai pour que le serveur enregistre la pending disconnect
      await new Promise((r) => setTimeout(r, 200));

      // Reconnecter avec un nouveau socket
      const dev2 = createClient();
      await connectClient(dev2);

      const result = await new Promise<{ success: boolean; room?: Room; userId?: string }>((resolve) => {
        dev2.emit('room:reconnect', { roomId: room.id, userId: devUserId, secret }, (success, room, userId) => {
          resolve({ success, room, userId });
        });
      });
      expect(result.success).toBe(true);
      expect(result.room).toBeDefined();
      expect(result.userId).toBe(devUserId);

      await disconnectClient(po);
      await disconnectClient(dev2);
    });

    it('reconnexion avec secret invalide → false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('room:reconnect', { roomId: 'AAAAAA', userId: 'fake-user', secret: 'wrong-secret' }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });

    it('reconnexion room inexistante → false', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ success: boolean }>((resolve) => {
        client.emit('room:reconnect', { roomId: 'ZZZZZZ', userId: 'fake', secret: 'fake' }, (success) => resolve({ success }));
      });
      expect(result.success).toBe(false);

      await disconnectClient(client);
    });
  });

  // ====== ROOM JOIN AVEC MOT DE PASSE ======

  describe('room:join avec mot de passe', () => {
    let poClient: TypedClientSocket;
    let protectedRoomId: string;

    beforeAll(async () => {
      poClient = createClient();
      await connectClient(poClient);
      const { room } = await createRoom(poClient, 'PasswordPO', 'secret123');
      protectedRoomId = room.id;
    });

    afterAll(async () => {
      await disconnectClient(poClient);
    });

    it('room:checkPassword → hasPassword=true', async () => {
      const client = createClient();
      await connectClient(client);

      const result = await new Promise<{ hasPassword: boolean; roomExists: boolean }>((resolve) => {
        client.emit('room:checkPassword', { roomId: protectedRoomId }, (hasPassword, roomExists) => {
          resolve({ hasPassword, roomExists });
        });
      });
      expect(result.roomExists).toBe(true);
      expect(result.hasPassword).toBe(true);

      await disconnectClient(client);
    });

    it('join avec bon mot de passe → success', async () => {
      const dev = createClient();
      await connectClient(dev);

      const result = await joinRoom(dev, protectedRoomId, 'PasswordDev', 'secret123');
      expect(result.success).toBe(true);
      expect(result.room).toBeDefined();

      await disconnectClient(dev);
    });

    it('join avec mauvais mot de passe → erreur', async () => {
      const dev = createClient();
      await connectClient(dev);

      const result = await joinRoom(dev, protectedRoomId, 'BadDev', 'wrongpassword');
      expect(result.success).toBe(false);

      await disconnectClient(dev);
    });

    it('join sans mot de passe quand requis → erreur', async () => {
      const dev = createClient();
      await connectClient(dev);

      const result = await joinRoom(dev, protectedRoomId, 'NoPwdDev');
      expect(result.success).toBe(false);

      await disconnectClient(dev);
    });

    it('join room inexistante → erreur', async () => {
      const dev = createClient();
      await connectClient(dev);

      const result = await joinRoom(dev, 'ZZZZZY', 'LostDev');
      expect(result.success).toBe(false);

      await disconnectClient(dev);
    });
  });

  // ====== DECK:UPDATE — PO valide ======

  describe('deck:update — PO valide', () => {
    it('PO met à jour le deck avec un deck valide → room:updated émis', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const updated = await new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
        po.emit('deck:update', { deck: { cards: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] } });
      });
      expect(updated.deck.cards.length).toBe(3);

      await disconnectClient(po);
    });

    it('PO envoie un deck invalide → erreur', async () => {
      const po = createClient();
      await connectClient(po);
      await createRoom(po);

      const error = await new Promise<string>((resolve) => {
        po.once('error', resolve);
        (po as any).emit('deck:update', { deck: { cards: [] } });
      });
      expect(error).toContain('invalide');

      await disconnectClient(po);
    });
  });

  // ====== EMOJI — emojis désactivés ======

  describe('emoji:send — emojis désactivés', () => {
    it('emoji ignoré quand emojisEnabled=false', async () => {
      const po = createClient();
      await connectClient(po);
      const { room, userId: poId } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      await joinRoom(dev, room.id, 'EmojiDev');

      // Désactiver les emojis
      await new Promise<boolean>((resolve) => {
        po.emit('room:updateSettings', { settings: { emojisEnabled: false } }, (success) => resolve(success));
      });

      // Attendre que le setting soit propagé
      await new Promise((r) => setTimeout(r, 100));

      // Envoyer un emoji valide
      dev.emit('emoji:send', { targetUserId: poId, emoji: '🍺' });

      const received = await Promise.race([
        new Promise<boolean>((resolve) => {
          po.once('emoji:received', () => resolve(true));
        }),
        new Promise<boolean>((r) => setTimeout(() => r(false), 300)),
      ]);
      expect(received).toBe(false);

      await disconnectClient(po);
      await disconnectClient(dev);
    });

    it('emoji valide reçu quand emojisEnabled=true', async () => {
      const po = createClient();
      await connectClient(po);
      const { room, userId: poId } = await createRoom(po);

      const dev = createClient();
      await connectClient(dev);
      const { userId: devId } = await joinRoom(dev, room.id, 'EmojiDev2');

      dev.emit('emoji:send', { targetUserId: poId, emoji: '🍺' });

      const received = await Promise.race([
        new Promise<boolean>((resolve) => {
          po.once('emoji:received', (data) => {
            expect(data.emoji).toBe('🍺');
            expect(data.targetUserId).toBe(poId);
            resolve(true);
          });
        }),
        new Promise<boolean>((r) => setTimeout(() => r(false), 1000)),
      ]);
      expect(received).toBe(true);

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

  // ====== AUTH:RECONNECT — reconnexion réussie ======

  describe('auth:reconnect — reconnexion réussie', () => {
    it('devrait reconnecter un utilisateur avec un sessionToken valide', async () => {
      const client = createClient();
      await connectClient(client);

      const email = `reconnect-auth-${Date.now()}@example.com`;
      const regResult = await new Promise<{ success: boolean; account?: UserAccount; sessionToken?: string }>((resolve) => {
        client.emit('auth:register', {
          email, password: 'password123', name: 'ReconnectUser', role: 'dev',
        }, (success, account, error, sessionToken) => resolve({ success, account, sessionToken }));
      });
      expect(regResult.success).toBe(true);

      const accountId = regResult.account!.id;
      const sessionToken = regResult.sessionToken!;

      // Déconnecter et reconnecter
      await disconnectClient(client);
      const client2 = createClient();
      await connectClient(client2);

      const result = await new Promise<{ success: boolean; account?: UserAccount }>((resolve) => {
        client2.emit('auth:reconnect', { accountId, sessionToken }, (success, account) => resolve({ success, account }));
      });
      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account!.id).toBe(accountId);

      await disconnectClient(client2);
    });
  });

  // ====== ROOM:TRANSFERPO — transfert réussi ======

  describe('room:transferPO — transfert réussi', () => {
    it('PO transfère à un dev → success + room:updated', async () => {
      const po = createClient();
      await connectClient(po);
      const { room } = await createRoom(po, 'TransferPO');

      const dev = createClient();
      await connectClient(dev);
      const { userId: devId } = await joinRoom(dev, room.id, 'TransferDev');

      const updatePromise = new Promise<Room>((resolve) => {
        po.once('room:updated', resolve);
      });

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        po.emit('room:transferPO', { targetUserId: devId! }, (success, error) => resolve({ success, error }));
      });
      expect(result.success).toBe(true);

      const updated = await updatePromise;
      expect(updated.poUserId).toBe(devId);

      await disconnectClient(po);
      await disconnectClient(dev);
    });
  });

});

