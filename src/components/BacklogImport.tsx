'use client';

/**
 * Modal pour importer des items du backlog personnel vers une room
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/contexts/SocketContext';
import { BacklogItem } from '@/types';

interface BacklogImportProps {
  isOpen: boolean;
  roomId: string;
  onClose: () => void;
  onDone: () => void;
}

export default function BacklogImport({ isOpen, roomId, onClose, onDone }: BacklogImportProps) {
  const t = useTranslations('backlogImport');
  const tCommon = useTranslations('common');
  const { getBacklogItems, importBacklogItems } = useSocket();

  const [items, setItems] = useState<BacklogItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    const fetchedItems = await getBacklogItems();
    // Ne montrer que les items non estimes
    const pendingItems = fetchedItems.filter((item) => !item.estimatedPoints);
    setItems(pendingItems);
    setSelectedIds(new Set());
    setIsLoading(false);
  }, [getBacklogItems]);

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen, loadItems]);

  if (!isOpen) return null;

  const toggleItem = (itemId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) {
      onDone();
      return;
    }

    setIsImporting(true);
    const result = await importBacklogItems(roomId, Array.from(selectedIds));
    setIsImporting(false);

    if (result.success) {
      onDone();
    }
  };

  const handleSkip = () => {
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-lg border border-gray-200 dark:border-gray-700 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            {t('loading')}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="py-8 text-center">
            <div className="text-4xl mb-4">📝</div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {t('empty')}
            </p>
            <button
              onClick={handleSkip}
              className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-500 transition-colors"
            >
              {tCommon('continue')}
            </button>
          </div>
        )}

        {/* Liste des items */}
        {!isLoading && items.length > 0 && (
          <>
            <div className="mb-4">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                {t('selectItems')}
              </p>

              {/* Bouton tout selectionner */}
              <button
                onClick={toggleAll}
                className="text-sm text-poker-gold hover:text-yellow-500 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {selectedIds.size === items.length ? tCommon('deselectAll') : tCommon('selectAll')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.has(item.id)
                      ? 'bg-poker-gold/10 border-poker-gold'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-poker-gold focus:ring-poker-gold"
                  />
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-poker-gold/20 text-poker-gold text-xs font-bold shrink-0 mt-0.5">
                    #{item.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 dark:text-white font-medium truncate">
                      {item.title}
                    </div>
                    {item.description && (
                      <div className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 line-clamp-1">
                        {item.description}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleSkip}
                className="flex-1 py-3 px-4 rounded-lg font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {tCommon('skip')}
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  isImporting
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-poker-gold text-gray-900 hover:bg-yellow-500'
                }`}
              >
                {isImporting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('importing')}
                  </>
                ) : (
                  <>
                    {t('import')} {selectedIds.size > 0 && `(${selectedIds.size})`}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
