/**
 * Enregistrement sécurisé des handlers Socket.IO client -> serveur.
 *
 * Un payload hors contrat (null, tableau, absence de callback…) ou une exception dans un
 * handler ne doit jamais arrêter le processus : createSafeOn garantit un payload objet,
 * un ack toujours appelable (à usage unique) et la capture des erreurs synchrones et asynchrones.
 */

import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../src/types';

export type ClientEventName = keyof ClientToServerEvents;
export type SocketClient = Socket<ClientToServerEvents, ServerToClientEvents>;

export type FailureArgs = (message: string) => unknown[];
export type EventShape =
  | { kind: 'none' } // handler()
  | { kind: 'data' } // handler(data)
  | { kind: 'optionalData' } // handler(data?)
  | { kind: 'ack'; failure: FailureArgs } // handler(callback)
  | { kind: 'dataAck'; failure: FailureArgs | 'emitError' }; // handler(data, callback)

export const INVALID_PAYLOAD_MESSAGE = 'Données invalides';
export const SERVER_ERROR_MESSAGE = 'Erreur serveur';

// Formes d'échec réutilisées (ordre des arguments du callback de chaque événement)
const failFalse: FailureArgs = () => [false];
const failFalseMessage: FailureArgs = (m) => [false, m];
const failAuth: FailureArgs = (m) => [false, undefined, m];
const failJoin: FailureArgs = (m) => [false, undefined, undefined, m];
const failCheckPassword: FailureArgs = () => [false, false];
const failEmptyList: FailureArgs = () => [[]];

/**
 * Forme de chaque événement client -> serveur (exhaustive : le typage l'impose)
 */
export const EVENT_SHAPES: { readonly [E in ClientEventName]: EventShape } = {
  'auth:register': { kind: 'dataAck', failure: failAuth },
  'auth:login': { kind: 'dataAck', failure: failAuth },
  'auth:reconnect': { kind: 'dataAck', failure: failFalse },
  'auth:deleteRoomHistory': { kind: 'dataAck', failure: failFalse },
  'auth:updateDeck': { kind: 'dataAck', failure: failFalse },
  'auth:deleteDeckImage': { kind: 'dataAck', failure: failFalse },
  'auth:updateTableConfig': { kind: 'dataAck', failure: failFalse },
  'auth:updateLayoutConfig': { kind: 'dataAck', failure: failFalse },
  'auth:uploadDeckImage': { kind: 'dataAck', failure: failFalseMessage },
  'auth:uploadAvatar': { kind: 'dataAck', failure: failFalseMessage },
  'auth:uploadTableImage': { kind: 'dataAck', failure: failFalseMessage },
  'auth:updateRoomTtl': { kind: 'dataAck', failure: failFalseMessage },
  'auth:forgotPassword': { kind: 'dataAck', failure: failFalseMessage },
  'auth:verifyResetCode': { kind: 'dataAck', failure: failFalseMessage },
  'auth:resetPassword': { kind: 'dataAck', failure: failFalseMessage },
  'auth:logout': { kind: 'optionalData' },
  'auth:getHistory': { kind: 'ack', failure: failEmptyList },
  'backlog:getItems': { kind: 'ack', failure: failEmptyList },
  'room:create': { kind: 'dataAck', failure: 'emitError' },
  'room:join': { kind: 'dataAck', failure: failJoin },
  'room:checkPassword': { kind: 'dataAck', failure: failCheckPassword },
  'room:leave': { kind: 'none' },
  'vote:start': { kind: 'none' },
  'vote:reveal': { kind: 'none' },
  'vote:reset': { kind: 'none' },
  'timer:start': { kind: 'none' },
  'timer:stop': { kind: 'none' },
  'timer:reset': { kind: 'none' },
  'room:reconnect': { kind: 'dataAck', failure: failFalse },
  'room:updateSettings': { kind: 'dataAck', failure: failFalse },
  'room:close': { kind: 'ack', failure: failFalse },
  'room:transferPO': { kind: 'dataAck', failure: failFalseMessage },
  'deck:uploadImage': { kind: 'dataAck', failure: failFalseMessage },
  'admin:deleteUser': { kind: 'dataAck', failure: failFalseMessage },
  'item:create': { kind: 'data' },
  'item:update': { kind: 'data' },
  'item:delete': { kind: 'data' },
  'item:reorder': { kind: 'data' },
  'item:select': { kind: 'data' },
  'item:setFinalScore': { kind: 'data' },
  'vote:cast': { kind: 'data' },
  'timer:set': { kind: 'data' },
  'deck:update': { kind: 'data' },
  'emoji:send': { kind: 'data' },
  'backlog:create': { kind: 'dataAck', failure: failFalse },
  'backlog:update': { kind: 'dataAck', failure: failFalse },
  'backlog:delete': { kind: 'dataAck', failure: failFalse },
  'backlog:reorder': { kind: 'dataAck', failure: failFalse },
  'backlog:import': { kind: 'dataAck', failure: failFalse },
  'admin:revokeSession': { kind: 'dataAck', failure: failFalse },
  'admin:checkAccess': { kind: 'ack', failure: failFalse },
  'admin:getAllUsers': { kind: 'ack', failure: failFalse },
  'admin:getAllSessions': { kind: 'ack', failure: failFalse },
  'admin:getAllRoomHistory': { kind: 'ack', failure: failFalse },
  'admin:getAllBacklogs': { kind: 'ack', failure: failFalse },
  'admin:getStats': { kind: 'ack', failure: failFalse },
  'admin:getActiveRooms': { kind: 'ack', failure: failFalse },
};

