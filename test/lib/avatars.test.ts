import { describe, it, expect } from 'vitest';
import {
  AVATARS,
  AVATAR_COLORS,
  getAvatarForUser,
  getPOAvatar,
} from '../../src/lib/avatars';

describe('avatars', () => {
  describe('AVATARS', () => {
    it('devrait contenir une liste d\'emojis', () => {
      expect(AVATARS).toBeInstanceOf(Array);
      expect(AVATARS.length).toBeGreaterThan(0);
    });

    it('devrait contenir uniquement des emojis/caractères', () => {
      AVATARS.forEach((avatar) => {
        expect(typeof avatar).toBe('string');
        expect(avatar.length).toBeGreaterThan(0);
      });
    });
  });

  describe('AVATAR_COLORS', () => {
    it('devrait contenir une liste de classes Tailwind', () => {
      expect(AVATAR_COLORS).toBeInstanceOf(Array);
      expect(AVATAR_COLORS.length).toBeGreaterThan(0);
    });

    it('devrait contenir des classes bg-*-500', () => {
      AVATAR_COLORS.forEach((color) => {
        expect(color).toMatch(/^bg-[a-z]+-500$/);
      });
    });
  });

  describe('getAvatarForUser', () => {
    it('devrait retourner un emoji et une couleur', () => {
      const avatar = getAvatarForUser('user-123');

      expect(avatar).toHaveProperty('emoji');
      expect(avatar).toHaveProperty('color');
      expect(typeof avatar.emoji).toBe('string');
      expect(typeof avatar.color).toBe('string');
    });

    it('devrait retourner un emoji de la liste AVATARS', () => {
      const avatar = getAvatarForUser('user-456');

      expect(AVATARS).toContain(avatar.emoji);
    });

    it('devrait retourner une couleur de la liste AVATAR_COLORS', () => {
      const avatar = getAvatarForUser('user-789');

      expect(AVATAR_COLORS).toContain(avatar.color);
    });

    it('devrait être déterministe (même userId = même avatar)', () => {
      const avatar1 = getAvatarForUser('same-user');
      const avatar2 = getAvatarForUser('same-user');

      expect(avatar1).toEqual(avatar2);
    });

    it('devrait générer des avatars différents pour des userIds différents', () => {
      const avatars = new Set<string>();
      const userIds = ['user-a', 'user-b', 'user-c', 'user-d', 'user-e'];

      userIds.forEach((userId) => {
        const avatar = getAvatarForUser(userId);
        avatars.add(`${avatar.emoji}-${avatar.color}`);
      });

      // Au moins quelques avatars devraient être différents
      expect(avatars.size).toBeGreaterThan(1);
    });

    it('devrait gérer les chaînes vides', () => {
      const avatar = getAvatarForUser('');

      expect(avatar).toHaveProperty('emoji');
      expect(avatar).toHaveProperty('color');
    });

    it('devrait gérer les UUIDs', () => {
      const avatar = getAvatarForUser('550e8400-e29b-41d4-a716-446655440000');

      expect(avatar).toHaveProperty('emoji');
      expect(avatar).toHaveProperty('color');
      expect(AVATARS).toContain(avatar.emoji);
      expect(AVATAR_COLORS).toContain(avatar.color);
    });
  });

  describe('getPOAvatar', () => {
    it('devrait retourner la couronne pour le PO', () => {
      const avatar = getPOAvatar();

      expect(avatar.emoji).toBe('👑');
    });

    it('devrait retourner la couleur dorée', () => {
      const avatar = getPOAvatar();

      expect(avatar.color).toBe('bg-poker-gold');
    });

    it('devrait toujours retourner le même avatar', () => {
      const avatar1 = getPOAvatar();
      const avatar2 = getPOAvatar();

      expect(avatar1).toEqual(avatar2);
    });
  });
});
