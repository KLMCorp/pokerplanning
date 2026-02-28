'use client';

/**
 * Composant ItemList - Liste des items du backlog
 * Permet au PO de gérer les items (créer, modifier, supprimer, réordonner)
 */

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRoom } from '@/hooks/useRoom';
import { useSocket } from '@/contexts/SocketContext';
import { useConfirm } from './ConfirmDialog';
import ItemForm from './ItemForm';

export default function ItemList() {
  const t = useTranslations('itemList');
  const tCommon = useTranslations('common');
  const { items, activeItem, isPO, selectItem } = useRoom();
  const { deleteItem, reorderItem } = useSocket();
  const { confirm } = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; title: string; description: string } | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Drag & drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const handleEdit = (item: { id: string; title: string; description: string }) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = useCallback(async (itemId: string) => {
    const ok = await confirm({ message: t('deleteItem') });
    if (ok) {
      deleteItem(itemId);
    }
  }, [confirm, t, deleteItem]);

  const handleFormClose = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const isExpanded = (itemId: string) => expandedItems.has(itemId);

  // Drag & drop handlers (PO only)
  const handleDragStart = (itemId: string) => {
    setDraggedId(itemId);
  };

  const handleDragEnter = (itemId: string) => {
    dragCounter.current++;
    if (itemId !== draggedId) setDragOverId(itemId);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetItemId: string) => {
    dragCounter.current = 0;
    if (!draggedId || draggedId === targetItemId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const targetItem = items.find(i => i.id === targetItemId);
    if (targetItem) {
      reorderItem(draggedId, targetItem.order);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragCounter.current = 0;
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700 h-full flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
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
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          {t('items', { count: items.length })}
        </h3>

        {isPO && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs bg-poker-gold text-gray-900 px-2 py-1 rounded hover:bg-yellow-500 transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('add')}
          </button>
        )}
      </div>

      {/* Liste des items */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-500 text-sm py-8">
            <svg
              className="w-12 h-12 mx-auto mb-2 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t('noItems')}
            {isPO && <p className="mt-1">{t('addFirstItem')}</p>}
          </div>
        ) : (
          items.map((item) => {
            const isActive = activeItem?.id === item.id;
            const expanded = isExpanded(item.id);
            const needsExpand = item.title.length > 50 || (item.description && item.description.length > 80);

            return (
              <div
                key={item.id}
                draggable={isPO}
                onDragStart={() => isPO && handleDragStart(item.id)}
                onDragEnter={() => isPO && handleDragEnter(item.id)}
                onDragLeave={() => isPO && handleDragLeave()}
                onDragOver={isPO ? handleDragOver : undefined}
                onDrop={() => isPO && handleDrop(item.id)}
                onDragEnd={() => isPO && handleDragEnd()}
                className={`
                  p-3 rounded-lg border-2 transition-all
                  ${isActive
                    ? 'border-poker-gold bg-poker-gold/10'
                    : dragOverId === item.id
                      ? 'border-poker-gold/50 bg-poker-gold/5'
                      : 'border-transparent bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                  ${draggedId === item.id ? 'opacity-40' : ''}
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Poignée de drag (PO uniquement) */}
                  {isPO && (
                    <div className="flex-shrink-0 pt-0.5 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                        <circle cx="9" cy="10" r="1.5" /><circle cx="15" cy="10" r="1.5" />
                        <circle cx="9" cy="15" r="1.5" /><circle cx="15" cy="15" r="1.5" />
                        <circle cx="9" cy="20" r="1.5" /><circle cx="15" cy="20" r="1.5" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`flex-1 min-w-0 ${isPO || needsExpand ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (isPO) {
                        selectItem(item.id);
                      }
                      if (needsExpand) {
                        toggleExpand(item.id);
                      }
                    }}
                  >
                    {/* Titre */}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0 pt-0.5">#{item.order + 1}</span>
                      <h4 className={`text-sm font-medium text-gray-900 dark:text-white ${expanded ? 'break-words' : 'line-clamp-2'}`}>
                        {item.title}
                      </h4>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className={`text-xs text-gray-500 dark:text-gray-400 mt-2 ${expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'}`}>
                        {item.description}
                      </p>
                    )}

                    {/* Bouton deplier/replier */}
                    {needsExpand && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(item.id);
                        }}
                        className="text-[10px] text-poker-gold hover:text-yellow-600 mt-1 flex items-center gap-1"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {expanded ? t('collapse') : t('expand')}
                      </button>
                    )}

                    {/* Score final */}
                    {item.finalScore && (
                      <div className="mt-2">
                        <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                          {t('score', { score: item.finalScore })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions PO */}
                  {isPO && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(item);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        title={tCommon('edit')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title={tCommon('delete')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Indicateur actif */}
                {isActive && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-poker-gold">
                    <span className="w-1.5 h-1.5 bg-poker-gold rounded-full animate-pulse" />
                    {t('activeItem')}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Formulaire de création/édition */}
      {showForm && (
        <ItemForm
          editItem={editingItem}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
