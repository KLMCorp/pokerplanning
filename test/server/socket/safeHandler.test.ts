import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EVENT_SHAPES,
  createSafeOn,
  isPlainObject,
  INVALID_PAYLOAD_MESSAGE,
  SERVER_ERROR_MESSAGE,
  type SocketClient,
} from '../../../server/socket/safeHandler';

// Liste attendue en dur : tout ajout d'événement client -> serveur doit être déclaré ici ET dans EVENT_SHAPES
const EXPECTED_EVENTS = [
  'admin:checkAccess',
  'admin:deleteUser',
  'admin:getActiveRooms',
  'admin:getAllBacklogs',
  'admin:getAllRoomHistory',
  'admin:getAllSessions',
  'admin:getAllUsers',
  'admin:getStats',
  'admin:revokeSession',
  'auth:deleteDeckImage',
  'auth:deleteRoomHistory',
  'auth:forgotPassword',
  'auth:getHistory',
  'auth:login',
  'auth:logout',
  'auth:reconnect',
  'auth:register',
  'auth:resetPassword',
  'auth:updateDeck',
  'auth:updateLayoutConfig',
  'auth:updateRoomTtl',
  'auth:updateTableConfig',
  'auth:uploadAvatar',
  'auth:uploadDeckImage',
  'auth:uploadTableImage',
  'auth:verifyResetCode',
  'backlog:create',
  'backlog:delete',
  'backlog:getItems',
  'backlog:import',
  'backlog:reorder',
  'backlog:update',
  'deck:update',
  'deck:uploadImage',
  'emoji:send',
  'item:create',
  'item:delete',
  'item:reorder',
  'item:select',
  'item:setFinalScore',
  'item:update',
  'room:checkPassword',
  'room:close',
  'room:create',
  'room:join',
  'room:leave',
  'room:reconnect',
  'room:transferPO',
  'room:updateSettings',
  'timer:reset',
  'timer:set',
  'timer:start',
  'timer:stop',
  'vote:cast',
  'vote:reset',
  'vote:reveal',
  'vote:start',
];

type Listener = (...args: unknown[]) => void;

