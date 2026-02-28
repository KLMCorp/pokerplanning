'use client';

/**
 * Contexte React pour la gestion du socket et de l'état de la room
 * Centralise toutes les communications temps réel
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import {
  Room,
  User,
  DeckConfig,
  RoomSettings,
  BacklogItem,
  ClientToServerEvents,
  ServerToClientEvents,
  AdminStats,
  SessionInfo,
  AdminUserAccount,
  RoomHistory,
} from '@/types';

interface EmojiEvent {
  id: string;
  fromUserId: string;
  fromUserName: string;
  targetUserId: string;
  emoji: string;
  timestamp: number;
}

interface SocketContextType {
  // État
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  isConnected: boolean;
  isReconnecting: boolean;
  room: Room | null;
  userId: string | null;
  currentUser: User | null;
  isPO: boolean;
  error: string | null;

  // Actions Room
  createRoom: (userName: string, password?: string, cardColor?: string) => Promise<{ room: Room; userId: string } | null>;
  joinRoom: (roomId: string, userName: string, password?: string, cardColor?: string) => Promise<{ room: Room; userId: string } | null>;
  checkRoomPassword: (roomId: string) => Promise<{ hasPassword: boolean; exists: boolean }>;
  leaveRoom: () => void;
  transferPO: (targetUserId: string) => Promise<boolean>;

  // Actions Settings
  updateRoomSettings: (settings: Partial<RoomSettings>) => void;

  // Actions Emoji
  sendEmoji: (targetUserId: string, emoji: string) => void;

  // Actions Items
  createItem: (title: string, description: string) => void;
  updateItem: (itemId: string, title?: string, description?: string) => void;
  deleteItem: (itemId: string) => void;
  reorderItem: (itemId: string, newOrder: number) => void;
  selectItem: (itemId: string) => void;
  setItemFinalScore: (itemId: string, score: string) => void;

  // Actions Votes
  startVoting: () => void;
  castVote: (value: string) => void;
  revealVotes: () => void;
  resetVotes: () => void;

  // Actions Timer
  setTimerDuration: (durationMs: number) => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;

  // Actions Deck
  updateDeck: (deck: DeckConfig) => void;
  uploadImage: (
    type: 'front' | 'back',
    cardValue: string | undefined,
    file: File
  ) => Promise<string | null>;

  // Actions Backlog
  getBacklogItems: () => Promise<BacklogItem[]>;
  createBacklogItem: (title: string, description?: string) => Promise<BacklogItem | null>;
  updateBacklogItem: (itemId: string, title?: string, description?: string) => Promise<boolean>;
  deleteBacklogItem: (itemId: string) => Promise<boolean>;
  reorderBacklogItem: (itemId: string, newPriority: number) => Promise<boolean>;
  importBacklogItems: (roomId: string, itemIds: string[]) => Promise<{ success: boolean; count?: number }>;

  // Actions Admin
  checkAdminAccess: () => Promise<boolean>;
  adminGetAllUsers: () => Promise<AdminUserAccount[]>;
  adminGetAllSessions: () => Promise<SessionInfo[]>;
  adminGetAllRoomHistory: () => Promise<RoomHistory[]>;
  adminGetAllBacklogs: () => Promise<{ userId: string; userName: string; userEmail: string; items: BacklogItem[] }[]>;
  adminGetStats: () => Promise<AdminStats | null>;
  adminDeleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  adminRevokeSession: (token: string) => Promise<boolean>;
  adminGetActiveRooms: () => Promise<Room[]>;

  // Utilitaires
  clearError: () => void;
}

// ====== SESSION STORAGE HELPERS (pour reconnexion room après F5) ======

const ROOM_SESSION_KEY = 'pokerPlanning_roomSession';

function saveRoomSession(roomId: string, userId: string, secret: string): void {
  try {
    sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({ roomId, userId, secret }));
  } catch {
    // sessionStorage indisponible (SSR, mode privé saturé)
  }
}

function clearRoomSession(): void {
  try {
    sessionStorage.removeItem(ROOM_SESSION_KEY);
  } catch {
    // sessionStorage indisponible
  }
}

function getSavedRoomSession(): { roomId: string; userId: string; secret: string } | null {
  try {
    const raw = sessionStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.roomId === 'string' && typeof parsed.userId === 'string' && typeof parsed.secret === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Contexte séparé pour les emojis — évite de re-render tous les consommateurs de useSocket()
const EmojiContext = createContext<EmojiEvent[]>([]);

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(() => getSavedRoomSession() !== null);
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flyingEmojis, setFlyingEmojis] = useState<EmojiEvent[]>([]);

  // Refs pour cleanup des timeouts emojis
  const emojiTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Ref stable pour éviter de recréer les callbacks quand socket change
  const socketRef = useRef(socket);
  socketRef.current = socket;

  // Utilisateur courant — stable reference tant que le contenu ne change pas
  const currentUserRef = useRef<User | null>(null);
  const currentUser = useMemo(() => {
    const next = room && userId ? room.users[userId] ?? null : null;
    const prev = currentUserRef.current;
    if (prev === next) return prev;
    if (prev && next && prev.name === next.name && prev.isPO === next.isPO && prev.cardColor === next.cardColor && prev.cardBackUrl === next.cardBackUrl) {
      return prev; // même contenu, garder la même référence
    }
    currentUserRef.current = next;
    return next;
  }, [room, userId]);
  const isPO = useMemo(() => (room ? room.poUserId === userId : false), [room, userId]);

  // Ref stable pour isPO (déclarée après isPO)
  const isPORef = useRef(isPO);
  isPORef.current = isPO;

  // Initialisation du socket
  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    // Événements de connexion
    s.on('connect', () => {
      setIsConnected(true);

      // Tenter la reconnexion à une room si une session existe
      const savedSession = getSavedRoomSession();
      if (savedSession) {
        setIsReconnecting(true);
        s.emit('room:reconnect', { roomId: savedSession.roomId, userId: savedSession.userId, secret: savedSession.secret }, (success, reconnectedRoom, reconnectedUserId) => {
          if (success && reconnectedRoom && reconnectedUserId) {
            setRoom(reconnectedRoom);
            setUserId(reconnectedUserId);
          } else {
            clearRoomSession();
          }
          setIsReconnecting(false);
        });
      }
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    // Événements de la room
    s.on('room:updated', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    s.on('room:userJoined', () => {
      // Géré via room:updated
    });

    s.on('room:userLeft', () => {
      // Géré via room:updated
    });

    // Erreurs
    s.on('error', (message) => {
      setError(message);
    });

    // Room fermée par le PO
    s.on('room:closed', (reason) => {
      setError(reason);
      setRoom(null);
      setUserId(null);
      clearRoomSession();
    });

    // Emojis
    s.on('emoji:received', (data) => {
      const emojiEvent: EmojiEvent = {
        id: `${Date.now()}-${Math.random()}`,
        ...data,
        timestamp: Date.now(),
      };
      setFlyingEmojis((prev) => [...prev, emojiEvent]);
      // Supprimer l'emoji après l'animation (2 secondes)
      const timer = setTimeout(() => {
        setFlyingEmojis((prev) => prev.filter((e) => e.id !== emojiEvent.id));
        emojiTimeoutsRef.current = emojiTimeoutsRef.current.filter((t) => t !== timer);
      }, 2000);
      emojiTimeoutsRef.current.push(timer);
    });

    // Connexion
    connectSocket();

    // Nettoyage
    return () => {
      s.off('connect');
      s.off('disconnect');
      s.off('room:updated');
      s.off('room:userJoined');
      s.off('room:userLeft');
      s.off('room:closed');
      s.off('error');
      s.off('emoji:received');
      emojiTimeoutsRef.current.forEach(clearTimeout);
      emojiTimeoutsRef.current = [];
      disconnectSocket();
    };
  }, []);

  // ====== ACTIONS ROOM ======
  // Toutes les callbacks utilisent socketRef/isPORef au lieu de socket/isPO
  // pour éviter la recréation des callbacks à chaque changement de socket/isPO

  const createRoom = useCallback(
    async (userName: string, password?: string, cardColor?: string): Promise<{ room: Room; userId: string } | null> => {
      const s = socketRef.current;
      if (!s) return null;

      return new Promise((resolve) => {
        s.emit('room:create', { userName, password, cardColor }, (newRoom, newUserId, reconnectSecret) => {
          setRoom(newRoom);
          setUserId(newUserId);
          if (reconnectSecret) saveRoomSession(newRoom.id, newUserId, reconnectSecret);
          resolve({ room: newRoom, userId: newUserId });
        });
      });
    },
    []
  );

  const joinRoom = useCallback(
    async (
      roomId: string,
      userName: string,
      password?: string,
      cardColor?: string
    ): Promise<{ room: Room; userId: string } | null> => {
      const s = socketRef.current;
      if (!s) return null;

      return new Promise((resolve) => {
        s.emit('room:join', { roomId, userName, password, cardColor }, (success, joinedRoom, joinedUserId, err, reconnectSecret) => {
          if (success && joinedRoom && joinedUserId) {
            setRoom(joinedRoom);
            setUserId(joinedUserId);
            if (reconnectSecret) saveRoomSession(joinedRoom.id, joinedUserId, reconnectSecret);
            resolve({ room: joinedRoom, userId: joinedUserId });
          } else {
            setError(err || 'Erreur lors de la connexion à la room');
            resolve(null);
          }
        });
      });
    },
    []
  );

  const checkRoomPassword = useCallback(
    async (roomId: string): Promise<{ hasPassword: boolean; exists: boolean }> => {
      const s = socketRef.current;
      if (!s) return { hasPassword: false, exists: false };

      return new Promise((resolve) => {
        s.emit('room:checkPassword', { roomId }, (hasPassword, exists) => {
          resolve({ hasPassword, exists });
        });
      });
    },
    []
  );

  const leaveRoom = useCallback(() => {
    const s = socketRef.current;
    if (!s) return;
    s.emit('room:leave');
    setRoom(null);
    setUserId(null);
    clearRoomSession();
  }, []);

  const transferPO = useCallback(
    async (targetUserId: string): Promise<boolean> => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return false;

      return new Promise((resolve) => {
        s.emit('room:transferPO', { targetUserId }, (success) => {
          resolve(success);
        });
      });
    },
    []
  );

  // ====== ACTIONS ITEMS ======

  const createItem = useCallback(
    (title: string, description: string) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('item:create', { title, description });
    },
    []
  );

  const updateItem = useCallback(
    (itemId: string, title?: string, description?: string) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('item:update', { itemId, title, description });
    },
    []
  );

  const deleteItem = useCallback(
    (itemId: string) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('item:delete', { itemId });
    },
    []
  );

  const reorderItem = useCallback(
    (itemId: string, newOrder: number) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('item:reorder', { itemId, newOrder });
    },
    []
  );

  const selectItem = useCallback(
    (itemId: string) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('item:select', { itemId });
    },
    []
  );

  const setItemFinalScore = useCallback(
    (itemId: string, score: string) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('item:setFinalScore', { itemId, score });
    },
    []
  );

  // ====== ACTIONS VOTES ======

  const startVoting = useCallback(() => {
    const s = socketRef.current;
    if (!s || !isPORef.current) return;
    s.emit('vote:start');
    // L'organisateur vote automatiquement "?" par défaut
    s.emit('vote:cast', { value: '?' });
  }, []);

  const castVote = useCallback(
    (value: string) => {
      const s = socketRef.current;
      if (!s) return;
      s.emit('vote:cast', { value });
    },
    []
  );

  const revealVotes = useCallback(() => {
    const s = socketRef.current;
    if (!s || !isPORef.current) return;
    s.emit('vote:reveal');
  }, []);

  const resetVotes = useCallback(() => {
    const s = socketRef.current;
    if (!s || !isPORef.current) return;
    s.emit('vote:reset');
  }, []);

  // ====== ACTIONS TIMER ======

  const setTimerDuration = useCallback(
    (durationMs: number) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('timer:set', { durationMs });
    },
    []
  );

  const startTimer = useCallback(() => {
    const s = socketRef.current;
    if (!s || !isPORef.current) return;
    s.emit('timer:start');
  }, []);

  const stopTimer = useCallback(() => {
    const s = socketRef.current;
    if (!s || !isPORef.current) return;
    s.emit('timer:stop');
  }, []);

  const resetTimer = useCallback(() => {
    const s = socketRef.current;
    if (!s || !isPORef.current) return;
    s.emit('timer:reset');
  }, []);

  // ====== ACTIONS DECK ======

  const updateDeck = useCallback(
    (deck: DeckConfig) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('deck:update', { deck });
    },
    []
  );

  const uploadImage = useCallback(
    async (
      type: 'front' | 'back',
      cardValue: string | undefined,
      file: File
    ): Promise<string | null> => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return null;

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const imageData = reader.result as string;
          s.emit(
            'deck:uploadImage',
            { type, cardValue, imageData, fileName: file.name },
            (success, url) => {
              if (success && url) {
                resolve(url);
              } else {
                resolve(null);
              }
            }
          );
        };
        reader.readAsDataURL(file);
      });
    },
    []
  );

  // ====== SETTINGS ======

  const updateRoomSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      const s = socketRef.current;
      if (!s || !isPORef.current) return;
      s.emit('room:updateSettings', { settings }, () => {});
    },
    []
  );

  // ====== EMOJIS ======

  const sendEmoji = useCallback(
    (targetUserId: string, emoji: string) => {
      const s = socketRef.current;
      if (!s) return;
      s.emit('emoji:send', { targetUserId, emoji });
    },
    []
  );

  // ====== BACKLOG ======

  const getBacklogItems = useCallback(async (): Promise<BacklogItem[]> => {
    const s = socketRef.current;
    if (!s) return [];

    return new Promise((resolve) => {
      s.emit('backlog:getItems', (items) => {
        resolve(items);
      });
    });
  }, []);

  const createBacklogItem = useCallback(
    async (title: string, description?: string): Promise<BacklogItem | null> => {
      const s = socketRef.current;
      if (!s) return null;

      return new Promise((resolve) => {
        s.emit('backlog:create', { title, description }, (success, item) => {
          if (success && item) {
            resolve(item);
          } else {
            resolve(null);
          }
        });
      });
    },
    []
  );

  const updateBacklogItem = useCallback(
    async (itemId: string, title?: string, description?: string): Promise<boolean> => {
      const s = socketRef.current;
      if (!s) return false;

      return new Promise((resolve) => {
        s.emit('backlog:update', { itemId, title, description }, (success) => {
          resolve(success);
        });
      });
    },
    []
  );

  const deleteBacklogItem = useCallback(
    async (itemId: string): Promise<boolean> => {
      const s = socketRef.current;
      if (!s) return false;

      return new Promise((resolve) => {
        s.emit('backlog:delete', { itemId }, (success) => {
          resolve(success);
        });
      });
    },
    []
  );

  const reorderBacklogItem = useCallback(
    async (itemId: string, newPriority: number): Promise<boolean> => {
      const s = socketRef.current;
      if (!s) return false;

      return new Promise((resolve) => {
        s.emit('backlog:reorder', { itemId, newPriority }, (success) => {
          resolve(success);
        });
      });
    },
    []
  );

  const importBacklogItems = useCallback(
    async (roomId: string, itemIds: string[]): Promise<{ success: boolean; count?: number }> => {
      const s = socketRef.current;
      if (!s) return { success: false };

      return new Promise((resolve) => {
        s.emit('backlog:import', { roomId, itemIds }, (success, count) => {
          resolve({ success, count });
        });
      });
    },
    []
  );

  // ====== ADMIN ======

  const checkAdminAccess = useCallback(async (): Promise<boolean> => {
    const s = socketRef.current;
    if (!s) return false;

    return new Promise((resolve) => {
      s.emit('admin:checkAccess', (isAdmin) => {
        resolve(isAdmin);
      });
    });
  }, []);

  const adminGetAllUsers = useCallback(async (): Promise<AdminUserAccount[]> => {
    const s = socketRef.current;
    if (!s) return [];

    return new Promise((resolve) => {
      s.emit('admin:getAllUsers', (success, users) => {
        resolve(success && users ? users : []);
      });
    });
  }, []);

  const adminGetAllSessions = useCallback(async (): Promise<SessionInfo[]> => {
    const s = socketRef.current;
    if (!s) return [];

    return new Promise((resolve) => {
      s.emit('admin:getAllSessions', (success, sessions) => {
        resolve(success && sessions ? sessions : []);
      });
    });
  }, []);

  const adminGetAllRoomHistory = useCallback(async (): Promise<RoomHistory[]> => {
    const s = socketRef.current;
    if (!s) return [];

    return new Promise((resolve) => {
      s.emit('admin:getAllRoomHistory', (success, histories) => {
        resolve(success && histories ? histories : []);
      });
    });
  }, []);

  const adminGetAllBacklogs = useCallback(async (): Promise<{ userId: string; userName: string; userEmail: string; items: BacklogItem[] }[]> => {
    const s = socketRef.current;
    if (!s) return [];

    return new Promise((resolve) => {
      s.emit('admin:getAllBacklogs', (success, backlogs) => {
        resolve(success && backlogs ? backlogs : []);
      });
    });
  }, []);

  const adminGetStats = useCallback(async (): Promise<AdminStats | null> => {
    const s = socketRef.current;
    if (!s) return null;

    return new Promise((resolve) => {
      s.emit('admin:getStats', (success, stats) => {
        resolve(success && stats ? stats : null);
      });
    });
  }, []);

  const adminDeleteUser = useCallback(async (delUserId: string): Promise<{ success: boolean; error?: string }> => {
    const s = socketRef.current;
    if (!s) return { success: false, error: 'Non connecté' };

    return new Promise((resolve) => {
      s.emit('admin:deleteUser', { userId: delUserId }, (success, error) => {
        resolve({ success, error });
      });
    });
  }, []);

  const adminRevokeSession = useCallback(async (token: string): Promise<boolean> => {
    const s = socketRef.current;
    if (!s) return false;

    return new Promise((resolve) => {
      s.emit('admin:revokeSession', { token }, (success) => {
        resolve(success);
      });
    });
  }, []);

  const adminGetActiveRooms = useCallback(async (): Promise<Room[]> => {
    const s = socketRef.current;
    if (!s) return [];

    return new Promise((resolve) => {
      s.emit('admin:getActiveRooms', (success, rooms) => {
        resolve(success && rooms ? rooms : []);
      });
    });
  }, []);

  // ====== UTILITAIRES ======

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Les callbacks sont stables (dépendances []) donc seul l'état change le value
  const value = useMemo<SocketContextType>(() => ({
    socket,
    isConnected,
    isReconnecting,
    room,
    userId,
    currentUser,
    isPO,
    error,
    createRoom,
    joinRoom,
    checkRoomPassword,
    leaveRoom,
    transferPO,
    updateRoomSettings,
    sendEmoji,
    createItem,
    updateItem,
    deleteItem,
    reorderItem,
    selectItem,
    setItemFinalScore,
    startVoting,
    castVote,
    revealVotes,
    resetVotes,
    setTimerDuration,
    startTimer,
    stopTimer,
    resetTimer,
    updateDeck,
    uploadImage,
    getBacklogItems,
    createBacklogItem,
    updateBacklogItem,
    deleteBacklogItem,
    reorderBacklogItem,
    importBacklogItems,
    checkAdminAccess,
    adminGetAllUsers,
    adminGetAllSessions,
    adminGetAllRoomHistory,
    adminGetAllBacklogs,
    adminGetStats,
    adminDeleteUser,
    adminRevokeSession,
    adminGetActiveRooms,
    clearError,
  }), [
    socket, isConnected, isReconnecting, room, userId, currentUser, isPO, error,
    createRoom, joinRoom, checkRoomPassword, leaveRoom, transferPO,
    updateRoomSettings, sendEmoji,
    createItem, updateItem, deleteItem, reorderItem, selectItem, setItemFinalScore,
    startVoting, castVote, revealVotes, resetVotes,
    setTimerDuration, startTimer, stopTimer, resetTimer,
    updateDeck, uploadImage,
    getBacklogItems, createBacklogItem, updateBacklogItem, deleteBacklogItem, reorderBacklogItem, importBacklogItems,
    checkAdminAccess, adminGetAllUsers, adminGetAllSessions, adminGetAllRoomHistory, adminGetAllBacklogs, adminGetStats, adminDeleteUser, adminRevokeSession, adminGetActiveRooms,
    clearError,
  ]);

  return (
    <SocketContext.Provider value={value}>
      <EmojiContext.Provider value={flyingEmojis}>
        {children}
      </EmojiContext.Provider>
    </SocketContext.Provider>
  );
}

/**
 * Hook pour utiliser le contexte socket
 */
export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

/**
 * Hook pour les emojis volants — contexte séparé pour éviter les re-renders cascade
 */
export function useEmojis(): EmojiEvent[] {
  return useContext(EmojiContext);
}

/**
 * Wrapper pour utiliser SocketProvider dans un Server Component (layout.tsx)
 */
export function SocketProviderWrapper({ children }: { children: React.ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>;
}
