/**
 * Configuration du client Socket.IO
 */

import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '@/types';

// Instance singleton du socket
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * Détermine l'URL du serveur Socket.IO
 * - En production avec Nginx : utilise la même origine (Nginx proxy /socket.io/)
 * - En développement : utilise localhost:3001
 */
function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    return window.location.origin;
  }
  return 'http://localhost:3001';
}

/**
 * Récupère ou crée l'instance du socket
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    const url = getSocketUrl();
    socket = io(url, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 10000,
    });
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