function createFakeSocket() {
  const listeners = new Map<string, Listener>();
  const emit = vi.fn();
  const socket = {
    on: (event: string, listener: Listener) => {
      listeners.set(event, listener);
    },
    emit,
  } as unknown as SocketClient;
  return { socket, listeners, emit };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('safeHandler', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('EVENT_SHAPES couvre exactement les clés de ClientToServerEvents', () => {
    const keys = Object.keys(EVENT_SHAPES).sort();
    expect(keys).toHaveLength(EXPECTED_EVENTS.length);
    expect(keys).toEqual([...EXPECTED_EVENTS].sort());
  });

  it('isPlainObject refuse null, tableaux et primitives', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    for (const v of [null, undefined, [], 42, 'x', true]) {
      expect(isPlainObject(v)).toBe(false);
    }
  });

  describe('kind dataAck', () => {
    it.each([undefined, null, 42, 'x', []])(
      'payload non objet (%j) -> ack(...failure("Données invalides")), handler non appelé',
      (payload) => {
        const { socket, listeners } = createFakeSocket();
        const handler = vi.fn();
        createSafeOn(socket)('auth:login', handler as never);
        const ack = vi.fn();

        listeners.get('auth:login')!(payload, ack);

        expect(handler).not.toHaveBeenCalled();
        // auth:login : failure = [false, undefined, message]
        expect(ack).toHaveBeenCalledTimes(1);
        expect(ack).toHaveBeenCalledWith(false, undefined, INVALID_PAYLOAD_MESSAGE);
      }
    );

    it('appelle le handler avec le payload et un ack sécurisé', () => {
      const { socket, listeners } = createFakeSocket();
      const handler = vi.fn((_data: unknown, cb: (ok: boolean) => void) => cb(true));
      createSafeOn(socket)('auth:deleteRoomHistory', handler as never);
      const ack = vi.fn();

      listeners.get('auth:deleteRoomHistory')!({ historyId: 'h1' }, ack);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual({ historyId: 'h1' });
      expect(ack).toHaveBeenCalledWith(true);
    });

    it('ack absent -> le handler reçoit une fonction noop appelable sans throw', () => {
      const { socket, listeners } = createFakeSocket();
      let received: unknown;
      const handler = vi.fn((_data: unknown, cb: unknown) => {
        received = cb;
        (cb as (...a: unknown[]) => void)(false);
      });
      createSafeOn(socket)('room:checkPassword', handler as never);

      expect(() => listeners.get('room:checkPassword')!({ roomId: 'AAAAAA' })).not.toThrow();

      expect(typeof received).toBe('function');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('payload invalide sans ack -> pas de throw', () => {
      const { socket, listeners, emit } = createFakeSocket();
      createSafeOn(socket)('room:checkPassword', vi.fn() as never);

      expect(() => listeners.get('room:checkPassword')!(null)).not.toThrow();
      expect(emit).not.toHaveBeenCalled();
    });

    it('exception synchrone -> console.error + ack(...failure("Erreur serveur"))', () => {
      const { socket, listeners } = createFakeSocket();
      createSafeOn(socket)('auth:login', (() => {
        throw new Error('boom');
      }) as never);
      const ack = vi.fn();

      listeners.get('auth:login')!({}, ack);

      expect(errorSpy).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith(false, undefined, SERVER_ERROR_MESSAGE);
    });

    it('promesse rejetée -> console.error + ack(...failure("Erreur serveur"))', async () => {
      const { socket, listeners } = createFakeSocket();
      createSafeOn(socket)('auth:uploadAvatar', (async () => {
        throw new Error('async boom');
      }) as never);
      const ack = vi.fn();

      listeners.get('auth:uploadAvatar')!({}, ack);
      await flushMicrotasks();

      expect(errorSpy).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith(false, SERVER_ERROR_MESSAGE);
    });

    it('ack à usage unique : ack(true) puis throw -> ack appelé une seule fois avec true', () => {
      const { socket, listeners } = createFakeSocket();
      createSafeOn(socket)('auth:deleteRoomHistory', ((_data: unknown, cb: (ok: boolean) => void) => {
        cb(true);
        throw new Error('after ack');
      }) as never);
      const ack = vi.fn();

      listeners.get('auth:deleteRoomHistory')!({}, ack);

      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith(true);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('un ack client qui jette ne fait pas échouer le handler', () => {
      const { socket, listeners } = createFakeSocket();
      createSafeOn(socket)('auth:deleteRoomHistory', ((_data: unknown, cb: (ok: boolean) => void) => {
        cb(true);
      }) as never);
      const ack = vi.fn(() => {
        throw new Error('client ack boom');
      });

      expect(() => listeners.get('auth:deleteRoomHistory')!({}, ack)).not.toThrow();
      expect(ack).toHaveBeenCalledTimes(1);
    });
  });

  describe('room:create (emitError)', () => {
    it('payload invalide -> emit("error", "Données invalides"), ack non appelé', () => {
      const { socket, listeners, emit } = createFakeSocket();
      const handler = vi.fn();
      createSafeOn(socket)('room:create', handler as never);
      const ack = vi.fn();

      listeners.get('room:create')!(null, ack);

      expect(emit).toHaveBeenCalledWith('error', INVALID_PAYLOAD_MESSAGE);
      expect(ack).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('exception -> emit("error", "Erreur serveur"), ack non appelé', () => {
      const { socket, listeners, emit } = createFakeSocket();
      createSafeOn(socket)('room:create', (() => {
        throw new Error('boom');
      }) as never);
      const ack = vi.fn();

      listeners.get('room:create')!({ userName: 'x' }, ack);

      expect(emit).toHaveBeenCalledWith('error', SERVER_ERROR_MESSAGE);
      expect(ack).not.toHaveBeenCalled();
    });
  });

  describe('kind data', () => {
    it.each([undefined, null, 42, 'x', []])('payload non objet (%j) -> handler non appelé, pas d\'emit', (payload) => {
      const { socket, listeners, emit } = createFakeSocket();
      const handler = vi.fn();
      createSafeOn(socket)('vote:cast', handler as never);

      listeners.get('vote:cast')!(payload);

      expect(handler).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('payload objet -> handler appelé', () => {
      const { socket, listeners } = createFakeSocket();
      const handler = vi.fn();
      createSafeOn(socket)('vote:cast', handler as never);

      listeners.get('vote:cast')!({ value: '5' });

      expect(handler).toHaveBeenCalledWith({ value: '5' });
    });

    it('exception -> emit("error", "Erreur serveur")', () => {
      const { socket, listeners, emit } = createFakeSocket();
      createSafeOn(socket)('vote:cast', (() => {
        throw new Error('boom');
      }) as never);

      listeners.get('vote:cast')!({ value: '5' });

      expect(emit).toHaveBeenCalledWith('error', SERVER_ERROR_MESSAGE);
    });

    it('promesse rejetée -> emit("error", "Erreur serveur")', async () => {
      const { socket, listeners, emit } = createFakeSocket();
      createSafeOn(socket)('item:create', (async () => {
        throw new Error('boom');
      }) as never);

      listeners.get('item:create')!({ title: 't', description: '' });
      await flushMicrotasks();

      expect(emit).toHaveBeenCalledWith('error', SERVER_ERROR_MESSAGE);
    });
  });

  describe('kind none', () => {
    it('appelle le handler sans argument, même si le client envoie des données', () => {
      const { socket, listeners } = createFakeSocket();
      const handler = vi.fn();
      createSafeOn(socket)('room:leave', handler as never);

      listeners.get('room:leave')!({ foo: 'bar' }, vi.fn());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]).toHaveLength(0);
    });
  });

  describe('kind ack', () => {
    it('ack absent -> le handler reçoit une fonction noop', () => {
      const { socket, listeners } = createFakeSocket();
      const handler = vi.fn((cb: (ok: boolean) => void) => cb(false));
      createSafeOn(socket)('admin:checkAccess', handler as never);

      expect(() => listeners.get('admin:checkAccess')!()).not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(typeof handler.mock.calls[0][0]).toBe('function');
    });

    it('exception -> ack(...failure)', () => {
      const { socket, listeners } = createFakeSocket();
      createSafeOn(socket)('auth:getHistory', (() => {
        throw new Error('boom');
      }) as never);
      const ack = vi.fn();

      listeners.get('auth:getHistory')!(ack);

      expect(ack).toHaveBeenCalledWith([]);
    });
  });

  describe('kind optionalData', () => {
    it('"x" -> handler appelé avec undefined', () => {
      const { socket, listeners } = createFakeSocket();
      const handler = vi.fn();
      createSafeOn(socket)('auth:logout', handler as never);

      listeners.get('auth:logout')!('x');

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('objet -> transmis tel quel ; absent -> undefined', () => {
      const { socket, listeners } = createFakeSocket();
      const handler = vi.fn();
      createSafeOn(socket)('auth:logout', handler as never);

      listeners.get('auth:logout')!({ sessionToken: 't' });
      listeners.get('auth:logout')!();

      expect(handler).toHaveBeenNthCalledWith(1, { sessionToken: 't' });
      expect(handler).toHaveBeenNthCalledWith(2, undefined);
    });
  });
});
