import { describe, it, expect } from 'vitest';
import { normalizeRoomCode, shouldAcceptRoomEvent, getRoomClosedMessageKey } from '../../src/lib/roomEvents';

describe('shouldAcceptRoomEvent', () => {
  it('refuse tout événement sans room active', () => {
    expect(shouldAcceptRoomEvent(null, 'ABC234')).toBe(false);
  });

  it('accepte la room active', () => {
    expect(shouldAcceptRoomEvent('ABC234', 'ABC234')).toBe(true);
  });

  it('refuse une autre room (événement tardif)', () => {
    expect(shouldAcceptRoomEvent('ABC234', 'XYZ789')).toBe(false);
  });

  it('égalité stricte : la casse compte', () => {
    expect(shouldAcceptRoomEvent('ABC234', 'abc234')).toBe(false);
  });
});

describe('normalizeRoomCode', () => {
  it('trim et majuscules', () => {
    expect(normalizeRoomCode('  abc234 ')).toBe('ABC234');
  });

  it('laisse un code déjà normalisé intact', () => {
    expect(normalizeRoomCode('ABC234')).toBe('ABC234');
  });
});

describe('getRoomClosedMessageKey', () => {
  it('po_left → roomClosedByPO', () => {
    expect(getRoomClosedMessageKey('po_left')).toBe('roomClosedByPO');
  });

  it('expired → roomClosedExpired', () => {
    expect(getRoomClosedMessageKey('expired')).toBe('roomClosedExpired');
  });

  it('raison inconnue ou absente → roomClosedGeneric', () => {
    expect(getRoomClosedMessageKey('x')).toBe('roomClosedGeneric');
    expect(getRoomClosedMessageKey(undefined)).toBe('roomClosedGeneric');
    expect(getRoomClosedMessageKey(42)).toBe('roomClosedGeneric');
  });
});
