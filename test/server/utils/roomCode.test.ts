import { describe, it, expect } from 'vitest';
import { normalizeRoomCode, isValidRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../server/utils/roomCode';

describe('roomCode', () => {
  describe('constantes', () => {
    it('alphabet sans I, O, 0, 1 et longueur 6', () => {
      expect(ROOM_CODE_LENGTH).toBe(6);
      for (const forbidden of ['I', 'O', '0', '1']) {
        expect(ROOM_CODE_ALPHABET).not.toContain(forbidden);
      }
    });
  });

  describe('normalizeRoomCode', () => {
    it('trim puis majuscules', () => {
      expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
      expect(normalizeRoomCode('\tAbC234\n')).toBe('ABC234');
    });
  });

  describe('isValidRoomCode', () => {
    it('accepte des codes valides', () => {
      expect(isValidRoomCode('ABC234')).toBe(true);
      expect(isValidRoomCode('ZZZZZZ')).toBe(true);
      expect(isValidRoomCode('222222')).toBe(true);
    });

    it('refuse les minuscules (code non normalisé)', () => {
      expect(isValidRoomCode('abc234')).toBe(false);
    });

    it('refuse I, O, 0 et 1', () => {
      expect(isValidRoomCode('ABCDE1')).toBe(false);
      expect(isValidRoomCode('ABCDE0')).toBe(false);
      expect(isValidRoomCode('ABCDEI')).toBe(false);
      expect(isValidRoomCode('ABCDEO')).toBe(false);
    });

    it('refuse les mauvaises longueurs et les caractères interdits', () => {
      expect(isValidRoomCode('ABCDE')).toBe(false);
      expect(isValidRoomCode('ABCDEFG')).toBe(false);
      expect(isValidRoomCode('')).toBe(false);
      expect(isValidRoomCode('../x')).toBe(false);
      expect(isValidRoomCode('ABC23\n')).toBe(false);
      expect(isValidRoomCode('ABC 34')).toBe(false);
    });

    it('refuse les valeurs non string', () => {
      expect(isValidRoomCode(undefined as unknown as string)).toBe(false);
      expect(isValidRoomCode(123456 as unknown as string)).toBe(false);
    });
  });
});
