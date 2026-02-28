'use client';

import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslations } from 'next-intl';
import type { LayoutConfig, RoomPanelId, Room } from '@/types';
import { DEFAULT_LAYOUT, mergeLayoutWithDefaults } from '@/lib/defaultLayout';
import GridPanel, { type DropZone } from './GridPanel';
import PokerTable from './PokerTable';
import CardPicker from './CardPicker';
import POControls from './POControls';
import VoteStats from './VoteStats';
import ItemList from './ItemList';
import EstimatedItems from './EstimatedItems';
import UserList from './UserList';

const STORAGE_KEY = 'pokerPlanning_layoutConfig';
const COLLAPSED_KEY = 'pokerPlanning_collapsedPanels';

interface RoomGridLayoutProps {
  isPO: boolean;
  room: Room;
}

function loadLayout(accountLayoutConfig?: LayoutConfig): LayoutConfig {
  if (accountLayoutConfig) {
    return mergeLayoutWithDefaults(accountLayoutConfig);
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return mergeLayoutWithDefaults(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }

  return DEFAULT_LAYOUT;
}

function loadCollapsed(): Set<RoomPanelId> {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored) return new Set(JSON.parse(stored));
    } catch { /* ignore */ }
  }
  return new Set();
}

/** Remove a panel from the layout and clean up empty rows */
function removePanel(layout: LayoutConfig, panelId: RoomPanelId): LayoutConfig {
  return layout
    .map(row => row.filter(id => id !== panelId))
    .filter(row => row.length > 0);
}

/** Find which row and column a panel is in */
function findPanel(layout: LayoutConfig, panelId: RoomPanelId): { rowIdx: number; colIdx: number } | null {
  for (let rowIdx = 0; rowIdx < layout.length; rowIdx++) {
    const colIdx = layout[rowIdx].indexOf(panelId);
    if (colIdx !== -1) return { rowIdx, colIdx };
  }
  return null;
}

