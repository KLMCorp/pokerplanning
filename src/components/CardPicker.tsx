'use client';

/**
 * Composant CardPicker - Sélecteur de cartes pour voter
 * Affiche le deck complet et permet de sélectionner une carte
 */

import { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import Card from './Card';
import { getCardDescription } from '@/lib/defaultDeck';

export default function CardPicker() {
  const t = useTranslations('cardPicker');
  const { deck, myVote, isVoting, vote, hasVoted, currentUser } = useRoom();

  // Callbacks stables par carte — évite d'invalider React.memo de Card
  const voteRef = useRef(vote);
  voteRef.current = vote;
  const clickHandlersRef = useRef<Map<string, () => void>>(new Map());
  const getClickHandler = useCallback((value: string) => {
    let handler = clickHandlersRef.current.get(value);
    if (!handler) {
      handler = () => voteRef.current(value);
      clickHandlersRef.current.set(value, handler);
    }
    return handler;
  }, []);

  if (!deck) return null;

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700 relative z-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isVoting ? t('chooseCard') : t('waitingForVote')}
        </h3>
        {hasVoted && (
          <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full">
            {t('voteRegistered')}
          </span>
        )}
      </div>

      {/* Grille de cartes - alignées en bas avec espace au-dessus pour l'élévation */}
      <div className="flex flex-wrap gap-3 justify-center items-end min-h-[120px]">
        {deck.cards.map((card) => {
          const isSelected = myVote?.value === card.value;
          const description = getCardDescription(card.value);

          return (
            <div
              key={card.value}
              className={`card-picker-item ${isSelected ? 'selected' : ''} relative group`}
            >
              <Card
                card={card}
                isSelected={isSelected}
                isRevealed={true}
                cardColor={currentUser?.cardColor}
                size="md"
                onClick={getClickHandler(card.value)}
                disabled={!isVoting}
                noFlip={true}
              />
              {/* Tooltip avec description */}
              {description && (
                <div className="card-tooltip absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg whitespace-nowrap z-[100] shadow-lg">
                  {description}
                  {/* Flèche */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Message si pas en phase de vote */}
      {!isVoting && (
        <p className="text-center text-gray-500 dark:text-gray-500 text-xs mt-3">
          {t('organizerMustStart')}
        </p>
      )}
    </div>
  );
}
