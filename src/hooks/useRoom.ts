/**
 * Hook personnalisé pour la gestion de la room
 * Fournit des données dérivées et des actions simplifiées
 */

import { useMemo, useCallback } from 'react';
import { useSocket } from '@/contexts/SocketContext';
import { Item, User, Vote, VoteStatistics, DeckConfig, RoomSettings, TableConfig } from '@/types';
import { calculateVoteStatistics } from '@/lib/utils';

interface UseRoomReturn {
  // Données de la room
  roomId: string | null;
  roomState: 'idle' | 'voting' | 'revealed' | null;
  users: User[];
  items: Item[];
  activeItem: Item | null;
  deck: DeckConfig | null;
  tableConfig: TableConfig | null;
  settings: RoomSettings | null;

  // Données utilisateur
  currentUser: User | null;
  isPO: boolean;
  userId: string | null;
  myVote: Vote | null;
  hasVoted: boolean;

  // Données des votes
  votingUsers: { user: User; hasVoted: boolean; vote?: Vote }[];
  statistics: VoteStatistics | null;
  isRevealed: boolean;
  isVoting: boolean;

  // Timer
  timerDuration: number | undefined;
  timerStartedAt: number | undefined;
  timerStoppedRemaining: number | undefined;
  isTimerRunning: boolean;

  // Actions
  vote: (value: string) => void;
  startVote: () => void;
  reveal: () => void;
  reset: () => void;
  selectItem: (itemId: string) => void;
  setFinalScore: (score: string) => void;
  nextItem: () => void;
  updateRoomSettings: (settings: Partial<RoomSettings>) => void;
  transferPO: (targetUserId: string) => Promise<boolean>;

  // Timer actions
  setTimerDuration: (durationMs: number) => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;
}

export function useRoom(): UseRoomReturn {
  const {
    room,
    userId,
    currentUser,
    isPO,
    castVote,
    startVoting,
    revealVotes,
    resetVotes,
    selectItem: selectItemAction,
    setItemFinalScore,
    updateRoomSettings,
    transferPO,
    setTimerDuration,
    startTimer,
    stopTimer,
    resetTimer,
  } = useSocket();

  // Données de base
  const roomId = room?.id || null;
  const roomState = room?.state || null;
  const users = useMemo(() => (room ? Object.values(room.users) : []), [room]);
  const items = useMemo(
    () => (room ? [...room.items].sort((a, b) => a.order - b.order) : []),
    [room]
  );
  const deck = room?.deck || null;
  const tableConfig = room?.tableConfig || null;
  const settings = room?.settings || null;

  // Item actif
  const activeItem = useMemo(() => {
    if (!room || !room.activeItemId) return null;
    return room.items.find((i) => i.id === room.activeItemId) || null;
  }, [room]);

  // Mon vote
  const myVote = useMemo(() => {
    if (!activeItem || !userId) return null;
    return activeItem.votes[userId] || null;
  }, [activeItem, userId]);

  const hasVoted = myVote !== null;

  // État du vote
  const isRevealed = roomState === 'revealed';
  const isVoting = roomState === 'voting';

  // Utilisateurs avec leur statut de vote
  // Le vote est toujours inclus pour pouvoir afficher le dos de la carte
  const votingUsers = useMemo(() => {
    if (!activeItem) {
      return users.map((user) => ({ user, hasVoted: false }));
    }

    return users.map((user) => ({
      user,
      hasVoted: !!activeItem.votes[user.id],
      vote: activeItem.votes[user.id], // Toujours inclure le vote pour afficher la carte
    }));
  }, [users, activeItem]);

  // Statistiques (uniquement après reveal)
  const statistics = useMemo(() => {
    if (!activeItem || !isRevealed) return null;
    return calculateVoteStatistics(activeItem.votes);
  }, [activeItem, isRevealed]);

  // Timer
  const timerDuration = room?.timerDuration;
  const timerStartedAt = room?.timerStartedAt;
  const timerStoppedRemaining = room?.timerStoppedRemaining;
  const isTimerRunning = !!room?.timerStartedAt;

  // Actions (mémorisées pour éviter les re-renders en cascade)
  const vote = useCallback((value: string) => {
    if (isVoting) {
      castVote(value);
    }
  }, [isVoting, castVote]);

  const startVote = useCallback(() => {
    if (isPO && activeItem && roomState === 'idle') {
      startVoting();
    }
  }, [isPO, activeItem, roomState, startVoting]);

  const reveal = useCallback(() => {
    if (isPO && isVoting) {
      revealVotes();
    }
  }, [isPO, isVoting, revealVotes]);

  const reset = useCallback(() => {
    if (isPO) {
      resetVotes();
    }
  }, [isPO, resetVotes]);

  const selectItem = useCallback((itemId: string) => {
    if (isPO) {
      selectItemAction(itemId);
    }
  }, [isPO, selectItemAction]);

  const setFinalScore = useCallback((score: string) => {
    if (isPO && activeItem) {
      setItemFinalScore(activeItem.id, score);
    }
  }, [isPO, activeItem, setItemFinalScore]);

  // Passe à l'item suivant
  const nextItem = useCallback(() => {
    if (!isPO || !activeItem || items.length === 0) return;

    const currentIndex = items.findIndex((i) => i.id === activeItem.id);
    const nextIndex = (currentIndex + 1) % items.length;
    selectItemAction(items[nextIndex].id);
  }, [isPO, activeItem, items, selectItemAction]);

  return {
    roomId,
    roomState,
    users,
    items,
    activeItem,
    deck,
    tableConfig,
    settings,
    currentUser,
    isPO,
    userId,
    myVote,
    hasVoted,
    votingUsers,
    statistics,
    isRevealed,
    isVoting,
    timerDuration,
    timerStartedAt,
    timerStoppedRemaining,
    isTimerRunning,
    vote,
    startVote,
    reveal,
    reset,
    selectItem,
    setFinalScore,
    nextItem,
    updateRoomSettings,
    transferPO,
    setTimerDuration,
    startTimer,
    stopTimer,
    resetTimer,
  };
}
