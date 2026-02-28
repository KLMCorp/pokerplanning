'use client';

/**
 * Page Profil - Historique des rooms
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { RoomHistory } from '@/types';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';

export default function ProfilePage() {
  const router = useRouter();
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const { account, isAuthenticated, isLoading, roomHistory, refreshHistory, deleteRoomHistory, logout } = useAuth();
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  // Rafraîchir l'historique au montage
  useEffect(() => {
    if (isAuthenticated) {
      refreshHistory();
    }
  }, [isAuthenticated, refreshHistory]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-900 dark:text-white">{tCommon('loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated || !account) {
    return null;
  }

  const handleDelete = async (historyId: string) => {
    if (!confirm(t('confirmDeleteRoom'))) return;
    setDeletingId(historyId);
    await deleteRoomHistory(historyId);
    setDeletingId(null);
  };

  // Sélection multiple
  const toggleSelection = (roomId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(roomId)) {
        newSet.delete(roomId);
      } else {
        newSet.add(roomId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(roomHistory.map((room) => room.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t('confirmDeleteRooms', { count: selectedIds.size }))) return;

    setIsDeleting(true);
    const idsToDelete = Array.from(selectedIds);

    for (const id of idsToDelete) {
      await deleteRoomHistory(id);
    }

    setSelectedIds(new Set());
    setIsDeleting(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTotalPoints = (room: RoomHistory) => {
    return room.items
      .filter((item) => item.finalScore && !isNaN(parseFloat(item.finalScore)))
      .reduce((sum, item) => sum + parseFloat(item.finalScore!), 0);
  };

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
              onClick={() => router.push('/backlog')}
              className="text-poker-gold hover:text-yellow-500 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {t('backlog')}
            </button>
            <button
              onClick={() => router.push('/account')}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm flex items-center gap-1"
              title={t('myAccount')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-sm"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Profil rapide */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div
              className={`
                w-16 h-16 rounded-full overflow-hidden
                ${account.avatarUrl ? '' : 'bg-poker-gold/20'}
                flex items-center justify-center text-3xl
              `}
            >
              {account.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                account.role === 'po' ? '👔' : '💻'
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{account.name}</h1>
              <p className="text-gray-500 dark:text-gray-400">{account.email}</p>
            </div>
          </div>
        </div>

        {/* Historique des rooms */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('roomHistory')} ({roomHistory.length})
            </h2>
            <div className="flex items-center gap-2">
              {roomHistory.length > 0 && (
                <button
                  onClick={selectAll}
                  className="text-xs text-poker-gold hover:text-yellow-500 transition-colors"
                >
                  {tCommon('selectAll')}
                </button>
              )}
              <button
                onClick={() => refreshHistory()}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-2 transition-colors"
                title={t('refresh')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Barre de sélection */}
          {selectedIds.size > 0 && (
            <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('roomsSelected', { count: selectedIds.size })}
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

          {/* Message si vide */}
          <div className={`${roomHistory.length === 0 ? 'block' : 'hidden'}`}>
            <p className="text-gray-400 dark:text-gray-500 text-center py-8">
              {t('noRoomsInHistory')}
            </p>
          </div>

          {/* Liste des rooms */}
          <div className={`space-y-3 ${roomHistory.length === 0 ? 'hidden' : 'block'}`}>
              {roomHistory.map((room) => (
                <div
                  key={room.id}
                  className={`bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedIds.has(room.id)
                      ? 'border-poker-gold bg-poker-gold/5'
                      : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {/* Room header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors"
                    onClick={() => setExpandedRoom(expandedRoom === room.id ? null : room.id)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <label
                        className="flex items-center cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(room.id)}
                          onChange={() => toggleSelection(room.id)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-poker-gold focus:ring-poker-gold cursor-pointer"
                        />
                      </label>
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                            room.isActive ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                          }`}>
                            {room.roomCode}
                          </span>
                          <div>
                            <div className="text-gray-900 dark:text-white font-medium">
                              {t('itemsEstimated', { count: room.items.length })}
                            </div>
                            <div className="text-gray-500 dark:text-gray-400 text-sm">
                              {formatDate(room.createdAt)}
                              {room.closedAt && ` - ${formatDate(room.closedAt)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-poker-gold font-bold">
                              {getTotalPoints(room)} {t('pts')}
                            </div>
                            <div className="text-gray-500 dark:text-gray-400 text-sm">
                              {t('participants', { count: room.participantCount })}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(room.id);
                            }}
                            disabled={deletingId === room.id}
                            className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          >
                            {deletingId === room.id ? (
                              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${
                              expandedRoom === room.id ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items expandables */}
                  <div className={`overflow-hidden transition-all duration-200 ${expandedRoom === room.id ? 'max-h-[2000px]' : 'max-h-0'}`}>
                    {room.items.length > 0 ? (
                      <div className="border-t border-gray-200 dark:border-gray-600 p-4 space-y-2">
                        {room.items.map((item) => (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="text-gray-900 dark:text-white font-medium">{item.title}</div>
                                <div className={`text-gray-500 dark:text-gray-400 text-sm mt-1 ${item.description ? 'block' : 'hidden'}`}>
                                  {item.description || ' '}
                                </div>
                                <div className={`flex flex-wrap gap-2 mt-2 ${Object.keys(item.votes).length > 0 ? 'block' : 'hidden'}`}>
                                  {Object.entries(item.votes).map(([oderId, vote]) => (
                                    <span
                                      key={oderId}
                                      className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300"
                                    >
                                      {vote.voterName}: {vote.value}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className={`bg-poker-gold text-gray-900 font-bold px-3 py-1 rounded ${item.finalScore ? 'block' : 'hidden'}`}>
                                {item.finalScore || ' '}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-t border-gray-200 dark:border-gray-600 p-4 text-center text-gray-400 dark:text-gray-500">
                        {t('noItemsInRoom')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
        </div>
      </div>
    </div>
  );
}
