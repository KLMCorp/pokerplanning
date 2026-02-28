import type { RoomPanelId, LayoutConfig } from '@/types';

export const ALL_PANEL_IDS: RoomPanelId[] = [
  'pokerTable',
  'cardPicker',
  'controlsStats',
  'itemList',
  'estimatedItems',
  'userList',
];

export const DEFAULT_LAYOUT: LayoutConfig = [
  ['pokerTable'],
  ['cardPicker'],
  ['controlsStats', 'userList'],
  ['itemList'],
  ['estimatedItems'],
];

/** Max panels per row */
export const MAX_PER_ROW = 2;

/**
 * Fusionne un layout sauvegardé avec les valeurs par défaut.
 * Gère la migration depuis l'ancien format (tableau plat) vers le nouveau (tableau de lignes).
 */
export function mergeLayoutWithDefaults(saved: unknown): LayoutConfig {
  // Migration from old flat format (RoomPanelId[])
  if (Array.isArray(saved) && saved.length > 0 && typeof saved[0] === 'string') {
    const flat = migrateFlatIds(saved as string[]);
    // Convert flat list to rows of 1
    return addMissingPanels(flat.map(id => [id]));
  }

  // New row-based format
  if (Array.isArray(saved) && saved.length > 0 && Array.isArray(saved[0])) {
    const rows = (saved as string[][]).map(row =>
      row.map(id => migrateId(id)).filter((id): id is RoomPanelId => ALL_PANEL_IDS.includes(id as RoomPanelId))
    ).filter(row => row.length > 0);

    // Deduplicate panels (keep first occurrence)
    const seen = new Set<RoomPanelId>();
    const deduped: LayoutConfig = [];
    for (const row of rows) {
      const cleanRow: RoomPanelId[] = [];
      for (const id of row) {
        if (!seen.has(id)) {
          seen.add(id);
          cleanRow.push(id);
        }
      }
      if (cleanRow.length > 0) {
        deduped.push(cleanRow);
      }
    }

    return addMissingPanels(deduped);
  }

  return DEFAULT_LAYOUT;
}

function migrateId(id: string): RoomPanelId {
  if (id === 'poControls' || id === 'voteStats') return 'controlsStats';
  return id as RoomPanelId;
}

function migrateFlatIds(flat: string[]): RoomPanelId[] {
  let migrated = flat.map(migrateId);
  // Deduplicate
  migrated = [...new Set(migrated)];
  return migrated.filter(id => ALL_PANEL_IDS.includes(id));
}

/** Add any panels that are in ALL_PANEL_IDS but missing from the layout */
function addMissingPanels(layout: LayoutConfig): LayoutConfig {
  const present = new Set(layout.flat());
  const missing = ALL_PANEL_IDS.filter(id => !present.has(id));
  // Add missing panels as new rows at the end
  return [...layout, ...missing.map(id => [id])];
}
