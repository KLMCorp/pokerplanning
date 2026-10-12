/**
 * Identification des glisser-déposer de panneaux (distincts des drags d'items).
 * Le type MIME dédié permet à RoomGridLayout/GridPanel d'ignorer tout autre drag.
 */
export const PANEL_DRAG_MIME = 'application/x-pokerplanning-panel';

/** Retourne true si le drag en cours est un drag de panneau (dataTransfer.types). */
export function isPanelDrag(
  types: ReadonlyArray<string> | { length: number; [i: number]: string } | null | undefined
): boolean {
  return Array.from((types ?? []) as ArrayLike<string>).includes(PANEL_DRAG_MIME);
}
