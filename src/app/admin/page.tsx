'use client';

/**
 * Page Super Admin - Visualisation de toutes les données
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import { AdminStats, AdminUserAccount, SessionInfo, RoomHistory, BacklogItem, Room } from '@/types';

type Tab = 'users' | 'sessions' | 'activeRooms' | 'rooms' | 'backlogs';

interface BacklogGroup {
  userId: string;
  userName: string;
  userEmail: string;
  items: BacklogItem[];
}

export default function AdminPage() {
  const router = useRouter();
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const { isAuthenticated, isLoading: authLoading, isServerConnected, logout } = useAuth();
  const {
    isConnected,
    checkAdminAccess,
    adminGetStats,
    adminGetAllUsers,
    adminGetAllSessions,
    adminGetAllRoomHistory,
    adminGetAllBacklogs,
    adminDeleteUser,
    adminRevokeSession,
    adminGetActiveRooms,
  } = useSocket();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [roomHistories, setRoomHistories] = useState<RoomHistory[]>([]);
  const [activeRooms, setActiveRooms] = useState<Room[]>([]);
  const [backlogs, setBacklogs] = useState<BacklogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [expandedBacklogs, setExpandedBacklogs] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRevokeSession, setConfirmRevokeSession] = useState<string | null>(null);

  // Vérifier l'accès admin
  useEffect(() => {
    // Attendre que l'auth soit chargée
    if (authLoading) {
      return;
    }

    // Si pas authentifié, rediriger
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    // Attendre la connexion socket ET que le serveur reconnaisse la session
    if (!isConnected || !isServerConnected) {
      return;
    }

    // Vérifier l'accès admin
    checkAdminAccess().then((result) => {
      setIsAdmin(result);
      setCheckingAccess(false);
      if (!result) {
        router.push('/');
      }
    });
  }, [authLoading, isAuthenticated, isConnected, isServerConnected, checkAdminAccess, router]);

  // Charger les données
  const loadData = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const [statsData, usersData, sessionsData, roomsData, activeRoomsData, backlogsData] = await Promise.all([
        adminGetStats(),
        adminGetAllUsers(),
        adminGetAllSessions(),
        adminGetAllRoomHistory(),
        adminGetActiveRooms(),
        adminGetAllBacklogs(),
      ]);

      if (statsData) setStats(statsData);
      setUsers(usersData);
      setSessions(sessionsData);
      setRoomHistories(roomsData);
      setActiveRooms(activeRoomsData);
      setBacklogs(backlogsData);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, adminGetStats, adminGetAllUsers, adminGetAllSessions, adminGetAllRoomHistory, adminGetActiveRooms, adminGetAllBacklogs]);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, loadData]);

  const handleDeleteUser = async (userId: string) => {
    const result = await adminDeleteUser(userId);
    if (result.success) {
      setUsers(users.filter((u) => u.id !== userId));
      setConfirmDelete(null);
      // Recharger les stats
      const newStats = await adminGetStats();
      if (newStats) setStats(newStats);
    }
  };

  const handleRevokeSession = async (token: string) => {
    const success = await adminRevokeSession(token);
    if (success) {
      setSessions(sessions.filter((s) => s.token !== token));
      setConfirmRevokeSession(null);
      // Recharger les stats
      const newStats = await adminGetStats();
      if (newStats) setStats(newStats);
    }
  };

  const toggleRoom = (roomId: string) => {
    const newExpanded = new Set(expandedRooms);
    if (newExpanded.has(roomId)) {
      newExpanded.delete(roomId);
    } else {
      newExpanded.add(roomId);
    }
    setExpandedRooms(newExpanded);
  };

  const toggleBacklog = (userId: string) => {
    const newExpanded = new Set(expandedBacklogs);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedBacklogs(newExpanded);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (authLoading || !isConnected || !isServerConnected || checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-900 dark:text-white">{tCommon('loading')}</div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {tCommon('back')}
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {t('title')}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadData}
              disabled={loading}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title={tCommon('refresh')}
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <LanguageToggle />
            <ThemeToggle size="sm" />
            <button
              onClick={logout}
              className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-sm"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalUsers}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t('totalUsers')}</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">+{stats.usersToday} {t('today')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.totalRooms}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t('totalRoomsHistory')}</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">+{stats.roomsToday} {t('today')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{activeRooms.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t('activeRoomsCount')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.totalItems}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t('totalItemsEstimated')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.activeSessions}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t('activeSessions')}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(['users', 'sessions', 'activeRooms', 'rooms', 'backlogs'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-poker-gold border-b-2 border-poker-gold bg-gray-50 dark:bg-gray-700/50'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab === 'activeRooms' ? t('tabActiveRooms') : t(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-600">
                  {tab === 'users' && users.length}
                  {tab === 'sessions' && sessions.length}
                  {tab === 'activeRooms' && activeRooms.length}
                  {tab === 'rooms' && roomHistories.length}
                  {tab === 'backlogs' && backlogs.length}
                </span>
              </button>
            ))}
          </div>

          <div className="p-4">
            {loading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {tCommon('loading')}
              </div>
            ) : (
              <>
                {/* Users Tab */}
                {activeTab === 'users' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('name')}</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('email')}</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('role')}</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('created')}</th>
                          <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">{t('sessions')}</th>
                          <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">{t('rooms')}</th>
                          <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">{t('backlogItems')}</th>
                          <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">{user.name}</td>
                            <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{user.email ? `${user.email.split('@')[0].slice(0, 3)}***@${user.email.split('@')[1] || ''}` : '-'}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                user.role === 'po'
                                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                                  : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                              }`}>
                                {user.role.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                              {formatDate(user.createdAt)}
                            </td>
                            <td className="py-2 px-3 text-center text-gray-600 dark:text-gray-400">{user.sessionCount}</td>
                            <td className="py-2 px-3 text-center text-gray-600 dark:text-gray-400">{user.roomCount}</td>
                            <td className="py-2 px-3 text-center text-gray-600 dark:text-gray-400">{user.backlogCount}</td>
                            <td className="py-2 px-3 text-right">
                              {confirmDelete === user.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                                  >
                                    {t('confirm')}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-xs px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                                  >
                                    {tCommon('cancel')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(user.id)}
                                  className="text-red-500 hover:text-red-600 text-xs"
                                >
                                  {tCommon('delete')}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {users.length === 0 && (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {t('noUsers')}
                      </div>
                    )}
                  </div>
                )}

                {/* Sessions Tab */}
                {activeTab === 'sessions' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('token')}</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('user')}</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('created')}</th>
                          <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">{t('lastUsed')}</th>
                          <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session.token} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="py-2 px-3 font-mono text-xs text-gray-600 dark:text-gray-400">{session.token.slice(0, 8)}...{session.token.slice(-4)}</td>
                            <td className="py-2 px-3">
                              <div className="text-gray-900 dark:text-white">{session.userName}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{session.userEmail ? `${session.userEmail.split('@')[0].slice(0, 3)}***@${session.userEmail.split('@')[1] || ''}` : '-'}</div>
                            </td>
                            <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                              {formatDate(session.createdAt)}
                            </td>
                            <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">
                              {formatDate(session.lastUsedAt)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {confirmRevokeSession === session.token ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleRevokeSession(session.token)}
                                    className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                                  >
                                    {t('confirm')}
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevokeSession(null)}
                                    className="text-xs px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                                  >
                                    {tCommon('cancel')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmRevokeSession(session.token)}
                                  className="text-red-500 hover:text-red-600 text-xs"
                                >
                                  {t('revoke')}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sessions.length === 0 && (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {t('noSessions')}
                      </div>
                    )}
                  </div>
                )}

                {/* Active Rooms Tab */}
                {activeTab === 'activeRooms' && (
                  <div className="space-y-3">
                    {activeRooms.map((room) => {
                      const now = Date.now();
                      const timeRemaining = room.expiresAt ? room.expiresAt - now : 0;
                      const isExpiringSoon = timeRemaining > 0 && timeRemaining < 30 * 60 * 1000; // < 30 min

                      const formatTimeRemaining = (ms: number) => {
                        if (ms <= 0) return t('expired');
                        const hours = Math.floor(ms / (1000 * 60 * 60));
                        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
                        if (hours > 0) {
                          return `${hours}h ${minutes}min`;
                        }
                        return `${minutes}min`;
                      };

                      return (
                        <div
                          key={room.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="px-3 py-1 text-sm rounded font-mono bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                                {room.id}
                              </span>
                              <span className="text-gray-900 dark:text-white font-medium">
                                {room.users[room.poUserId]?.name || t('unknownPO')}
                              </span>
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                {Object.keys(room.users).length} {t('participants')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 text-xs rounded ${
                                room.state === 'voting'
                                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                  : room.state === 'revealed'
                                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                              }`}>
                                {room.state === 'voting' ? t('stateVoting') : room.state === 'revealed' ? t('stateRevealed') : t('stateIdle')}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t('createdAt')}</div>
                              <div className="text-gray-900 dark:text-white">{formatDate(room.createdAt)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t('expiresAt')}</div>
                              <div className="text-gray-900 dark:text-white">{room.expiresAt ? formatDate(room.expiresAt) : '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t('timeRemaining')}</div>
                              <div className={`font-medium ${
                                timeRemaining <= 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : isExpiringSoon
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-green-600 dark:text-green-400'
                              }`}>
                                {formatTimeRemaining(timeRemaining)}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t('itemsCount')}</div>
                              <div className="text-gray-900 dark:text-white">{room.items.length} items</div>
                            </div>
                          </div>

                          {/* Liste des participants */}
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('participants')}:</div>
                            <div className="flex flex-wrap gap-2">
                              {Object.values(room.users).map((user) => (
                                <span
                                  key={user.id}
                                  className={`px-2 py-0.5 text-xs rounded ${
                                    user.id === room.poUserId
                                      ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  {user.name} {user.id === room.poUserId && '(PO)'}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {activeRooms.length === 0 && (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {t('noActiveRooms')}
                      </div>
                    )}
                  </div>
                )}

                {/* Rooms Tab */}
                {activeTab === 'rooms' && (
                  <div className="space-y-2">
                    {roomHistories.map((room) => (
                      <div
                        key={room.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleRoom(room.id)}
                          className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 text-xs rounded font-mono ${
                              room.isActive
                                ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                            }`}>
                              {room.roomCode}
                            </span>
                            <span className="text-gray-900 dark:text-white">{room.creatorName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {room.participantCount} {t('participants')} | {room.items.length} items
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(room.createdAt)}
                            </span>
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${expandedRooms.has(room.id) ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {expandedRooms.has(room.id) && room.items.length > 0 && (
                          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-gray-600 dark:text-gray-400 text-xs">
                                  <th className="text-left py-1">{t('itemTitle')}</th>
                                  <th className="text-center py-1">{t('finalScore')}</th>
                                  <th className="text-center py-1">{t('votes')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {room.items.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700/50">
                                    <td className="py-2 text-gray-900 dark:text-white">{item.title}</td>
                                    <td className="py-2 text-center">
                                      <span className="px-2 py-0.5 bg-poker-gold/20 text-poker-gold rounded text-sm font-medium">
                                        {item.finalScore || '-'}
                                      </span>
                                    </td>
                                    <td className="py-2 text-center text-gray-500 dark:text-gray-400 text-xs">
                                      {Object.values(item.votes).map((v) => v.value).join(', ') || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {expandedRooms.has(room.id) && room.items.length === 0 && (
                          <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400 text-sm">
                            {t('noItems')}
                          </div>
                        )}
                      </div>
                    ))}
                    {roomHistories.length === 0 && (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {t('noRooms')}
                      </div>
                    )}
                  </div>
                )}

                {/* Backlogs Tab */}
                {activeTab === 'backlogs' && (
                  <div className="space-y-2">
                    {backlogs.map((group) => (
                      <div
                        key={group.userId}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleBacklog(group.userId)}
                          className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-gray-900 dark:text-white font-medium">{group.userName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{group.userEmail}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {group.items.length} items
                            </span>
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${expandedBacklogs.has(group.userId) ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {expandedBacklogs.has(group.userId) && (
                          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-gray-600 dark:text-gray-400 text-xs">
                                  <th className="text-left py-1">{t('itemTitle')}</th>
                                  <th className="text-center py-1">{t('points')}</th>
                                  <th className="text-left py-1">{t('room')}</th>
                                  <th className="text-left py-1">{t('created')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700/50">
                                    <td className="py-2 text-gray-900 dark:text-white">{item.title}</td>
                                    <td className="py-2 text-center">
                                      {item.estimatedPoints ? (
                                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded text-xs">
                                          {item.estimatedPoints} pts
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="py-2 text-gray-500 dark:text-gray-400 text-xs font-mono">
                                      {item.roomCode || '-'}
                                    </td>
                                    <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">
                                      {formatDate(item.createdAt)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                    {backlogs.length === 0 && (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {t('noBacklogs')}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          {t('adminOnly')}
        </div>
      </div>
    </div>
  );
}
