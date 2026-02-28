'use client';

/**
 * Composant POControls - Contrôles de l'Organisateur
 * Permet à l'organisateur de gérer le déroulement des votes
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import TimerControls from './TimerControls';

export default function POControls() {
  const t = useTranslations('poControls');
  const {
    isPO,
    roomState,
    activeItem,
    statistics,
    isVoting,
    isRevealed,
    votingUsers,
    deck,
    settings,
    startVote,
    reveal,
    reset,
    setFinalScore,
    nextItem,
    updateRoomSettings,
  } = useRoom();

  const [customScore, setCustomScore] = useState('');

  // Valeurs numériques du deck triées (mémorisées)
  const deckValues = useMemo(() =>
    (deck?.cards || [])
      .map(c => parseFloat(c.value))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b),
    [deck]
  );

  // Arrondir à la valeur numérique du deck la plus proche
  const nearestDeckValue = useCallback((value: number): string => {
    if (deckValues.length === 0) return value.toString();
    let closest = deckValues[0];
    for (const dv of deckValues) {
      if (Math.abs(dv - value) < Math.abs(closest - value)) closest = dv;
    }
    return closest.toString();
  }, [deckValues]);

  // Score suggéré (médiane ou moyenne, arrondi au deck)
  const suggestedScore = useMemo(() => {
    const rawScore = statistics?.median ?? statistics?.average;
    return rawScore != null ? nearestDeckValue(rawScore) : undefined;
  }, [statistics, nearestDeckValue]);

  // Pré-remplir le score personnalisé au reveal
  useEffect(() => {
    if (isRevealed && suggestedScore) {
      setCustomScore(suggestedScore);
    } else if (!isRevealed) {
      setCustomScore('');
    }
  }, [isRevealed, suggestedScore]);

  // Ne rien afficher si pas PO
  if (!isPO) return null;

  // Nombre de votants
  const totalUsers = votingUsers.length;
  const votedUsers = votingUsers.filter((u) => u.hasVoted).length;

  const handleSetScore = (score: string) => {
    setFinalScore(score);
    setCustomScore('');
  };

  const handleNextItem = () => {
    // Si un score personnalisé est saisi, l'enregistrer avant de passer à l'item suivant
    if (customScore.trim()) {
      setFinalScore(customScore.trim());
      setCustomScore('');
    }
    nextItem();
  };

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        {t('controls')}
      </h3>

      <div className="space-y-3">
        {/* État actuel */}
        {!activeItem ? (
          <div className="text-center text-gray-500 dark:text-gray-500 text-sm py-4">
            <p>{t('selectItemToStart')}</p>
          </div>
        ) : (
          <>
            {/* Indicateur de progression */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{t('votes')}</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {votedUsers} / {totalUsers}
              </span>
            </div>

            {/* Barre de progression */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-poker-gold h-2 rounded-full transition-all duration-300"
                style={{ width: `${totalUsers > 0 ? (votedUsers / totalUsers) * 100 : 0}%` }}
              />
            </div>

            {/* Boutons de contrôle */}
            <div className="grid grid-cols-2 gap-2">
              {/* Démarrer le vote */}
              {roomState === 'idle' && (
                <button
                  onClick={startVote}
                  className="col-span-2 py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('startVote')}
                </button>
              )}

              {/* Révéler les votes */}
              {isVoting && (
                <>
                  <button
                    onClick={reveal}
                    className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {t('reveal')}
                  </button>
                  <button
                    onClick={reset}
                    className="py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('reset')}
                  </button>
                </>
              )}

              {/* Après reveal */}
              {isRevealed && (
                <>
                  {/* Score suggéré */}
                  {suggestedScore && (
                    <button
                      onClick={() => handleSetScore(suggestedScore)}
                      className="col-span-2 py-2 px-4 bg-poker-gold hover:bg-yellow-500 text-gray-900 rounded-lg font-medium transition-colors"
                    >
                      {t('validateScore', { score: suggestedScore })}
                    </button>
                  )}

                  {/* Score personnalisé */}
                  <div className="col-span-2 flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={customScore}
                      onChange={(e) => setCustomScore(e.target.value)}
                      placeholder={t('customScore')}
                      className="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                    <button
                      onClick={() => customScore && handleSetScore(customScore)}
                      disabled={!customScore}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        customScore
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      OK
                    </button>
                  </div>

                  {/* Boutons après reveal */}
                  <button
                    onClick={reset}
                    className="py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    {t('playAgain')}
                  </button>
                  <button
                    onClick={handleNextItem}
                    className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    {t('nextItem')}
                  </button>
                </>
              )}
            </div>
          </>
        )}

      </div>

      {/* Paramètres */}
      <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
          {t('settings')}
        </h4>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('allowEmojis')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings?.emojisEnabled !== false}
            onClick={() => updateRoomSettings({ emojisEnabled: settings?.emojisEnabled === false })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              settings?.emojisEnabled !== false ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                settings?.emojisEnabled !== false ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Chronomètre */}
      <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
        <TimerControls />
      </div>
    </div>
  );
}