/**
 * Objet simple : non null et non tableau
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Retourne une fonction `on(event, handler)` qui enregistre le handler sur le socket
 * avec validation du payload, ack à usage unique et capture des erreurs.
 */
export function createSafeOn(
  socket: SocketClient
): <E extends ClientEventName>(event: E, handler: ClientToServerEvents[E]) => void {
  return (event, handler) => {
    const shape = EVENT_SHAPES[event];

    (socket as unknown as { on(ev: string, l: (...a: unknown[]) => void): void }).on(
      event,
      (...rawArgs: unknown[]) => {
        // Le dernier argument fonction est l'ack ; il est retiré des arguments « données »
        const last = rawArgs[rawArgs.length - 1];
        const ack = typeof last === 'function' ? (last as (...a: unknown[]) => unknown) : undefined;
        const dataArgs = ack ? rawArgs.slice(0, -1) : rawArgs;
        let payload: unknown = typeof dataArgs[0] === 'function' ? undefined : dataArgs[0];

        // Ack à usage unique : un second appel (ex. handler qui répond puis jette) est ignoré
        let done = false;
        const safeAck = (...a: unknown[]): void => {
          if (done) return;
          done = true;
          try {
            ack?.(...a);
          } catch (e) {
            console.error('[socket] ack for "%s" failed:', event, e);
          }
        };

        const fail = (message: string): void => {
          if ((shape.kind === 'ack' || shape.kind === 'dataAck') && shape.failure !== 'emitError') {
            safeAck(...shape.failure(message));
          } else {
            socket.emit('error', message);
          }
        };

        if (shape.kind === 'data' && !isPlainObject(payload)) return;
        if (shape.kind === 'dataAck' && !isPlainObject(payload)) {
          fail(INVALID_PAYLOAD_MESSAGE);
          return;
        }
        if (shape.kind === 'optionalData' && payload !== undefined && !isPlainObject(payload)) {
          payload = undefined;
        }

        const onError = (e: unknown): void => {
          console.error('[socket] handler "%s" failed:', event, e);
          fail(SERVER_ERROR_MESSAGE);
        };

        const h = handler as unknown as (...a: unknown[]) => unknown;
        try {
          let result: unknown;
          switch (shape.kind) {
            case 'none':
              result = h();
              break;
            case 'data':
            case 'optionalData':
              result = h(payload);
              break;
            case 'ack':
              result = h(safeAck);
              break;
            case 'dataAck':
              result = h(payload, safeAck);
              break;
          }
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            (result as Promise<unknown>).catch(onError);
          }
        } catch (e) {
          onError(e);
        }
      }
    );
  };
}
