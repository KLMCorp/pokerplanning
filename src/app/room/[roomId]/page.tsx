'use client';

/**
 * Page Room - Interface principale du Planning Poker
 * Layout à 3 colonnes: Items | Table | Contrôles
 */

import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/contexts/SocketContext';
import { useRoom } from '@/hooks/useRoom';
import { useAuth } from '@/contexts/AuthContext';
import RoomGridLayout from '@/components/RoomGridLayout';
import Avatar from '@/components/Avatar';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import ColorPicker from '@/components/ColorPicker';
import { copyToClipboard } from '@/lib/utils';

/** Composant isolé pour le timer TTL — ne re-render que lui-même chaque seconde */
const RoomTTLTimer = memo(function RoomTTLTimer({ expiresAt, label }: { expiresAt: number; label: string }) {
  const [timeRemaining, setTimeRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const tick = () => setTimeRemaining(Math.max(0, expiresAt - Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const totalSeconds = Math.floor(timeRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formattedTime = hours > 0 ? `${pad(hours)}:${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;

  const minutesLeft = timeRemaining / 60000;
  const ttlColorClass = minutesLeft <= 5
    ? 'text-red-500 animate-pulse'
    : minutesLeft <= 15
      ? 'text-orange-500 animate-[pulse_3s_ease-in-out_infinite]'
      : 'text-gray-400 dark:text-gray-500';

  return (
    <span
      className={`flex items-center gap-1 text-xs font-mono ${ttlColorClass}`}
      title={label}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {formattedTime}
    </span>
  );
});

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const t = useTranslations('room');
  const tJoinRoom = useTranslations('joinRoom');
  const tCommon = useTranslations('common');
  const { room, isConnected, isReconnecting, error, joinRoom, checkRoomPassword, leaveRoom } = useSocket();
  const { isPO, currentUser, roomId: connectedRoomId } = useRoom();
  const { account, isAuthenticated } = useAuth();

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [roomNeedsPassword, setRoomNeedsPassword] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardColor, setCardColor] = useState('#3B82F6');

  // Si déjà dans une autre room, déconnecter
  useEffect(() => {
    if (connectedRoomId && connectedRoomId !== roomId.toUpperCase()) {
      leaveRoom();
    }
  }, [connectedRoomId, roomId, leaveRoom]);

  // Vérifier si la room a un mot de passe
  useEffect(() => {
    const checkPassword = async () => {
      if (isConnected && roomId) {
        const result = await checkRoomPassword(roomId.toUpperCase());
        setRoomNeedsPassword(result.hasPassword);
      }
    };
    checkPassword();
  }, [roomId, isConnected, checkRoomPassword]);

  // Vérifier si on doit afficher le formulaire de join
  const needsJoin = !room || room.id !== roomId.toUpperCase();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setJoinError(tJoinRoom('pleaseEnterName'));
      return;
    }

    if (roomNeedsPassword && !password.trim()) {
      setJoinError(tJoinRoom('roomRequiresPassword'));
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await joinRoom(roomId, userName.trim(), password.trim() || undefined, cardColor);
      if (!result) {
        setJoinError(t('cannotJoinRoom'));
      }
    } catch (err) {
      setJoinError(t('connectionError'));
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyLink = useCallback(async () => {
    const url = window.location.href;
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleLeave = useCallback(() => {
    leaveRoom();
    router.push('/');
  }, [leaveRoom, router]);

  // Écran d'attente pendant la reconnexion
  if (isReconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-poker-gold border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg text-gray-600 dark:text-gray-300">{tCommon('connecting')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 font-mono">{roomId.toUpperCase()}</p>
        </div>
      </div>
    );
  }

  // Formulaire pour rejoindre la room
  if (needsJoin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {t('joinRoom')}
            </h1>
            <div className="flex items-center justify-center gap-2">
              <p className="text-poker-gold font-mono text-2xl">{roomId.toUpperCase()}</p>
              {roomNeedsPassword && (
                <svg className="w-5 h-5 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {tJoinRoom('yourName')}
                </label>
                <input
                  type="text"
                  id="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder={tJoinRoom('enterName')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                  maxLength={30}
                  autoFocus
                />
              </div>

              {/* Couleur de carte */}
              <ColorPicker
                value={cardColor}
                onChange={setCardColor}
                label={tJoinRoom('cardColorLabel')}
              />

              <div className={`overflow-hidden transition-all duration-200 ${roomNeedsPassword ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    <svg className="w-4 h-4 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    {tJoinRoom('passwordRequired')}
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tJoinRoom('enterPassword')}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                    maxLength={50}
                    tabIndex={roomNeedsPassword ? 0 : -1}
                  />
                </div>
              </div>

              {(joinError || error) && (
                <div className="p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm">
                  {joinError || error}
                </div>
              )}

              <button
                type="submit"
                disabled={isJoining || !isConnected}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
                  isJoining || !isConnected
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-poker-gold text-gray-900 hover:bg-yellow-500'
                }`}
              >
                {isJoining ? tCommon('connecting') : tJoinRoom('joinRoom')}
              </button>

              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors"
              >
                {t('backToHome')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Interface principale de la room
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 px-4 py-2 relative z-[100]">
        <div className="max-w-7xl 2xl:max-w-[1800px] mx-auto flex items-center justify-between">
          {/* Logo et code room */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">
              <span className="text-poker-gold">Planning</span>{' '}
              <span className="text-gray-900 dark:text-white">Poker</span>
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">{t('roomLabel')}</span>
              <span className="font-mono text-poker-gold font-bold">{room?.id}</span>
              {room?.hasPassword && (
                <svg className="w-4 h-4 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
              <button
                onClick={handleCopyLink}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
                title="Copier le lien"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                )}
              </button>
              {isPO && room?.expiresAt && (
                <RoomTTLTimer expiresAt={room.expiresAt} label={t('timeRemaining')} />
              )}
            </div>
          </div>

          {/* Info utilisateur et déconnexion */}
          <div className="flex items-center gap-4">
            <ThemeToggle size="sm" />
            {currentUser && (
              <div
                onClick={() => isAuthenticated && router.push('/account')}
                className={isAuthenticated ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                title={isAuthenticated ? 'Mon compte' : undefined}
              >
                <Avatar
                  userId={currentUser.id}
                  name={currentUser.name}
                  isPO={isPO}
                  size="sm"
                  showName
                  avatarUrl={account?.avatarUrl}
                />
              </div>
            )}
            <button
              onClick={handleLeave}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              {t('leave')}
            </button>
          </div>
        </div>
      </header>

      {/* Contenu principal — grid layout drag & drop */}
      <main className="flex-1 px-4 pb-6 mt-4 max-w-5xl xl:max-w-7xl 2xl:max-w-[1800px] mx-auto w-full">
        <RoomGridLayout isPO={isPO} room={room} />
      </main>
    </div>
  );
}
