'use client';

/**
 * Composant JoinRoom - Création ou rejoindre une room
 * Affiche un formulaire pour créer une nouvelle room ou rejoindre une existante
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/contexts/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from './AuthModal';
import BacklogImport from './BacklogImport';
import ColorPicker from './ColorPicker';

export default function JoinRoom() {
  const router = useRouter();
  const t = useTranslations('joinRoom');
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const { createRoom, joinRoom, checkRoomPassword, getBacklogItems, isConnected, error, clearError } = useSocket();
  const { account, isAuthenticated } = useAuth();

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordCreate, setShowPasswordCreate] = useState(false);
  const [roomNeedsPassword, setRoomNeedsPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showBacklogImport, setShowBacklogImport] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [cardColor, setCardColor] = useState('#3B82F6');

  // Pré-remplir le nom une seule fois quand l'utilisateur se connecte
  const nameInitialized = useRef(false);
  useEffect(() => {
    if (isAuthenticated && account && !nameInitialized.current) {
      setUserName(account.name);
      nameInitialized.current = true;
    }
  }, [isAuthenticated, account]);

  // Vérifier si la room a un mot de passe quand le code change
  useEffect(() => {
    const checkPassword = async () => {
      if (mode === 'join' && roomCode.trim().length === 6) {
        const result = await checkRoomPassword(roomCode.trim().toUpperCase());
        setRoomNeedsPassword(result.hasPassword);
      } else {
        setRoomNeedsPassword(false);
      }
    };
    checkPassword();
  }, [roomCode, mode, checkRoomPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!userName.trim()) {
      setLocalError(t('pleaseEnterName'));
      return;
    }

    if (mode === 'join' && !roomCode.trim()) {
      setLocalError(t('pleaseEnterRoomCode'));
      return;
    }

    if (mode === 'join' && roomNeedsPassword && !password.trim()) {
      setLocalError(t('roomRequiresPassword'));
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'create') {
        const roomPassword = showPasswordCreate ? password.trim() : undefined;
        const result = await createRoom(userName.trim(), roomPassword, cardColor);
        if (result) {
          // Si l'utilisateur est connecte, verifier s'il a des items dans son backlog
          if (isAuthenticated) {
            const backlogItems = await getBacklogItems();
            const pendingItems = backlogItems.filter(item => !item.estimatedPoints);
            if (pendingItems.length > 0) {
              setCreatedRoomId(result.room.id);
              setShowBacklogImport(true);
            } else {
              router.push(`/room/${result.room.id}`);
            }
          } else {
            router.push(`/room/${result.room.id}`);
          }
        }
      } else {
        const result = await joinRoom(roomCode.trim().toUpperCase(), userName.trim(), password.trim() || undefined, cardColor);
        if (result) {
          router.push(`/room/${result.room.id}`);
        }
      }
    } catch (err) {
      setLocalError(tCommon('error'));
    } finally {
      setIsLoading(false);
    }
  };

  const openAuth = (authModeType: 'login' | 'register') => {
    setAuthMode(authModeType);
    setShowAuthModal(true);
  };

  const displayError = localError || error;

  const handleBacklogImportDone = () => {
    setShowBacklogImport(false);
    if (createdRoomId) {
      router.push(`/room/${createdRoomId}`);
    }
  };

  const handleBacklogImportClose = () => {
    setShowBacklogImport(false);
    if (createdRoomId) {
      router.push(`/room/${createdRoomId}`);
    }
  };

  return (
    <>
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
      {/* Tabs */}
      <div className="flex mb-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            mode === 'create'
              ? 'bg-poker-gold text-gray-900'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('createRoom')}
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            mode === 'join'
              ? 'bg-poker-gold text-gray-900'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('joinRoom')}
        </button>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nom d'utilisateur */}
        <div>
          <label htmlFor="userName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('yourName')}
          </label>
          <input
            type="text"
            id="userName"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder={t('enterName')}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
            maxLength={30}
          />
        </div>

        {/* Couleur de carte */}
        <ColorPicker
          value={cardColor}
          onChange={setCardColor}
          label={t('cardColorLabel')}
        />

        {/* Mode création: option mot de passe */}
        <div className={`overflow-hidden transition-all duration-200 ${mode === 'create' ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enablePassword"
                checked={showPasswordCreate}
                onChange={(e) => {
                  setShowPasswordCreate(e.target.checked);
                  if (!e.target.checked) setPassword('');
                }}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-poker-gold focus:ring-poker-gold"
                tabIndex={mode === 'create' ? 0 : -1}
              />
              <label htmlFor="enablePassword" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {t('protectWithPassword')}
              </label>
            </div>
            <div className={`overflow-hidden transition-all duration-200 ${showPasswordCreate && mode === 'create' ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                maxLength={50}
                tabIndex={showPasswordCreate && mode === 'create' ? 0 : -1}
              />
            </div>
          </div>
        </div>

        {/* Code de room (uniquement pour rejoindre) */}
        <div className={`overflow-hidden transition-all duration-200 ${mode === 'join' ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="space-y-4">
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('roomCode')}
              </label>
              <input
                type="text"
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder={t('roomCodeExample')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent uppercase tracking-widest text-center font-mono"
                maxLength={6}
                tabIndex={mode === 'join' ? 0 : -1}
              />
            </div>

            {/* Mot de passe pour rejoindre (si nécessaire) */}
            <div className={`overflow-hidden transition-all duration-200 ${roomNeedsPassword && mode === 'join' ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div>
                <label htmlFor="joinPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <svg className="w-4 h-4 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  {t('passwordRequired')}
                </label>
                <input
                  type="password"
                  id="joinPassword"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('enterPassword')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-poker-gold focus:border-transparent"
                  maxLength={50}
                  tabIndex={roomNeedsPassword && mode === 'join' ? 0 : -1}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Erreur */}
        <div className={`overflow-hidden transition-all duration-200 ${displayError ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm">
            {displayError || ' '}
          </div>
        </div>

        {/* Bouton de soumission */}
        <button
          type="submit"
          disabled={isLoading || !isConnected}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
            isLoading || !isConnected
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-poker-gold text-gray-900 hover:bg-yellow-500 active:transform active:scale-[0.98]'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {tCommon('connecting')}
            </span>
          ) : mode === 'create' ? (
            t('createTheRoom')
          ) : (
            t('joinTheRoom')
          )}
        </button>

        {/* Indicateur de connexion */}
        <div className="flex items-center justify-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
            }`}
          />
          <span className={isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
            {isConnected ? tCommon('connectedToServer') : tCommon('connectionInProgress')}
          </span>
        </div>
      </form>

      {/* Section compte */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        {isAuthenticated && account ? (
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/account')}
            >
              <div className="w-10 h-10 rounded-full bg-poker-gold/20 flex items-center justify-center text-xl overflow-hidden">
                {account.avatarUrl ? (
                  <img src={account.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  account.role === 'po' ? '👔' : '💻'
                )}
              </div>
              <div>
                <div className="text-gray-900 dark:text-white font-medium">{account.name}</div>
                <div className="text-gray-500 dark:text-gray-400 text-xs">{account.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/backlog')}
                className="text-poker-gold hover:text-yellow-600 dark:hover:text-yellow-400 text-sm flex items-center gap-1"
                title="Mon backlog"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Backlog
              </button>
              <button
                type="button"
                onClick={() => router.push('/profile')}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm flex items-center gap-1"
                title="Historique"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => router.push('/account')}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm flex items-center gap-1"
                title="Mon compte"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
              {t('loginToSaveHistory')}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                {tAuth('login')}
              </button>
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="px-4 py-2 bg-poker-gold/20 text-poker-gold rounded-lg hover:bg-poker-gold/30 transition-colors text-sm"
              >
                {tAuth('register')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Modal d'authentification */}
    <AuthModal
      isOpen={showAuthModal}
      onClose={() => setShowAuthModal(false)}
      initialMode={authMode}
    />

    {/* Modal d'import du backlog */}
    {createdRoomId && (
      <BacklogImport
        isOpen={showBacklogImport}
        roomId={createdRoomId}
        onClose={handleBacklogImportClose}
        onDone={handleBacklogImportDone}
      />
    )}
    </>
  );
}
