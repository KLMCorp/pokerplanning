'use client';

/**
 * Composant VoteStats - Statistiques après reveal
 * Affiche moyenne, médiane, min, max des votes
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';

export default function VoteStats() {
  const t = useTranslations('voteStats');
  const { statistics, isRevealed } = useRoom();

  // Encadré vide quand pas de stats à afficher
  if (!isRevealed || !statistics) {
    return (
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          {t('statistics')}
        </h3>
        <p className="text-gray-400 dark:text-gray-500 text-sm text-center italic">
          {t('waitingForReveal')}
        </p>
      </div>
    );
  }

  const { average, median, min, max, totalVotes, numericVotes } = statistics;

  // Si aucun vote numérique
  if (numericVotes.length === 0) {
    return (
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          {t('statistics')}
        </h3>
        <p className="text-gray-500 dark:text-gray-500 text-sm text-center">
          {t('noNumericVotes')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        {t('statistics')}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* Moyenne */}
        <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {average !== null ? average : '-'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('average')}</div>
        </div>

        {/* Médiane */}
        <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-median-green">
            {median !== null ? median : '-'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('median')}</div>
        </div>

        {/* Min */}
        <div className="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-700 dark:text-gray-300">
            {min !== null ? min : '-'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('min')}</div>
        </div>

        {/* Max */}
        <div className="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-700 dark:text-gray-300">
            {max !== null ? max : '-'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('max')}</div>
        </div>
      </div>

      {/* Distribution des votes */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
          <span>{t('distribution')}</span>
          <span>{t('votes', { count: totalVotes })}</span>
        </div>

        {/* Histogramme simple */}
        <VoteHistogram numericVotes={numericVotes} />
      </div>

      {/* Note sur les exclusions */}
      <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-2 text-center">
        {t('excludedNote')}
      </p>
    </div>
  );
}

/** Histogramme des votes — calcul unique de la distribution */
function VoteHistogram({ numericVotes }: { numericVotes: number[] }) {
  const { distribution, maxCount } = useMemo(() => {
    const dist: Record<number, number> = {};
    for (const val of numericVotes) {
      dist[val] = (dist[val] || 0) + 1;
    }
    let max = 0;
    for (const c of Object.values(dist)) {
      if (c > max) max = c;
    }
    return { distribution: dist, maxCount: max };
  }, [numericVotes]);

  return (
    <div className="flex items-end gap-1 h-12">
      {Object.entries(distribution).map(([value, count]) => (
        <div key={value} className="flex-1 flex flex-col items-center">
          <div
            className="w-full bg-poker-gold rounded-t transition-all"
            style={{ height: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
          />
          <span className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{value}</span>
        </div>
      ))}
    </div>
  );
}
