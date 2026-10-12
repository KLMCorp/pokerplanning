/**
 * Configuration du client Socket.IO
 */

import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '@/types';
import { normalizeSocketUrl, resolveSocketUrl } from './runtimeConfig';

// Instance singleton du socket
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
// URL avec laquelle le singleton a été créé
let socketUrl: string | null = null;

/**
 * Récupère ou crée l'instance du socket.
 * L'URL n'est prise en compte qu'à la PREMIÈRE création (singleton) : SocketProvider la résout
 * (config runtime + heuristique) avant tout autre appel. Sans URL à la création, repli sur la
 * valeur de build et l'heuristique client.
 */
export function getSocket(url?: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socketUrl =
      url ??
      resolveSocketUrl(
        normalizeSocketUrl(process.env.NEXT_PUBLIC_SOCKET_URL),
        typeof window !== 'undefined' ? window.location : null,
        process.env.NODE_ENV === 'production',
      );
    socket = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 10000,
    });
  } else if (url && url !== socketUrl && process.env.NODE_ENV !== 'production') {
    console.warn(`[socket] URL ${url} ignorée : socket déjà créé pour ${socketUrl}`);
  }
  return socket;
}

/**
 * Connecte le socket au serveur
 */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

/**
 * Déconnecte le socket
 */
export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

/**
 * Vérifie si le socket est connecté
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}
