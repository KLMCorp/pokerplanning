'use client';

/**
 * Page Backlog - Gestion du backlog personnel
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { useConfirm } from '@/components/ConfirmDialog';
import { BacklogItem } from '@/types';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import BacklogForm from '@/components/BacklogForm';

export default function BacklogPage() {
  const router = useRouter();
  const t = useTranslations('backlog');
  const tCommon = useTranslations('common');
  const { account, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { getBacklogItems, createBacklogItem, updateBacklogItem, deleteBacklogItem, reorderBacklogItem } = useSocket();
  const { confirm } = useConfirm();

  const [items, setItems] = useState<BacklogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BacklogItem | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Drag and drop state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  const loadItems = useCallback(async () => {
    const fetchedItems = await getBacklogItems();
    setItems(fetchedItems);
    setIsLoading(false);
  }, [getBacklogItems]);

  useEffect(() => {
    if (isAuthenticated) {
      loadItems();
    }
  }, [isAuthenticated, loadItems]);

  // Drag and drop handlers — doivent être avant les early returns
  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    setDraggedItemId(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedItemId(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverIndex(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    dragCounter.current = 0;

    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;

    const currentPending = items.filter((i) => !i.estimatedPoints);
    const draggedItem = currentPending.find((i) => i.id === draggedId);
    if (!draggedItem) return;

    const newPriority = targetIndex + 1; // priority is 1-based
    if (draggedItem.priority === newPriority) return;

    const success = await reorderBacklogItem(draggedId, newPriority);
    if (success) {
      await loadItems();
    }
  }, [items, reorderBacklogItem, loadItems]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-900 dark:text-white">{tCommon('loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated || !account) {
    return null;
  }

  const handleCreate = async (title: string, description?: string) => {
    const item = await createBacklogItem(title, description);
    if (item) {
      setItems((prev) => [...prev, item]);
    }
  };

  const handleUpdate = async (title: string, description?: string) => {
    if (!editingItem) return;
    const success = await updateBacklogItem(editingItem.id, title, description);
    if (success) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? { ...item, title, description, updatedAt: Date.now() }
            : item
        )
      );
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!await confirm({ message: t('confirmDeleteItem') })) return;
    setDeletingId(itemId);
    const success = await deleteBacklogItem(itemId);
    if (success) {
      setItems((prev) => {
        const deletedItem = prev.find((item) => item.id === itemId);
        return prev
          .filter((item) => item.id !== itemId)
          .map((item) =>
            deletedItem && item.priority > deletedItem.priority
              ? { ...item, priority: item.priority - 1 }
              : item
          );
      });
    }
    setDeletingId(null);
  };

  const handleMoveUp = async (item: BacklogItem) => {
    if (item.priority <= 1) return;
    const newPriority = item.priority - 1;
    const success = await reorderBacklogItem(item.id, newPriority);
    if (success) {
      setItems((prev) => {
        const pending = prev.filter((i) => !i.estimatedPoints);
        const estimated = prev.filter((i) => i.estimatedPoints);
        const updated = pending
          .map((i) => {
            if (i.id === item.id) return { ...i, priority: newPriority };
            if (i.priority === newPriority) return { ...i, priority: i.priority + 1 };
            return i;
          })
          .sort((a, b) => a.priority - b.priority);
        return [...updated, ...estimated];
      });
    }
  };

  const handleMoveDown = async (item: BacklogItem) => {
    const pendingItems = items.filter((i) => !i.estimatedPoints);
    const maxPriority = Math.max(...pendingItems.map((i) => i.priority));
    if (item.priority >= maxPriority) return;
    const newPriority = item.priority + 1;
    const success = await reorderBacklogItem(item.id, newPriority);
    if (success) {
      setItems((prev) => {
        const pending = prev.filter((i) => !i.estimatedPoints);
        const estimated = prev.filter((i) => i.estimatedPoints);
        const updated = pending
          .map((i) => {
            if (i.id === item.id) return { ...i, priority: newPriority };
            if (i.priority === newPriority) return { ...i, priority: i.priority - 1 };
            return i;
          })
          .sort((a, b) => a.priority - b.priority);
        return [...updated, ...estimated];
      });
    }
  };

  const openEdit = (item: BacklogItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingItem(undefined);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingItem(undefined);
  };

  // Sélection multiple
  const toggleSelection = (itemId: string) => {
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

  const selectAll = (itemList: BacklogItem[]) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      itemList.forEach((item) => newSet.add(item.id));
      return newSet;
    });
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({ message: t('confirmDeleteItems', { count: selectedIds.size }) })) return;

    setIsDeleting(true);
    const idsToDelete = Array.from(selectedIds);

    for (const id of idsToDelete) {
      await deleteBacklogItem(id);
    }

    setSelectedIds(new Set());
    setIsDeleting(false);
    await loadItems();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const estimatedItems = items.filter((item) => item.estimatedPoints);
  const pendingItems = items.filter((item) => !item.estimatedPoints);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {tCommon('back')}
          </button>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <ThemeToggle size="sm" />
            <button
              onClick={() => router.push('/account')}
              className="text-poker-gold hover:text-yellow-500 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t('myAccount')}
            </button>
            <button
              onClick={logout}
              className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-sm"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Titre et bouton ajouter */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-poker-gold/20 flex items-center justify-center text-2xl">
                📋
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t('itemCount', { count: items.length })}</p>
              </div>
            </div>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-500 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tCommon('add')}
            </button>
          </div>

          {/* Barre de sélection */}
          {selectedIds.size > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('itemsSelected', { count: selectedIds.size })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={deselectAll}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('deleting')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {tCommon('delete')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t('loadingBacklog')}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {t('emptyBacklog')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {t('emptyBacklogDescription')}
            </p>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-500 transition-colors"
            >
              {t('addItem')}
            </button>
          </div>
        )}

        {/* Items a estimer */}
        {!isLoading && pendingItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {t('pending')} ({pendingItems.length})
              </h2>
              <button
                onClick={() => selectAll(pendingItems)}
                className="text-xs text-poker-gold hover:text-yellow-500 transition-colors"
              >
                {tCommon('selectAll')}
              </button>
            </div>
            <div className="space-y-3">
              {pendingItems.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border-2 transition-colors ${
                    selectedIds.has(item.id)
                      ? 'border-poker-gold bg-poker-gold/5'
                      : dragOverIndex === index && draggedItemId !== item.id
                        ? 'border-poker-gold/50 bg-poker-gold/5'
                        : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Drag handle */}
                    <div className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                        <circle cx="9" cy="10" r="1.5" /><circle cx="15" cy="10" r="1.5" />
                        <circle cx="9" cy="15" r="1.5" /><circle cx="15" cy="15" r="1.5" />
                        <circle cx="9" cy="20" r="1.5" /><circle cx="15" cy="20" r="1.5" />
                      </svg>
                    </div>
                    {/* Checkbox */}
                    <label className="flex items-center cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-poker-gold focus:ring-poker-gold cursor-pointer"
                      />
                    </label>
                    {/* Priority badge */}
                    <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-poker-gold/20 text-poker-gold text-xs font-bold shrink-0">
                      #{item.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-gray-900 dark:text-white font-medium truncate">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                        {t('createdOn')} {formatDate(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Move up */}
                      <button
                        onClick={() => handleMoveUp(item)}
                        disabled={index === 0}
                        className="p-1.5 text-gray-400 hover:text-poker-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t('moveUp')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      {/* Move down */}
                      <button
                        onClick={() => handleMoveDown(item)}
                        disabled={index === pendingItems.length - 1}
                        className="p-1.5 text-gray-400 hover:text-poker-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t('moveDown')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-poker-gold transition-colors"
                        title={tCommon('edit')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title={tCommon('delete')}
                      >
                        {deletingId === item.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items estimes */}
        {!isLoading && estimatedItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('estimated')} ({estimatedItems.length})
              </h2>
              <button
                onClick={() => selectAll(estimatedItems)}
                className="text-xs text-poker-gold hover:text-yellow-500 transition-colors"
              >
                {tCommon('selectAll')}
              </button>
            </div>
            <div className="space-y-3">
              {estimatedItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border-2 transition-colors ${
                    selectedIds.has(item.id)
                      ? 'border-poker-gold bg-poker-gold/5'
                      : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <label className="flex items-center cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-poker-gold focus:ring-poker-gold cursor-pointer"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-gray-900 dark:text-white font-medium truncate">
                          {item.title}
                        </h3>
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs rounded-full font-medium">
                          {item.estimatedPoints} pts
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                        {t('estimatedOn')} {item.estimatedAt ? formatDate(item.estimatedAt) : '-'}
                        {item.roomCode && (
                          <span className="ml-2">
                            {t('inRoom')} <span className="font-mono">{item.roomCode}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-2 text-gray-400 hover:text-poker-gold transition-colors"
                        title={tCommon('edit')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        title={tCommon('delete')}
                      >
                        {deletingId === item.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de formulaire */}
      <BacklogForm
        isOpen={showForm}
        onClose={closeForm}
        onSubmit={editingItem ? handleUpdate : handleCreate}
        item={editingItem}
      />
    </div>
  );
}
