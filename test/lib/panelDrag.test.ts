import { describe, it, expect } from 'vitest';
import { PANEL_DRAG_MIME, isPanelDrag } from '../../src/lib/panelDrag';

describe('panelDrag', () => {
  it('retourne false pour un drag qui n\'est pas un panneau', () => {
    expect(isPanelDrag(['text/plain'])).toBe(false);
  });

  it('retourne true quand le type MIME dédié est présent', () => {
    expect(isPanelDrag([PANEL_DRAG_MIME, 'text/plain'])).toBe(true);
  });

  it('retourne false pour null / undefined', () => {
    expect(isPanelDrag(null)).toBe(false);
    expect(isPanelDrag(undefined)).toBe(false);
  });

  it('accepte un objet de type DOMStringList', () => {
    expect(isPanelDrag({ length: 1, 0: PANEL_DRAG_MIME })).toBe(true);
    expect(isPanelDrag({ length: 1, 0: 'text/plain' })).toBe(false);
  });
});
