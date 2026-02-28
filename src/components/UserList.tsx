'use client';

/**
 * Composant UserList - Liste des utilisateurs connectés
 * Affiche le statut de vote de chaque utilisateur
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import { MiniCard } from './Card';
import Avatar from './Avatar';

export default function UserList() {
  const t = useTranslations('userList');
  const { votingUsers, isRevealed, isPO, deck, userId, transferPO } = useRoom();
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        {t('participants', { count: votingUsers.length })}
      </h3>

      <div className="space-y-2">
        {votingUsers.map(({ user, hasVoted, vote }) => {
          const cardConfig = vote && deck?.cards.find((c) => c.value === vote.value);

          return (
            <div
              key={user.id}
              className={`
                flex items-center justify-between p-2 rounded-lg
                ${hasVoted ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700/50'}
                transition-colors duration-200
              `}
            >
              {/* Info utilisateur */}
              <div className="flex items-center gap-2">
                {/* Avatar */}
                <Avatar userId={user.id} name={user.name} isPO={user.isPO} size="sm" cardColor={user.cardColor} />

                {/* Nom et rôle */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                    <span className="truncate max-w-[100px]" title={user.name}>
                      {user.name}
                    </span>
                    {user.isPO && (
                      <span className="text-[10px] bg-poker-gold text-gray-900 px-1 rounded flex-shrink-0">
                        {t('organizer')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions et statut de vote */}
              <div className="flex items-center gap-1">
                {/* Bouton transfert PO */}
                {isPO && !user.isPO && user.id !== userId && (
                  confirmingUserId === user.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          transferPO(user.id);
                          setConfirmingUserId(null);
                        }}
                        className="text-[10px] bg-green-500 hover:bg-green-600 text-white px-1.5 py-0.5 rounded transition-colors"
                        title={t('transferPO')}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setConfirmingUserId(null)}
                        className="text-[10px] bg-gray-400 hover:bg-gray-500 text-white px-1.5 py-0.5 rounded transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingUserId(user.id)}
                      className="p-1 text-gray-400 hover:text-poker-gold transition-colors rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                      title={t('transferPOConfirm', { name: user.name })}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3l4 4-4 4" />
                      </svg>
                    </button>
                  )
                )}
                {isRevealed && vote && cardConfig ? (
                  // Affiche la carte après reveal
                  <MiniCard
                    value={vote.value}
                    label={cardConfig.label}
                    frontImageUrl={cardConfig.frontImageUrl}
                    cardColor={user.cardColor}
                  />
                ) : (
                  // Indicateur de statut avant reveal
                  <span
                    className={`
                      status-badge
                      ${hasVoted ? 'status-voted' : 'status-waiting'}
                    `}
                  >
                    {hasVoted ? t('hasVoted') : t('waiting')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-center gap-4 text-xs text-gray-500 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {t('hasVoted')}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          {t('waiting')}
        </span>
      </div>
    </div>
  );
}
