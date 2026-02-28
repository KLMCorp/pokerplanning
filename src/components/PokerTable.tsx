'use client';

/**
 * Composant PokerTable - Table de poker centrale
 * Affiche l'item actif et les cartes des utilisateurs autour de la table
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import { useSocket, useEmojis } from '@/contexts/SocketContext';
import Card from './Card';
import { MiniAvatar } from './Avatar';
import { getTablePosition } from '@/lib/utils';
import { getCardDescription } from '@/lib/defaultDeck';
import EmojiPicker from './EmojiPicker';
import FlyingEmoji from './FlyingEmoji';
import Chronometer from './Chronometer';

export default React.memo(function PokerTable() {
  const t = useTranslations('room');
  const { activeItem, votingUsers, isRevealed, deck, roomState, tableConfig, settings, isPO, transferPO, timerDuration, timerStartedAt, timerStoppedRemaining, isTimerRunning } = useRoom();
  const { sendEmoji, userId } = useSocket();
  const flyingEmojis = useEmojis();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmTransferUserId, setConfirmTransferUserId] = useState<string | null>(null);
  const userRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tableRef = useRef<HTMLDivElement>(null);

  // Dimensions de la table
  const tableWidth = 600;
  const tableHeight = 400;

  // Calcul des positions des cartes autour de la table
  const userPositions = useMemo(() => {
    return votingUsers.map((vu, index) => ({
      ...vu,
      position: getTablePosition(index, votingUsers.length, tableWidth, tableHeight),
    }));
  }, [votingUsers]);

  // Sélectionner un utilisateur pour lui envoyer un emoji ou le nommer organisateur
  const handleUserClick = useCallback((targetUserId: string) => {
    if (targetUserId === userId) return; // Pas sur soi-même
    if (settings?.emojisEnabled === false && !isPO) return; // Emojis désactivés et pas PO
    setConfirmTransferUserId(null);
    setSelectedUserId(selectedUserId === targetUserId ? null : targetUserId);
  }, [selectedUserId, userId, settings, isPO]);

  // Envoyer un emoji
  const handleSendEmoji = useCallback((emoji: string) => {
    if (selectedUserId) {
      sendEmoji(selectedUserId, emoji);
      setSelectedUserId(null);
    }
  }, [selectedUserId, sendEmoji]);

  // Confirmer le transfert PO
  const handleConfirmTransfer = useCallback(async () => {
    if (confirmTransferUserId) {
      await transferPO(confirmTransferUserId);
      setConfirmTransferUserId(null);
      setSelectedUserId(null);
    }
  }, [confirmTransferUserId, transferPO]);

  // Cache des positions pour éviter des appels répétés à getBoundingClientRect dans le même frame
  const positionCacheRef = useRef<Map<string, { x: number; y: number; frame: number }>>(new Map());
  const getUserPosition = useCallback((targetUserId: string) => {
    const frame = performance.now();
    const cached = positionCacheRef.current.get(targetUserId);
    // Réutiliser le cache si < 100ms (même cycle d'animation)
    if (cached && frame - cached.frame < 100) {
      return { x: cached.x, y: cached.y };
    }
    const userRef = userRefs.current[targetUserId];
    if (userRef) {
      const rect = userRef.getBoundingClientRect();
      const pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      positionCacheRef.current.set(targetUserId, { ...pos, frame });
      return pos;
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }, []);


  // Utilisateur sélectionné
  const selectedUser = useMemo(() => votingUsers.find(vu => vu.user.id === selectedUserId)?.user, [votingUsers, selectedUserId]);

  // Validation des valeurs CSS pour éviter l'injection
  const isValidHexColor = (c: string) => /^#[0-9a-fA-F]{3,8}$/.test(c);
  const isValidImageUrl = (url: string) => url.startsWith('/uploads/') || url.startsWith('/images/');

  // Style table memoizé — ne recalcule que si tableConfig change
  const tableStyle = useMemo<React.CSSProperties>(() => {
    const feltColor = tableConfig?.feltColor && isValidHexColor(tableConfig.feltColor) ? tableConfig.feltColor : null;
    const borderColor = tableConfig?.borderColor && isValidHexColor(tableConfig.borderColor) ? tableConfig.borderColor : '#8B4513';
    const shadowColor = tableConfig?.borderColor && isValidHexColor(tableConfig.borderColor) ? tableConfig.borderColor : '#654321';
    const imageUrl = tableConfig?.imageUrl && isValidImageUrl(tableConfig.imageUrl) ? tableConfig.imageUrl : null;

    return {
      background: imageUrl
        ? `url(${imageUrl}) center/cover`
        : feltColor
          ? `radial-gradient(ellipse at center, ${feltColor} 0%, ${feltColor}99 70%)`
          : 'radial-gradient(ellipse at center, #1a7a3d 0%, #0d5c2e 70%)',
      border: `12px solid ${borderColor}`,
      boxShadow: `
        inset 0 0 60px rgba(0, 0, 0, 0.4),
        0 0 0 8px ${shadowColor},
        0 10px 40px rgba(0, 0, 0, 0.5)
      `,
    };
  }, [tableConfig]);

  // Compteur de votes memoizé
  const voteCount = useMemo(() => votingUsers.filter(u => u.hasVoted).length, [votingUsers]);

  return (
    <div className="relative w-full aspect-[3/2] max-w-5xl 2xl:max-w-6xl mx-auto">
      {/* Table de poker */}
      <div
        ref={tableRef}
        className="absolute inset-4 rounded-[50%] overflow-hidden"
        style={tableStyle}
      />

      {/* Chronomètre PO */}
      {timerDuration && (
        <div className="absolute top-2 right-2 z-20 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2">
          <Chronometer
            timerDuration={timerDuration}
            timerStartedAt={timerStartedAt}
            timerStoppedRemaining={timerStoppedRemaining}
            isRunning={isTimerRunning}
          />
        </div>
      )}

      {/* Contenu central - Item actif (au-dessus des cartes) */}
      <div className="absolute inset-4 flex items-center justify-center pointer-events-none z-10">
        <div className="text-center max-w-xs px-4 pointer-events-auto">
          {activeItem ? (
            <>
              {/* Titre de l'item */}
              <h2 className="text-xl font-bold text-white mb-2 drop-shadow-lg">
                {activeItem.title}
              </h2>

              {/* Description */}
              {activeItem.description && (
                <p className="text-sm text-gray-200 opacity-90 line-clamp-3">
                  {activeItem.description}
                </p>
              )}

              {/* État du vote */}
              <div className="mt-4">
                {roomState === 'idle' && (
                  <span className="inline-flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-gray-400 rounded-full" />
                    {t('waitingForVote')}
                  </span>
                )}
                {roomState === 'voting' && (
                  <span className="inline-flex items-center gap-2 text-sm text-yellow-300 animate-pulse">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                    {t('voting')}
                  </span>
                )}
                {roomState === 'revealed' && (
                  <span className="inline-flex items-center gap-2 text-sm text-green-300">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    {t('revealed')}
                  </span>
                )}
              </div>

              {/* Score final si défini */}
              {activeItem.finalScore && (
                <div className="mt-3">
                  <span className="inline-block px-4 py-2 bg-green-600 text-white rounded-full font-bold text-lg shadow-lg">
                    Score: {activeItem.finalScore}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-400">
              <svg
                className="w-16 h-16 mx-auto mb-3 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-sm">{t('waitingForVote')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Cartes des utilisateurs autour de la table */}
      <div className="absolute inset-0 pointer-events-none">
        {userPositions.map(({ user, hasVoted, vote, position }) => {
          // Trouver la configuration de la carte
          const cardConfig = vote && deck?.cards.find((c: { value: string }) => c.value === vote.value);
          const isSelected = selectedUserId === user.id;
          const isMe = user.id === userId;

          // Position ajustée pour centrer la carte
          const cardStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${(position.x / tableWidth) * 100}%`,
            top: `${(position.y / tableHeight) * 100}%`,
            transform: `translate(-50%, -50%)`,
          };

          return (
            <div
              key={user.id}
              ref={(el) => { userRefs.current[user.id] = el; }}
              style={cardStyle}
              className={`pointer-events-auto relative ${isSelected ? 'z-50' : 'z-0'}`}
            >
              {/* Avatar et nom de l'utilisateur - cliquable */}
              <div
                className={`
                  flex flex-col items-center mb-1 cursor-pointer transition-transform
                  ${!isMe ? 'hover:scale-110' : ''}
                  ${isSelected ? 'scale-110' : ''}
                `}
                onClick={() => handleUserClick(user.id)}
              >
                <div className={`relative ${isSelected ? 'ring-2 ring-poker-gold ring-offset-2 ring-offset-transparent rounded-full' : ''}`}>
                  <MiniAvatar userId={user.id} isPO={user.isPO} cardColor={user.cardColor} />
                </div>
                <span
                  className={`
                    text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1
                    ${user.isPO ? 'bg-poker-gold text-gray-900' : 'bg-white/80 dark:bg-gray-800/80 text-gray-900 dark:text-white'}
                    ${isSelected ? 'ring-1 ring-poker-gold' : ''}
                    max-w-[60px] truncate
                  `}
                >
                  {user.name}
                </span>
              </div>

              {/* Menu actions (transfert PO + emoji picker) */}
              {isSelected && selectedUser && (isPO || settings?.emojisEnabled !== false) && (
                <div
                  className={`absolute left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1 ${
                    position.y < tableHeight * 0.4 ? 'top-full mt-1' : 'bottom-full mb-1'
                  }`}
                >
                  {/* Bouton Nommer organisateur */}
                  {isPO && !selectedUser.isPO && (
                    confirmTransferUserId === selectedUser.id ? (
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-center whitespace-nowrap">
                        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
                          {t('promoteOrganizerConfirm', { name: selectedUser.name })}
                        </p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={handleConfirmTransfer}
                            className="px-3 py-1 text-xs bg-poker-gold text-gray-900 rounded-md font-medium hover:bg-yellow-400 transition-colors"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setConfirmTransferUserId(null)}
                            className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmTransferUserId(selectedUser.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-poker-gold hover:text-gray-900 transition-colors whitespace-nowrap"
                      >
                        <span>👑</span>
                        {t('promoteOrganizer')}
                      </button>
                    )
                  )}

                  {/* Emoji Picker */}
                  {settings?.emojisEnabled !== false && (
                    <EmojiPicker
                      targetName={selectedUser.name}
                      onSelect={handleSendEmoji}
                      onClose={() => { setSelectedUserId(null); setConfirmTransferUserId(null); }}
                      position={position.y < tableHeight * 0.4 ? 'below' : 'above'}
                    />
                  )}
                </div>
              )}

              {/* Carte */}
              {hasVoted && cardConfig ? (
                <div className="animate-bounce-in relative group/card">
                  <Card
                    card={cardConfig}
                    isRevealed={isRevealed}
                    backImageUrl={user.cardBackUrl}
                    cardColor={user.cardColor}
                    size="md"
                  />
                  {/* Tooltip avec description (uniquement si révélé) */}
                  {isRevealed && getCardDescription(cardConfig.value) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                      {getCardDescription(cardConfig.value)}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
                    </div>
                  )}
                </div>
              ) : hasVoted ? (
                /* Vote masqué (pas encore révélé) — afficher le dos de carte */
                <div className="animate-bounce-in">
                  <Card
                    card={{ value: 'hidden', label: '?' }}
                    isBack
                    noFlip
                    backImageUrl={user.cardBackUrl}
                    cardColor={user.cardColor}
                    size="md"
                  />
                </div>
              ) : (
                // Emplacement vide si pas de vote
                <div
                  className={`
                    w-16 h-24 rounded-lg border-2 border-dashed
                    ${roomState === 'voting' ? 'border-gray-400 dark:border-gray-500 animate-pulse' : 'border-gray-300 dark:border-gray-700'}
                    flex items-center justify-center
                    transition-colors
                    bg-gray-100/30 dark:bg-gray-800/30
                  `}
                >
                  {roomState === 'voting' && (
                    <span className="text-gray-500 text-lg">🤔</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Emojis volants */}
      {flyingEmojis.map((emojiEvent) => (
        <FlyingEmoji
          key={emojiEvent.id}
          emoji={emojiEvent.emoji}
          getFromPosition={() => getUserPosition(emojiEvent.fromUserId)}
          getToPosition={() => getUserPosition(emojiEvent.targetUserId)}
        />
      ))}

      {/* Indicateur du nombre de votes */}
      {roomState === 'voting' && (
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {voteCount} / {votingUsers.length} votes
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
