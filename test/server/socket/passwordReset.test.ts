/**
 * Tests du flux « mot de passe oublié » (forgotPassword / verifyResetCode / resetPassword).
 * Fichier dédié car il mocke le mailer (SMTP non configuré en test).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';

vi.mock('../../../server/utils/mailer', () => ({
  isMailerConfigured: vi.fn(() => true),
  sendPasswordResetEmail: vi.fn(async () => ({ success: true })),
}));

import { setupSocketHandlers } from '../../../server/socket/handlers';
import * as userStore from '../../../server/store/userStore';
import { isMailerConfigured, sendPasswordResetEmail } from '../../../server/utils/mailer';
import { ClientToServerEvents, ServerToClientEvents, RoomHistory } from '../../../src/types';

const TEST_PORT = 3095;
const NEW_PASSWORD = 'nouveau-mdp-123';

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;
let originalTrustProxy: string | undefined;

let clientCounter = 0;
function createClient(): TypedClientSocket {
  const ip = `10.95.${Math.floor(clientCounter / 256)}.${(clientCounter % 256) + 1}`;
  clientCounter++;
  return ioc(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    autoConnect: false,
    extraHeaders: { 'x-forwarded-for': ip },
  }) as TypedClientSocket;
}

async function connected(): Promise<TypedClientSocket> {
  const client = createClient();
  await new Promise<void>((resolve) => {
    client.on('connect', resolve);
    client.connect();
  });
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

const uniqueEmail = () => `reset-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

/** Inscrit un compte via un socket dédié et le garde connecté (authentifié côté serveur) */
async function registerUser(email = uniqueEmail(), password = 'ancien-mdp-123') {
  const client = await connected();
  const result = await new Promise<{ userId: string; sessionToken: string }>((resolve, reject) => {
    client.emit('auth:register', { email, password, name: 'Reset User', role: 'dev' }, (success, account, error, sessionToken) => {
      if (success && account && sessionToken) resolve({ userId: account.id, sessionToken });
      else reject(new Error(error ?? 'register failed'));
    });
  });
  return { client, email, password, ...result };
}

function forgot(client: TypedClientSocket, email: string) {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    client.emit('auth:forgotPassword', { email }, (success, error) => resolve({ success, error }));
  });
}

function verify(client: TypedClientSocket, email: string, code: string) {
  return new Promise<{ valid: boolean; error?: string }>((resolve) => {
    client.emit('auth:verifyResetCode', { email, code }, (valid, error) => resolve({ valid, error }));
  });
}

function reset(client: TypedClientSocket, email: string, code: string, newPassword: string) {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    client.emit('auth:resetPassword', { email, code, newPassword }, (success, error) => resolve({ success, error }));
  });
}

function login(client: TypedClientSocket, email: string, password: string) {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    client.emit('auth:login', { email, password }, (success, _account, error) => resolve({ success, error }));
  });
}

function getHistory(client: TypedClientSocket) {
  return new Promise<RoomHistory[]>((resolve) => {
    client.emit('auth:getHistory', (rooms) => resolve(rooms));
  });
}

