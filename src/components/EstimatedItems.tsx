'use client';

/**
 * Composant EstimatedItems - Historique des items estimes
 * Affiche les items avec leur score final et permet l'export
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import { copyToClipboard } from '@/lib/utils';
import { useToast } from './Toast';

export default function EstimatedItems() {
  const t = useTranslations('estimatedItems');
  const tCommon = useTranslations('common');
  const { items, roomId } = useRoom();
  const { showToast } = useToast();

  // Filtrer les items qui ont un score final
  const estimatedItems = useMemo(() => {
    return items.filter((item) => item.finalScore !== undefined && item.finalScore !== '');
  }, [items]);

  // Calculer le total des points
  const totalPoints = useMemo(() => {
    return estimatedItems.reduce((sum, item) => {
      const score = parseFloat(item.finalScore || '0');
      return sum + (isNaN(score) ? 0 : score);
    }, 0);
  }, [estimatedItems]);

  // Export en JSON
  const handleExportJSON = () => {
    const exportData = {
      roomId,
      exportDate: new Date().toISOString(),
      totalItems: estimatedItems.length,
      totalPoints,
      items: estimatedItems.map((item) => ({
        title: item.title,
        description: item.description,
        score: item.finalScore,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `planning-poker-${roomId}-${formatDate()}.json`);
  };

  // Export en CSV
  const handleExportCSV = () => {
    const headers = [t('csvTitle'), t('csvDescription'), t('csvScore')];
    const rows = estimatedItems.map((item) => [
      escapeCsvField(item.title),
      escapeCsvField(item.description),
      item.finalScore || '',
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.join(';')),
      '',
      `${t('csvTotal')};${estimatedItems.length} ${t('csvItems')};${totalPoints} ${t('csvPoints')}`,
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `planning-poker-${roomId}-${formatDate()}.csv`);
  };

  // Copier dans le presse-papier
  const handleCopyToClipboard = async () => {
    const text = estimatedItems
      .map((item) => `- ${item.title}: ${item.finalScore} pts`)
      .join('\n');

    const summary = `Planning Poker - Room ${roomId}\n${'='.repeat(30)}\n\n${text}\n\nTotal: ${totalPoints} points (${estimatedItems.length} items)`;

    const success = await copyToClipboard(summary);
    if (success) {
      showToast(t('copySuccess'));
    } else {
      showToast(t('copyError'), 'error');
    }
  };

  if (estimatedItems.length === 0) {
    return (
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('estimatedItems')}
        </h3>
        <p className="text-gray-500 dark:text-gray-500 text-sm text-center py-4">
          {t('noEstimatedItems')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
      {/* En-tete */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('estimatedItemsCount', { count: estimatedItems.length })}
        </h3>

        {/* Boutons d'export */}
        <div className="flex gap-1">
          <button
            onClick={handleCopyToClipboard}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={tCommon('copy')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
          <button
            onClick={handleExportCSV}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={t('exportCSV')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          <button
            onClick={handleExportJSON}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={t('exportJSON')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Liste des items estimes */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {estimatedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-2 bg-green-100 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800/30"
          >
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-sm text-gray-900 dark:text-white truncate">{item.title}</p>
              {item.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</p>
              )}
            </div>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center justify-center w-10 h-10 bg-green-600 text-white font-bold rounded-lg text-sm">
                {item.finalScore}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">{tCommon('total')}</span>
        <span className="text-lg font-bold text-poker-gold">{totalPoints} {tCommon('points')}</span>
      </div>
    </div>
  );
}

// Helpers

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function escapeCsvField(field: string): string {
  if (field.includes(';') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
