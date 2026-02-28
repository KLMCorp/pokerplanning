'use client';

/**
 * Contexte React pour l'authentification
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSocket } from './SocketContext';
import { UserAccount, UserRole, AuthType, RoomHistory, DeckConfig, TableConfig, LayoutConfig } from '@/types';

interface AuthContextType {
  account: UserAccount | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isServerConnected: boolean; // true si le compte est reconnu par le serveur
  roomHistory: RoomHistory[];
  register: (email: string, password: string, name: string, role: UserRole, authType?: AuthType, pseudo?: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string, authType?: AuthType, pseudo?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshHistory: () => Promise<void>;
  deleteRoomHistory: (historyId: string) => Promise<boolean>;
  updateDeck: (deck: DeckConfig) => Promise<boolean>;
  uploadDeckImage: (type: 'front' | 'back', cardValue: string | undefined, file: File) => Promise<string | null>;
  deleteDeckImage: (type: 'front' | 'back', cardValue?: string) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;
  updateTableConfig: (tableConfig: TableConfig) => Promise<boolean>;
  uploadTableImage: (file: File) => Promise<string | null>;
  updateRoomTtl: (ttlMinutes: number) => Promise<{ success: boolean; error?: string }>;
  updateLayoutConfig: (layoutConfig: LayoutConfig) => Promise<boolean>;
  maxRoomTtlMinutes: number;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyResetCode: (code: string) => Promise<{ valid: boolean; error?: string }>;
  resetPassword: (code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'pokerPlanning_auth';
const SESSION_TOKEN_KEY = 'pokerPlanning_sessionToken';
const DEFAULT_MAX_ROOM_TTL_MINUTES = 180; // 3 heures par défaut

function getDefaultDeckConfig(): DeckConfig {
  return {
    cards: [
      { value: '0', label: '0' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '5', label: '5' },
      { value: '8', label: '8' },
      { value: '13', label: '13' },
      { value: '20', label: '20' },
      { value: '40', label: '40' },
      { value: '100', label: '100' },
      { value: '?', label: '?' },
      { value: 'coffee', label: '☕' },
    ],
    backImageUrl: undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { socket, isConnected } = useSocket();
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [roomHistory, setRoomHistory] = useState<RoomHistory[]>([]);
  const hasReconnected = useRef(false);
  const storedAccountRef = useRef<UserAccount | null>(null);

  // Ref stable pour éviter de recréer les callbacks quand socket change
  const socketRef = useRef(socket);
  socketRef.current = socket;

  // Charger le compte depuis le localStorage au démarrage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAccount(parsed);
        storedAccountRef.current = parsed;
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Reconnexion automatique quand le socket est prêt
  useEffect(() => {
    const storedAccount = storedAccountRef.current;

    if (!isConnected) {
      // Reset le flag quand déconnecté pour permettre la reconnexion
      hasReconnected.current = false;
      setIsServerConnected(false);
      return;
    }

    if (isConnected && storedAccount && socket && !hasReconnected.current) {
      hasReconnected.current = true;
      // Re-associer le socket avec le compte et le token de session
      const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || undefined;
      socket.emit('auth:reconnect', { accountId: storedAccount.id, sessionToken }, (success, serverAccount) => {
        if (success && serverAccount) {
          // Mettre à jour les infos du compte si elles ont changé
          setAccount(serverAccount);
          storedAccountRef.current = serverAccount;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serverAccount));
          setIsServerConnected(true);
        } else {
          // Session invalide - nettoyer les données locales
          setIsServerConnected(false);
          localStorage.removeItem(SESSION_TOKEN_KEY);
        }
      });
    }
  }, [isConnected, socket]);

  const refreshHistory = useCallback(async () => {
    const s = socketRef.current;
    if (!s || !storedAccountRef.current) return;

    return new Promise<void>((resolve) => {
      s.emit('auth:getHistory', (rooms) => {
        setRoomHistory(rooms);
        resolve();
      });
    });
  }, []);

  // Rafraîchir l'historique quand on est connecté
  useEffect(() => {
    if (isConnected && account) {
      refreshHistory();
    }
  }, [isConnected, account, refreshHistory]);

  const register = useCallback(
    async (email: string, password: string, name: string, role: UserRole, authType?: AuthType, pseudo?: string): Promise<{ success: boolean; error?: string }> => {
      const s = socketRef.current;
      if (!s) return { success: false, error: 'Non connecté au serveur' };

      return new Promise((resolve) => {
        s.emit('auth:register', { email, password, name, role, authType, pseudo }, (success, acc, error, sessionToken) => {
          if (success && acc) {
            setAccount(acc);
            storedAccountRef.current = acc;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
            setIsServerConnected(true);
            resolve({ success: true });
          } else {
            resolve({ success: false, error: error || 'Erreur lors de l\'inscription' });
          }
        });
      });
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string, authType?: AuthType, pseudo?: string): Promise<{ success: boolean; error?: string }> => {
      const s = socketRef.current;
      if (!s) return { success: false, error: 'Non connecté au serveur' };

      return new Promise((resolve) => {
        s.emit('auth:login', { email, password, authType, pseudo }, (success, acc, error, sessionToken) => {
          if (success && acc) {
            setAccount(acc);
            storedAccountRef.current = acc;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
            if (sessionToken) {
              localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
            }
            setIsServerConnected(true);
            resolve({ success: true });
          } else {
            resolve({ success: false, error: error || 'Erreur lors de la connexion' });
          }
        });
      });
    },
    []
  );

  const logout = useCallback(() => {
    const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || undefined;
    const s = socketRef.current;
    if (s) {
      s.emit('auth:logout', { sessionToken });
    }
    setAccount(null);
    setRoomHistory([]);
    setIsServerConnected(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }, []);

  const deleteRoomHistory = useCallback(
    async (historyId: string): Promise<boolean> => {
      const s = socketRef.current;
      if (!s) return false;

      return new Promise((resolve) => {
        s.emit('auth:deleteRoomHistory', { historyId }, (success) => {
          if (success) {
            setRoomHistory((prev) => prev.filter((r) => r.id !== historyId));
          }
          resolve(success);
        });
      });
    },
    []
  );

  const updateDeck = useCallback(
    async (deck: DeckConfig): Promise<boolean> => {
      const s = socketRef.current;
      if (!s || !storedAccountRef.current) return false;

      return new Promise((resolve) => {
        s.emit('auth:updateDeck', { deck }, (success) => {
          if (success) {
            setAccount(prev => {
              if (!prev) return prev;
              const updated = { ...prev, deckConfig: deck };
              storedAccountRef.current = updated;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              return updated;
            });
          }
          resolve(success);
        });
      });
    },
    []
  );

  const uploadDeckImage = useCallback(
    async (type: 'front' | 'back', cardValue: string | undefined, file: File): Promise<string | null> => {
      const s = socketRef.current;
      if (!s) {
        console.error('uploadDeckImage: socket not connected');
        return null;
      }
      if (!storedAccountRef.current) {
        console.error('uploadDeckImage: not authenticated');
        return null;
      }

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => {
          console.error('FileReader error:', reader.error);
          resolve(null);
        };
        reader.onload = () => {
          const imageData = reader.result as string;
          s.emit(
            'auth:uploadDeckImage',
            { type, cardValue, imageData, fileName: file.name },
            (success, urlOrError) => {
              if (success && urlOrError) {
                setAccount(prev => {
                  if (!prev) return prev;
                  const currentDeck = prev.deckConfig ? structuredClone(prev.deckConfig) : getDefaultDeckConfig();
                  if (type === 'back') {
                    currentDeck.backImageUrl = urlOrError;
                  } else if (cardValue) {
                    const card = currentDeck.cards.find((c: { value: string }) => c.value === cardValue);
                    if (card) {
                      card.frontImageUrl = urlOrError;
                    }
                  }
                  const updated = { ...prev, deckConfig: currentDeck };
                  storedAccountRef.current = updated;
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                  return updated;
                });
                resolve(urlOrError);
              } else {
                const errorMsg = !success && urlOrError ? urlOrError : 'Erreur lors de l\'upload';
                console.warn('Upload failed:', errorMsg);
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

  const deleteDeckImage = useCallback(
    async (type: 'front' | 'back', cardValue?: string): Promise<boolean> => {
      const s = socketRef.current;
      if (!s || !storedAccountRef.current) return false;

      return new Promise((resolve) => {
        s.emit(
          'auth:deleteDeckImage',
          { type, cardValue },
          (success) => {
            if (success) {
              setAccount(prev => {
                if (!prev) return prev;
                const currentDeck = prev.deckConfig ? structuredClone(prev.deckConfig) : getDefaultDeckConfig();
                if (type === 'back') {
                  currentDeck.backImageUrl = undefined;
                } else if (cardValue) {
                  const card = currentDeck.cards.find((c: { value: string }) => c.value === cardValue);
                  if (card) {
                    card.frontImageUrl = undefined;
                  }
                }
                const updated = { ...prev, deckConfig: currentDeck };
                storedAccountRef.current = updated;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                return updated;
              });
            }
            resolve(success);
          }
        );
      });
    },
    []
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<string | null> => {
      const s = socketRef.current;
      if (!s) {
        console.error('uploadAvatar: socket not connected');
        return null;
      }
      if (!storedAccountRef.current) {
        console.error('uploadAvatar: not authenticated');
        return null;
      }

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => {
          console.error('FileReader error:', reader.error);
          resolve(null);
        };
        reader.onload = () => {
          const imageData = reader.result as string;
          s.emit(
            'auth:uploadAvatar',
            { imageData, fileName: file.name },
            (success, url) => {
              if (success && url) {
                setAccount(prev => {
                  if (!prev) return prev;
                  const updated = { ...prev, avatarUrl: url };
                  storedAccountRef.current = updated;
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                  return updated;
                });
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

  const updateTableConfig = useCallback(
    async (tableConfig: TableConfig): Promise<boolean> => {
      const s = socketRef.current;
      if (!s || !storedAccountRef.current) return false;

      return new Promise((resolve) => {
        s.emit('auth:updateTableConfig', { tableConfig }, (success) => {
          if (success) {
            setAccount(prev => {
              if (!prev) return prev;
              const updated = { ...prev, tableConfig };
              storedAccountRef.current = updated;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              return updated;
            });
          }
          resolve(success);
        });
      });
    },
    []
  );

  const uploadTableImage = useCallback(
    async (file: File): Promise<string | null> => {
      const s = socketRef.current;
      if (!s || !storedAccountRef.current) return null;

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onload = () => {
          const imageData = reader.result as string;
          s.emit(
            'auth:uploadTableImage',
            { imageData, fileName: file.name },
            (success, url) => {
              if (success && url) {
                setAccount(prev => {
                  if (!prev) return prev;
                  const currentConfig = prev.tableConfig || {};
                  const updated = { ...prev, tableConfig: { ...currentConfig, imageUrl: url } };
                  storedAccountRef.current = updated;
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                  return updated;
                });
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

  const updateRoomTtl = useCallback(
    async (ttlMinutes: number): Promise<{ success: boolean; error?: string }> => {
      const s = socketRef.current;
      if (!s || !storedAccountRef.current) return { success: false, error: 'Non connecté' };

      return new Promise((resolve) => {
        s.emit('auth:updateRoomTtl', { ttlMinutes }, (success, error) => {
          if (success) {
            setAccount(prev => {
              if (!prev) return prev;
              const updated = { ...prev, roomTtlMinutes: ttlMinutes };
              storedAccountRef.current = updated;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              return updated;
            });
          }
          resolve({ success, error });
        });
      });
    },
    []
  );

  const updateLayoutConfig = useCallback(
    async (layoutConfig: LayoutConfig): Promise<boolean> => {
      const s = socketRef.current;
      if (!s || !storedAccountRef.current) return false;

      return new Promise((resolve) => {
        s.emit('auth:updateLayoutConfig', { layoutConfig }, (success) => {
          if (success) {
            setAccount(prev => {
              if (!prev) return prev;
              const updated = { ...prev, layoutConfig };
              storedAccountRef.current = updated;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              return updated;
            });
          }
          resolve(success);
        });
      });
    },
    []
  );

  const forgotPassword = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      const s = socketRef.current;
      if (!s) return { success: false, error: 'Non connecté au serveur' };

      return new Promise((resolve) => {
        s.emit('auth:forgotPassword', { email }, (success, error) => {
          resolve({ success, error });
        });
      });
    },
    []
  );

  const verifyResetCode = useCallback(
    async (code: string): Promise<{ valid: boolean; error?: string }> => {
      const s = socketRef.current;
      if (!s) return { valid: false, error: 'Non connecté au serveur' };

      return new Promise((resolve) => {
        s.emit('auth:verifyResetCode', { code }, (valid, error) => {
          resolve({ valid, error });
        });
      });
    },
    []
  );

  const resetPassword = useCallback(
    async (code: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
      const s = socketRef.current;
      if (!s) return { success: false, error: 'Non connecté au serveur' };

      return new Promise((resolve) => {
        s.emit('auth:resetPassword', { code, newPassword }, (success, error) => {
          resolve({ success, error });
        });
      });
    },
    []
  );

  // Les callbacks sont stables (dépendances []) donc seul l'état change le value
  const value = useMemo<AuthContextType>(() => ({
    account,
    isAuthenticated: !!account,
    isLoading,
    isServerConnected,
    roomHistory,
    register,
    login,
    logout,
    refreshHistory,
    deleteRoomHistory,
    updateDeck,
    uploadDeckImage,
    deleteDeckImage,
    uploadAvatar,
    updateTableConfig,
    uploadTableImage,
    updateRoomTtl,
    updateLayoutConfig,
    maxRoomTtlMinutes: DEFAULT_MAX_ROOM_TTL_MINUTES,
    forgotPassword,
    verifyResetCode,
    resetPassword,
  }), [
    account, isLoading, isServerConnected, roomHistory,
    register, login, logout, refreshHistory, deleteRoomHistory,
    updateDeck, uploadDeckImage, deleteDeckImage, uploadAvatar,
    updateTableConfig, uploadTableImage, updateRoomTtl, updateLayoutConfig,
    forgotPassword, verifyResetCode, resetPassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
