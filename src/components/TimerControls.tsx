'use client';

/**
 * Composant TimerControls - Contrôles du chronomètre (PO uniquement)
 *
 * Intégré dans POControls, ce composant permet au PO de :
 * - Choisir une durée via des presets (1, 2, 5 min) ou saisie libre
 * - Démarrer / mettre en pause / réinitialiser le chronomètre
 * - Voir un aperçu compact du countdown via le composant Chronometer
 *
 * Le chronomètre est indépendant du cycle de vote (idle/voting/revealed).
 * Il sert à timeboxer les discussions, pas à contrôler le vote.
 *
 * Flux des événements socket :
 * - timer:set  → configure la durée (reset auto du timer)
 * - timer:start → démarre le countdown
 * - timer:stop  → met en pause + accumule l'elapsed sur l'item actif
 * - timer:reset → remet le timer à la durée configurée (sans la supprimer)
 *
 * @see Chronometer.tsx — affichage du countdown (utilisé ici en mode compact)
 * @see PokerTable.tsx — affichage plein écran du Chronometer sur la table
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import Chronometer from './Chronometer';

export default function TimerControls() {
  const t = useTranslations('chronometer');
  const {
    timerDuration,
    timerStartedAt,
    timerStoppedRemaining,
    isTimerRunning,
    setTimerDuration,
    startTimer,
    stopTimer,
    resetTimer,
  } = useRoom();

  const [customMinutes, setCustomMinutes] = useState('');

  const handleSetPreset = (minutes: number) => {
    setTimerDuration(minutes * 60 * 1000);
  };

  const handleSetCustom = () => {
    const minutes = parseFloat(customMinutes);
    if (minutes > 0) {
      // Le serveur clamp entre 10s et 60min (voir roomStore.setTimerDuration)
      setTimerDuration(minutes * 60 * 1000);
      setCustomMinutes('');
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('timer')}
      </h4>

      {/* Presets rapides */}
      <div className="flex gap-1.5">
        <button
          onClick={() => handleSetPreset(1)}
          className="flex-1 py-1 px-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
        >
          {t('1min')}
        </button>
        <button
          onClick={() => handleSetPreset(2)}
          className="flex-1 py-1 px-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
        >
          {t('2min')}
        </button>
        <button
          onClick={() => handleSetPreset(5)}
          className="flex-1 py-1 px-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
        >
          {t('5min')}
        </button>
      </div>

      {/* Saisie personnalisée en minutes (ex: 0.5 = 30s, 10 = 10min) */}
      <div className="flex gap-1.5">
        <input
          type="number"
          min="0.1"
          max="60"
          step="0.5"
          value={customMinutes}
          onChange={(e) => setCustomMinutes(e.target.value)}
          placeholder={t('minutesPlaceholder')}
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-poker-gold"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSetCustom(); }}
        />
        <button
          onClick={handleSetCustom}
          disabled={!customMinutes || parseFloat(customMinutes) <= 0}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            customMinutes && parseFloat(customMinutes) > 0
              ? 'bg-poker-gold hover:bg-yellow-400 text-gray-900'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {t('set')}
        </button>
      </div>

      {/* Affichage + contrôles (seulement quand une durée est configurée) */}
      {timerDuration && (
        <>
          {/* Aperçu compact du countdown dans les contrôles PO */}
          <div className="flex items-center justify-center py-1">
            <Chronometer
              timerDuration={timerDuration}
              timerStartedAt={timerStartedAt}
              timerStoppedRemaining={timerStoppedRemaining}
              isRunning={isTimerRunning}
              compact
            />
          </div>

          {/* Boutons Start/Stop + Reset */}
          <div className="flex gap-1.5">
            {!isTimerRunning ? (
              <button
                onClick={startTimer}
                className="flex-1 py-1.5 px-2 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                {t('start')}
              </button>
            ) : (
              <button
                onClick={stopTimer}
                className="flex-1 py-1.5 px-2 text-xs font-medium bg-yellow-500 hover:bg-yellow-600 text-gray-900 rounded-md transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {t('stop')}
              </button>
            )}
            <button
              onClick={resetTimer}
              className="flex-1 py-1.5 px-2 text-xs font-medium bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors flex items-center justify-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('reset')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
