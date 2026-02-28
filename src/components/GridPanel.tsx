'use client';

import React, { useCallback, useState } from 'react';

export type DropZone = 'top' | 'left' | 'right';

interface GridPanelProps {
  children: React.ReactNode;
  panelId: string;
  title: string;
  canDropBeside: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDropZone?: (zone: DropZone) => void;
}

export default React.memo(function GridPanel({
  children,
  panelId,
  title,
  canDropBeside,
  collapsed,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
  onDropZone,
}: GridPanelProps) {
  const [activeZone, setActiveZone] = useState<DropZone | null>(null);

  const getDropZone = useCallback((e: React.DragEvent<HTMLDivElement>): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const relY = y / rect.height;
    const relX = x / rect.width;

    if (relY < 0.2) return 'top';

    if (canDropBeside) {
      return relX < 0.5 ? 'left' : 'right';
    }

    return 'top';
  }, [canDropBeside]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setActiveZone(getDropZone(e));
  }, [getDropZone]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const zone = getDropZone(e);
    setActiveZone(null);
    onDropZone?.(zone);
  }, [getDropZone, onDropZone]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setActiveZone(null);
    }
  }, []);

  const borderClasses = activeZone === 'top'
    ? 'border-t-2 border-t-poker-gold'
    : activeZone === 'left'
      ? 'border-l-2 border-l-poker-gold'
      : activeZone === 'right'
        ? 'border-r-2 border-r-poker-gold'
        : 'border-t-2 border-t-transparent';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      data-panel-id={panelId}
      className={`relative transition-all duration-150 ${borderClasses}`}
    >
      {/* Header bar — always visible */}
      <div className="flex items-center gap-1 px-1 py-1 select-none">
        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Title */}
        <span
          onClick={onToggleCollapse}
          className="text-xs font-medium text-gray-400 dark:text-gray-500 cursor-pointer select-none"
        >
          {title}
        </span>

        {/* Drag handle — pushed to the right */}
        <div className="grid-panel-drag-handle ml-auto p-0.5 rounded opacity-0 hover:opacity-60 transition-opacity text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="4" r="2" />
            <circle cx="16" cy="4" r="2" />
            <circle cx="8" cy="12" r="2" />
            <circle cx="16" cy="12" r="2" />
            <circle cx="8" cy="20" r="2" />
            <circle cx="16" cy="20" r="2" />
          </svg>
        </div>
      </div>

      {/* Content — hidden when collapsed */}
      {!collapsed && children}
    </div>
  );
});