describe('Mot de passe oublié', () => {
  beforeAll(async () => {
    originalTrustProxy = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
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
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    vi.mocked(sendPasswordResetEmail).mockReset();
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ success: true });
    vi.mocked(isMailerConfigured).mockReset();
    vi.mocked(isMailerConfigured).mockReturnValue(true);
  });

  describe('auth:forgotPassword', () => {
    it('email inconnu → (true) et sendPasswordResetEmail non appelé', async () => {
      const client = await connected();

      const result = await forgot(client, uniqueEmail());

      expect(result).toEqual({ success: true, error: undefined });
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
      await disconnectClient(client);
    });

    it('email connu → (true) et sendPasswordResetEmail appelé 1× avec (email normalisé, name, code 6 chiffres)', async () => {
      const user = await registerUser();
      const client = await connected();

      const result = await forgot(client, `  ${user.email.toUpperCase()} `);

      expect(result.success).toBe(true);
      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [to, name, code] = vi.mocked(sendPasswordResetEmail).mock.calls[0];
      expect(to).toBe(user.email);
      expect(name).toBe('Reset User');
      expect(code).toMatch(/^\d{6}$/);
      await disconnectClient(client);
      await disconnectClient(user.client);
    });

    it('quand l\'envoi échoue → (true), erreur loggée sans révéler l\'échec', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(sendPasswordResetEmail).mockResolvedValue({ success: false, error: 'SMTP KO' });
      const user = await registerUser();
      const client = await connected();

      const result = await forgot(client, user.email);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('[reset] email send failed');
      errorSpy.mockRestore();
      await disconnectClient(client);
      await disconnectClient(user.client);
    });

    it('isMailerConfigured()=false → (false, \'Service email non configuré\') même pour un email inconnu', async () => {
      vi.mocked(isMailerConfigured).mockReturnValue(false);
      const client = await connected();

      const result = await forgot(client, uniqueEmail());

      expect(result).toEqual({ success: false, error: 'Service email non configuré' });
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
      await disconnectClient(client);
    });

    it('6e demande dans l\'heure pour le même email → (true) sans envoi (plafond 5/heure)', async () => {
      const user = await registerUser();
      // Avance l'horloge de 2 min après 3 demandes : la fenêtre « 3/min » est libre, pas la fenêtre horaire
      const realNow = Date.now.bind(Date);
      let offsetMs = 0;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);

      try {
        for (let i = 1; i <= 6; i++) {
          if (i === 4) offsetMs = 2 * 60 * 1000;
          const client = await connected();
          const result = await forgot(client, user.email);
          expect(result.success).toBe(true);
          await disconnectClient(client);
        }
      } finally {
        nowSpy.mockRestore();
      }

      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(5);
      await disconnectClient(user.client);
    });

    it('11e demande sur 24 h pour le même email → (true) sans envoi (plafond 10/jour)', async () => {
      const user = await registerUser();
      // Avance l'horloge par paliers pour libérer les fenêtres minute (3) et heure (5), sans atteindre 24 h
      const realNow = Date.now.bind(Date);
      let offsetMs = 0;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);
      const MIN = 60 * 1000;
      // [décalage en minutes, nombre de demandes] : 3 + 2 (heure 1), 3 + 2 (heure 2), puis la 11e
      const steps: Array<[number, number]> = [[0, 3], [2, 2], [61, 3], [63, 2], [125, 1]];

      try {
        for (const [minutes, count] of steps) {
          offsetMs = minutes * MIN;
          for (let i = 0; i < count; i++) {
            const client = await connected();
            const result = await forgot(client, user.email);
            expect(result.success).toBe(true);
            await disconnectClient(client);
          }
        }
      } finally {
        nowSpy.mockRestore();
      }

      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(10);
      await disconnectClient(user.client);
    }, 30000); // 11 demandes, chacune retardée de 300-600 ms (anti timing attack)

    it('\'pseudo:foo\' → (true), pas d\'envoi', async () => {
      const client = await connected();

      const result = await forgot(client, 'pseudo:foo');

      expect(result.success).toBe(true);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
      await disconnectClient(client);
    });
  });

  describe('auth:verifyResetCode', () => {
    it('bon email + bon code → (true)', async () => {
      const user = await registerUser();
      const code = userStore.createPasswordResetToken(user.userId);
      const client = await connected();

      const result = await verify(client, user.email, code);

      expect(result.valid).toBe(true);
      await disconnectClient(client);
      await disconnectClient(user.client);
    });

    it('bon code mais autre email → (false, RESET_CODE_INVALID_MESSAGE)', async () => {
      const userA = await registerUser();
      const userB = await registerUser();
      const codeA = userStore.createPasswordResetToken(userA.userId);
      const client = await connected();

      const result = await verify(client, userB.email, codeA);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(userStore.RESET_CODE_INVALID_MESSAGE);
      await disconnectClient(client);
      await disconnectClient(userA.client);
      await disconnectClient(userB.client);
    });
  });

  describe('auth:resetPassword', () => {
    it('6 codes faux puis le bon → le bon est refusé', async () => {
      const user = await registerUser();
      const code = userStore.createPasswordResetToken(user.userId);
      const client = await connected();

      // '000000' ne peut jamais être un code généré (100000 à 999999)
      for (let i = 0; i < 6; i++) {
        const wrong = await reset(client, user.email, '000000', NEW_PASSWORD);
        expect(wrong.success).toBe(false);
        expect(wrong.error).toBe(userStore.RESET_CODE_INVALID_MESSAGE);
      }
      const good = await reset(client, user.email, code, NEW_PASSWORD);

      expect(good.success).toBe(false);
      expect(good.error).toBe(userStore.RESET_CODE_INVALID_MESSAGE);
      await disconnectClient(client);
      await disconnectClient(user.client);
    });

    it('succès → login avec le nouveau mdp OK, ancien KO, auth:reconnect avec l\'ancien sessionToken → false', async () => {
      const user = await registerUser();
      const code = userStore.createPasswordResetToken(user.userId);
      const client = await connected();

      const result = await reset(client, user.email, code, NEW_PASSWORD);
      expect(result.success).toBe(true);

      const loginNew = await login(client, user.email, NEW_PASSWORD);
      const loginOld = await login(client, user.email, user.password);
      const reconnect = await new Promise<boolean>((resolve) => {
        client.emit('auth:reconnect', { accountId: user.userId, sessionToken: user.sessionToken }, (success) => resolve(success));
      });

      expect(loginNew.success).toBe(true);
      expect(loginOld.success).toBe(false);
      expect(reconnect).toBe(false);
      await disconnectClient(client);
      await disconnectClient(user.client);
    });

    it('succès → un 2e socket authentifié du même compte reçoit [] sur auth:getHistory', async () => {
      const user = await registerUser();
      // Crée une entrée d'historique pour que [] prouve la perte d'authentification
      await new Promise<void>((resolve) => {
        user.client.emit('room:create', { userName: 'Reset User' }, () => resolve());
      });
      expect((await getHistory(user.client)).length).toBeGreaterThan(0);

      const code = userStore.createPasswordResetToken(user.userId);
      const other = await connected();
      const result = await reset(other, user.email, code, NEW_PASSWORD);
      expect(result.success).toBe(true);

      expect(await getHistory(user.client)).toEqual([]);
      await disconnectClient(other);
      await disconnectClient(user.client);
    });

    it('mot de passe court → erreur longueur sans consommer de tentative ; 4 essais faux puis le bon code réussit', async () => {
      const user = await registerUser();
      const code = userStore.createPasswordResetToken(user.userId);
      const client = await connected();

      const tooShort = await reset(client, user.email, code, 'court');
      expect(tooShort.success).toBe(false);
      expect(tooShort.error).toBe('Le mot de passe doit faire entre 8 et 256 caractères');

      for (let i = 0; i < 4; i++) {
        const wrong = await reset(client, user.email, '000000', NEW_PASSWORD);
        expect(wrong.error).toBe(userStore.RESET_CODE_INVALID_MESSAGE);
      }
      // Si le mot de passe court avait consommé une tentative, on serait déjà à 5 essais
      const good = await reset(client, user.email, code, NEW_PASSWORD);

      expect(good.success).toBe(true);
      await disconnectClient(client);
      await disconnectClient(user.client);
    });

    it('champs manquants → message générique', async () => {
      const client = await connected();

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        (client as unknown as { emit: (ev: string, ...a: unknown[]) => void }).emit(
          'auth:resetPassword',
          { email: 'x@y.z', code: '', newPassword: NEW_PASSWORD },
          (success: boolean, error?: string) => resolve({ success, error })
        );
      });

      expect(result).toEqual({ success: false, error: 'Email, code et nouveau mot de passe requis' });
      await disconnectClient(client);
    });
  });
});
