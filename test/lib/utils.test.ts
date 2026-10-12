import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateVoteStatistics,
  getTablePosition,
  formatCardLabel,
  isNumericCard,
  generateId,
  truncate,
  formatRelativeTime,
  copyToClipboard,
  computeVoteHalos,
  deckHasCard,
} from '../../src/lib/utils';

describe('utils', () => {
  describe('calculateVoteStatistics', () => {
    it('devrait calculer les statistiques pour des votes numériques', () => {
      const votes = {
        user1: { value: '3', createdAt: Date.now() },
        user2: { value: '5', createdAt: Date.now() },
        user3: { value: '8', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.totalVotes).toBe(3);
      expect(stats.numericVotes).toEqual([3, 5, 8]);
      expect(stats.min).toBe(3);
      expect(stats.max).toBe(8);
      expect(stats.average).toBe(5.3); // (3+5+8)/3 = 5.333... arrondi à 5.3
      expect(stats.median).toBe(5);
    });

    it('devrait exclure les votes ? et coffee des calculs', () => {
      const votes = {
        user1: { value: '5', createdAt: Date.now() },
        user2: { value: '?', createdAt: Date.now() },
        user3: { value: 'coffee', createdAt: Date.now() },
        user4: { value: '8', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.totalVotes).toBe(4);
      expect(stats.numericVotes).toEqual([5, 8]);
      expect(stats.average).toBe(6.5);
    });

    it('devrait retourner null pour moyenne/médiane si aucun vote numérique', () => {
      const votes = {
        user1: { value: '?', createdAt: Date.now() },
        user2: { value: 'coffee', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.totalVotes).toBe(2);
      expect(stats.numericVotes).toEqual([]);
      expect(stats.average).toBeNull();
      expect(stats.median).toBeNull();
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
    });

    it('devrait calculer la médiane correctement pour un nombre pair de votes', () => {
      const votes = {
        user1: { value: '2', createdAt: Date.now() },
        user2: { value: '4', createdAt: Date.now() },
        user3: { value: '6', createdAt: Date.now() },
        user4: { value: '8', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.median).toBe(5); // (4+6)/2 = 5
    });

    it('devrait calculer la médiane correctement pour un nombre impair de votes', () => {
      const votes = {
        user1: { value: '1', createdAt: Date.now() },
        user2: { value: '3', createdAt: Date.now() },
        user3: { value: '5', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.median).toBe(3);
    });

    it('devrait gérer un seul vote', () => {
      const votes = {
        user1: { value: '13', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.totalVotes).toBe(1);
      expect(stats.average).toBe(13);
      expect(stats.median).toBe(13);
      expect(stats.min).toBe(13);
      expect(stats.max).toBe(13);
    });

    it('devrait gérer des votes vides', () => {
      const stats = calculateVoteStatistics({});

      expect(stats.totalVotes).toBe(0);
      expect(stats.numericVotes).toEqual([]);
      expect(stats.average).toBeNull();
      expect(stats.median).toBeNull();
    });

    it('devrait trier les votes numériques', () => {
      const votes = {
        user1: { value: '20', createdAt: Date.now() },
        user2: { value: '3', createdAt: Date.now() },
        user3: { value: '8', createdAt: Date.now() },
      };

      const stats = calculateVoteStatistics(votes);

      expect(stats.numericVotes).toEqual([3, 8, 20]);
    });
  });

  describe('getTablePosition', () => {
    it('devrait générer une position pour un utilisateur', () => {
      const position = getTablePosition(0, 4, 800, 400);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(position).toHaveProperty('rotation');
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');
      expect(typeof position.rotation).toBe('number');
    });

    it('devrait générer des positions différentes pour des index différents', () => {
      const pos1 = getTablePosition(0, 4, 800, 400);
      const pos2 = getTablePosition(1, 4, 800, 400);

      expect(pos1.x).not.toBe(pos2.x);
      expect(pos1.y).not.toBe(pos2.y);
    });

    it('devrait garder les positions dans les limites de la table', () => {
      for (let i = 0; i < 10; i++) {
        const position = getTablePosition(i, 10, 800, 400);

        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x).toBeLessThanOrEqual(800);
        expect(position.y).toBeGreaterThanOrEqual(0);
        expect(position.y).toBeLessThanOrEqual(400);
      }
    });

    it('devrait placer le premier utilisateur en haut', () => {
      const position = getTablePosition(0, 4, 800, 400);

      // Premier utilisateur devrait être en haut (y proche de 0)
      expect(position.y).toBeLessThan(200); // moins que la moitié de la hauteur
    });
  });

  describe('formatCardLabel', () => {
    it('devrait retourner l\'emoji café pour "coffee"', () => {
      expect(formatCardLabel('coffee')).toBe('☕');
    });

    it('devrait retourner "?" pour "?"', () => {
      expect(formatCardLabel('?')).toBe('?');
    });

    it('devrait retourner la valeur telle quelle pour les nombres', () => {
      expect(formatCardLabel('5')).toBe('5');
      expect(formatCardLabel('13')).toBe('13');
      expect(formatCardLabel('100')).toBe('100');
    });
  });

  describe('isNumericCard', () => {
    it('devrait retourner true pour les cartes numériques', () => {
      expect(isNumericCard('0')).toBe(true);
      expect(isNumericCard('1')).toBe(true);
      expect(isNumericCard('5')).toBe(true);
      expect(isNumericCard('13')).toBe(true);
      expect(isNumericCard('100')).toBe(true);
    });

    it('devrait retourner false pour "?"', () => {
      expect(isNumericCard('?')).toBe(false);
    });

    it('devrait retourner false pour "coffee"', () => {
      expect(isNumericCard('coffee')).toBe(false);
    });

    it('devrait retourner false pour du texte non numérique', () => {
      expect(isNumericCard('abc')).toBe(false);
      expect(isNumericCard('')).toBe(false);
    });
  });

  describe('generateId', () => {
    it('devrait générer une chaîne de 7 caractères', () => {
      const id = generateId();

      expect(typeof id).toBe('string');
      expect(id).toHaveLength(7);
    });

    it('devrait générer des IDs uniques', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }

      expect(ids.size).toBe(100);
    });

    it('devrait contenir uniquement des caractères alphanumériques', () => {
      const id = generateId();

      expect(id).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('truncate', () => {
    it('devrait tronquer un texte long avec ellipse', () => {
      const text = 'Ceci est un texte très long';

      expect(truncate(text, 10)).toBe('Ceci es...');
    });

    it('devrait retourner le texte tel quel si plus court que maxLength', () => {
      const text = 'Court';

      expect(truncate(text, 10)).toBe('Court');
    });

    it('devrait retourner le texte tel quel si égal à maxLength', () => {
      const text = '1234567890';

      expect(truncate(text, 10)).toBe('1234567890');
    });

    it('devrait gérer les textes vides', () => {
      expect(truncate('', 10)).toBe('');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    it('devrait retourner "à l\'instant" pour moins de 60 secondes', () => {
      const timestamp = Date.now() - 30 * 1000; // 30 secondes

      expect(formatRelativeTime(timestamp)).toBe("à l'instant");
    });

    it('devrait retourner les minutes pour moins d\'une heure', () => {
      const timestamp = Date.now() - 5 * 60 * 1000; // 5 minutes

      expect(formatRelativeTime(timestamp)).toBe('il y a 5 min');
    });

    it('devrait retourner les heures pour moins d\'un jour', () => {
      const timestamp = Date.now() - 3 * 60 * 60 * 1000; // 3 heures

      expect(formatRelativeTime(timestamp)).toBe('il y a 3h');
    });

    it('devrait retourner les jours pour plus d\'un jour', () => {
      const timestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 jours

      expect(formatRelativeTime(timestamp)).toBe('il y a 2j');
    });
  });

  describe('copyToClipboard', () => {
    it('devrait copier le texte dans le presse-papier', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      const mockNavigator = {
        clipboard: {
          writeText: mockWriteText,
        },
      };
      vi.stubGlobal('window', { isSecureContext: true });
      vi.stubGlobal('navigator', mockNavigator);

      const result = await copyToClipboard('texte à copier');

      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith('texte à copier');

      vi.unstubAllGlobals();
    });

    it('devrait retourner false en cas d\'erreur', async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error('Failed'));
      const mockNavigator = {
        clipboard: {
          writeText: mockWriteText,
        },
      };
      vi.stubGlobal('window', { isSecureContext: true });
      vi.stubGlobal('navigator', mockNavigator);

      const result = await copyToClipboard('texte');

      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });
  });

  describe('computeVoteHalos', () => {
    it('devrait retourner highest pour le plus grand et lowest pour le plus petit', () => {
      const users = [
        { user: { id: 'u1' }, vote: { value: '3', createdAt: 0 } },
        { user: { id: 'u2' }, vote: { value: '8', createdAt: 0 } },
        { user: { id: 'u3' }, vote: { value: '5', createdAt: 0 } },
      ];
      const halos = computeVoteHalos(users, true);
      expect(halos['u1']).toBe('lowest');
      expect(halos['u2']).toBe('highest');
      expect(halos['u3']).toBeUndefined();
    });

    it('devrait retourner un objet vide si tous les votes sont identiques', () => {
      const users = [
        { user: { id: 'u1' }, vote: { value: '5', createdAt: 0 } },
        { user: { id: 'u2' }, vote: { value: '5', createdAt: 0 } },
      ];
      expect(computeVoteHalos(users, true)).toEqual({});
    });

    it('devrait ignorer les cartes spéciales (? et coffee)', () => {
      const users = [
        { user: { id: 'u1' }, vote: { value: '?', createdAt: 0 } },
        { user: { id: 'u2' }, vote: { value: 'coffee', createdAt: 0 } },
        { user: { id: 'u3' }, vote: { value: '8', createdAt: 0 } },
        { user: { id: 'u4' }, vote: { value: '3', createdAt: 0 } },
      ];
      const halos = computeVoteHalos(users, true);
      expect(halos['u1']).toBeUndefined();
      expect(halos['u2']).toBeUndefined();
      expect(halos['u3']).toBe('highest');
      expect(halos['u4']).toBe('lowest');
    });

    it('devrait retourner un objet vide si isRevealed est false', () => {
      const users = [
        { user: { id: 'u1' }, vote: { value: '3', createdAt: 0 } },
        { user: { id: 'u2' }, vote: { value: '8', createdAt: 0 } },
      ];
      expect(computeVoteHalos(users, false)).toEqual({});
    });

    it('devrait retourner un objet vide si aucun vote numérique', () => {
      const users = [
        { user: { id: 'u1' }, vote: { value: '?', createdAt: 0 } },
      ];
      expect(computeVoteHalos(users, true)).toEqual({});
    });

    it('devrait retourner un objet vide si aucun utilisateur n\'a voté', () => {
      const users = [
        { user: { id: 'u1' } },
        { user: { id: 'u2' } },
      ];
      expect(computeVoteHalos(users, true)).toEqual({});
    });

    it('devrait gérer plusieurs utilisateurs au même max ou même min', () => {
      const users = [
        { user: { id: 'u1' }, vote: { value: '8', createdAt: 0 } },
        { user: { id: 'u2' }, vote: { value: '8', createdAt: 0 } },
        { user: { id: 'u3' }, vote: { value: '3', createdAt: 0 } },
        { user: { id: 'u4' }, vote: { value: '3', createdAt: 0 } },
      ];
      const halos = computeVoteHalos(users, true);
      expect(halos['u1']).toBe('highest');
      expect(halos['u2']).toBe('highest');
      expect(halos['u3']).toBe('lowest');
      expect(halos['u4']).toBe('lowest');
    });
  });
});

describe('deckHasCard', () => {
  const deckWithQuestion = {
    cards: [
      { value: '1', label: '1' },
      { value: '?', label: '?' },
    ],
  };
  const deckWithoutQuestion = { cards: [{ value: '1', label: '1' }, { value: '2', label: '2' }] };

  it('retourne true si le deck contient la carte', () => {
    expect(deckHasCard(deckWithQuestion, '?')).toBe(true);
  });

  it('retourne false si le deck ne contient pas la carte', () => {
    expect(deckHasCard(deckWithoutQuestion, '?')).toBe(false);
  });

  it('retourne false pour null et undefined', () => {
    expect(deckHasCard(null, '?')).toBe(false);
    expect(deckHasCard(undefined, '?')).toBe(false);
  });
});