export default function RoomGridLayout({ isPO, room }: RoomGridLayoutProps) {
  const { account, isAuthenticated, updateLayoutConfig } = useAuth();
  const tRoom = useTranslations('room');

  const [layout, setLayout] = useState<LayoutConfig>(() =>
    loadLayout(account?.layoutConfig)
  );

  const [collapsedPanels, setCollapsedPanels] = useState<Set<RoomPanelId>>(loadCollapsed);

  // Responsive maxPerRow: 3 on 2xl screens (>=1536px), 2 otherwise
  const [maxPerRow, setMaxPerRow] = useState(2);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1536px)');
    const update = () => setMaxPerRow(mql.matches ? 3 : 2);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // Sync when account loads/changes
  const serializedAccountLayout = account?.layoutConfig ? JSON.stringify(account.layoutConfig) : undefined;
  const prevAccountLayoutRef = useRef(serializedAccountLayout);
  useEffect(() => {
    if (serializedAccountLayout && serializedAccountLayout !== prevAccountLayoutRef.current) {
      prevAccountLayoutRef.current = serializedAccountLayout;
      if (account?.layoutConfig) {
        setLayout(mergeLayoutWithDefaults(account.layoutConfig));
      }
    }
  }, [serializedAccountLayout, account]);

  // Drag state
  const [draggedPanel, setDraggedPanel] = useState<RoomPanelId | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const saveLayout = useCallback((newLayout: LayoutConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
      if (isAuthenticated) {
        updateLayoutConfig(newLayout);
      }
    }, 500);
  }, [isAuthenticated, updateLayoutConfig]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const toggleCollapse = useCallback((panelId: RoomPanelId) => {
    setCollapsedPanels(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleDragStart = useCallback((panelId: RoomPanelId, e: React.DragEvent) => {
    setDraggedPanel(panelId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', panelId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedPanel(null);
  }, []);

  const handleDropOnPanel = useCallback((targetPanelId: RoomPanelId, zone: DropZone) => {
    if (!draggedPanel || draggedPanel === targetPanelId) return;

    setLayout(prev => {
      const targetPos = findPanel(prev, targetPanelId);
      if (!targetPos) return prev;

      let newLayout = removePanel(prev, draggedPanel);

      const newTargetPos = findPanel(newLayout, targetPanelId);
      if (!newTargetPos) return prev;

      const { rowIdx } = newTargetPos;

      if (zone === 'top') {
        newLayout.splice(rowIdx, 0, [draggedPanel]);
      } else if (zone === 'left') {
        if (newLayout[rowIdx].length < maxPerRow) {
          const colIdx = newLayout[rowIdx].indexOf(targetPanelId);
          newLayout[rowIdx].splice(colIdx, 0, draggedPanel);
        } else {
          newLayout.splice(rowIdx, 0, [draggedPanel]);
        }
      } else if (zone === 'right') {
        if (newLayout[rowIdx].length < maxPerRow) {
          const colIdx = newLayout[rowIdx].indexOf(targetPanelId);
          newLayout[rowIdx].splice(colIdx + 1, 0, draggedPanel);
        } else {
          newLayout.splice(rowIdx + 1, 0, [draggedPanel]);
        }
      }

      saveLayout(newLayout);
      return newLayout;
    });

    setDraggedPanel(null);
  }, [draggedPanel, maxPerRow, saveLayout]);

  const handleDropOnBottom = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedPanel) return;

    setLayout(prev => {
      const newLayout = removePanel(prev, draggedPanel);
      newLayout.push([draggedPanel]);
      saveLayout(newLayout);
      return newLayout;
    });
    setDraggedPanel(null);
  }, [draggedPanel, saveLayout]);

  const handleDragOverBottom = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleReset = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    setCollapsedPanels(new Set());
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COLLAPSED_KEY);
    if (isAuthenticated) {
      updateLayoutConfig(DEFAULT_LAYOUT);
    }
  }, [isAuthenticated, updateLayoutConfig]);

  const panelTitles = useMemo<Record<RoomPanelId, string>>(() => ({
    pokerTable: tRoom('panelTable' as never),
    cardPicker: tRoom('panelCards' as never),
    controlsStats: tRoom('panelControls' as never),
    itemList: tRoom('panelItems' as never),
    estimatedItems: tRoom('panelEstimated' as never),
    userList: tRoom('panelUsers' as never),
  }), [tRoom]);

  // Stable per-panel callback refs — évite de casser React.memo de GridPanel
  const toggleCollapseRef = useRef(toggleCollapse);
  toggleCollapseRef.current = toggleCollapse;
  const handleDragStartRef = useRef(handleDragStart);
  handleDragStartRef.current = handleDragStart;
  const handleDropOnPanelRef = useRef(handleDropOnPanel);
  handleDropOnPanelRef.current = handleDropOnPanel;

  const panelCollapseHandlers = useRef<Map<string, () => void>>(new Map());
  const getPanelCollapseHandler = useCallback((panelId: RoomPanelId) => {
    let handler = panelCollapseHandlers.current.get(panelId);
    if (!handler) {
      handler = () => toggleCollapseRef.current(panelId);
      panelCollapseHandlers.current.set(panelId, handler);
    }
    return handler;
  }, []);

  const panelDragStartHandlers = useRef<Map<string, (e: React.DragEvent) => void>>(new Map());
  const getPanelDragStartHandler = useCallback((panelId: RoomPanelId) => {
    let handler = panelDragStartHandlers.current.get(panelId);
    if (!handler) {
      handler = (e: React.DragEvent) => handleDragStartRef.current(panelId, e);
      panelDragStartHandlers.current.set(panelId, handler);
    }
    return handler;
  }, []);

  const panelDropHandlers = useRef<Map<string, (zone: DropZone) => void>>(new Map());
  const getPanelDropHandler = useCallback((panelId: RoomPanelId) => {
    let handler = panelDropHandlers.current.get(panelId);
    if (!handler) {
      handler = (zone: DropZone) => handleDropOnPanelRef.current(panelId, zone);
      panelDropHandlers.current.set(panelId, handler);
    }
    return handler;
  }, []);

  const renderPanel = useCallback((panelId: RoomPanelId) => {
    switch (panelId) {
      case 'pokerTable': return <PokerTable />;
      case 'cardPicker': return <CardPicker />;
      case 'controlsStats': return (
        <div className={`grid grid-cols-1 ${isPO ? 'md:grid-cols-2' : ''} gap-3`}>
          {isPO && <POControls />}
          <VoteStats />
        </div>
      );
      case 'itemList': return <ItemList />;
      case 'estimatedItems': return <EstimatedItems />;
      case 'userList': return <UserList />;
    }
  }, [isPO]);

  return (
    <div className="relative">
      {/* Reset button */}
      <div className="flex justify-end mb-1">
        <button
          onClick={handleReset}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1"
        >
          <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {tRoom('resetLayout' as never)}
        </button>
      </div>

      <div className="space-y-3">
        {layout.map((row) => {
          const hasTable = row.includes('pokerTable');
          const tableIdx = row.indexOf('pokerTable');
          let gridClass: string;

          if (row.length === 1) {
            gridClass = 'grid-cols-1';
          } else if (row.length === 2) {
            if (hasTable) {
              gridClass = tableIdx === 0 ? 'grid-cols-[1fr_320px]' : 'grid-cols-[320px_1fr]';
            } else {
              gridClass = 'grid-cols-2';
            }
          } else {
            // 3 panels
            if (hasTable) {
              if (tableIdx === 0) {
                gridClass = 'grid-cols-[1fr_280px_280px]';
              } else if (tableIdx === 1) {
                gridClass = 'grid-cols-[280px_1fr_280px]';
              } else {
                gridClass = 'grid-cols-[280px_280px_1fr]';
              }
            } else {
              gridClass = 'grid-cols-3';
            }
          }

          return (
            <div
              key={row.join('-')}
              className={`grid gap-3 ${gridClass}`}
            >
              {row.map(panelId => {
                const canDropBeside = row.length < maxPerRow;
                return (
                  <GridPanel
                    key={panelId}
                    panelId={panelId}
                    title={panelTitles[panelId]}
                    canDropBeside={canDropBeside}
                    collapsed={collapsedPanels.has(panelId)}
                    onToggleCollapse={getPanelCollapseHandler(panelId)}
                    onDragStart={getPanelDragStartHandler(panelId)}
                    onDragEnd={handleDragEnd}
                    onDropZone={getPanelDropHandler(panelId)}
                  >
                    {!collapsedPanels.has(panelId) && renderPanel(panelId)}
                  </GridPanel>
                );
              })}
            </div>
          );
        })}

        {/* Bottom drop zone for dragging panels to the end */}
        {draggedPanel && (
          <div
            onDragOver={handleDragOverBottom}
            onDrop={handleDropOnBottom}
            className="h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 transition-colors"
          >
            ↓
          </div>
        )}
      </div>
    </div>
  );
}
