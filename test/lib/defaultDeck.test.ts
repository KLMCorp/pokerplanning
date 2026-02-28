import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DECK,
  CARD_STYLES,
  CARD_DESCRIPTIONS,
  getCardDescription,
  getCardStyle,
  getCardColor,
} from '../../src/lib/defaultDeck';

describe('defaultDeck', () => {
  describe('DEFAULT_DECK', () => {
    it('devrait contenir 12 cartes', () => {
      expect(DEFAULT_DECK.cards).toHaveLength(12);
    });

    it('devrait contenir les valeurs de Planning Poker standard', () => {
      const values = DEFAULT_DECK.cards.map((c) => c.value);

      expect(values).toContain('0');
      expect(values).toContain('1');
      expect(values).toContain('2');
      expect(values).toContain('3');
      expect(values).toContain('5');
      expect(values).toContain('8');
      expect(values).toContain('13');
      expect(values).toContain('20');
      expect(values).toContain('40');
      expect(values).toContain('100');
      expect(values).toContain('?');
      expect(values).toContain('coffee');
    });

    it('devrait avoir des labels pour chaque carte', () => {
      DEFAULT_DECK.cards.forEach((card) => {
        expect(card.label).toBeDefined();
        expect(typeof card.label).toBe('string');
      });
    });

    it('devrait avoir le label ☕ pour coffee', () => {
      const coffeeCard = DEFAULT_DECK.cards.find((c) => c.value === 'coffee');

      expect(coffeeCard?.label).toBe('☕');
    });

    it('devrait avoir backImageUrl undefined par défaut', () => {
      expect(DEFAULT_DECK.backImageUrl).toBeUndefined();
    });
  });

  describe('CARD_STYLES', () => {
    it('devrait avoir un style pour chaque carte du deck', () => {
      const deckValues = DEFAULT_DECK.cards.map((c) => c.value);

      deckValues.forEach((value) => {
        expect(CARD_STYLES[value]).toBeDefined();
      });
    });

    it('devrait avoir un bg et color pour chaque style', () => {
      Object.values(CARD_STYLES).forEach((style) => {
        expect(style).toHaveProperty('bg');
        expect(style).toHaveProperty('color');
        expect(style.bg).toMatch(/^bg-/);
        expect(style.color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it('devrait avoir des couleurs progressives (vert -> rouge)', () => {
      // Les petites valeurs devraient être vertes, les grandes rouges
      expect(CARD_STYLES['1'].bg).toContain('green');
      expect(CARD_STYLES['100'].bg).toContain('red');
    });
  });

  describe('CARD_DESCRIPTIONS', () => {
    it('devrait avoir une description pour chaque carte du deck', () => {
      const deckValues = DEFAULT_DECK.cards.map((c) => c.value);

      deckValues.forEach((value) => {
        expect(CARD_DESCRIPTIONS[value]).toBeDefined();
      });
    });

    it('devrait avoir des descriptions non vides', () => {
      Object.values(CARD_DESCRIPTIONS).forEach((desc) => {
        expect(typeof desc).toBe('string');
        expect(desc.length).toBeGreaterThan(0);
      });
    });

    it('devrait avoir des descriptions humoristiques', () => {
      expect(CARD_DESCRIPTIONS['0']).toBe('Même pas un effort');
      expect(CARD_DESCRIPTIONS['coffee']).toBe("Besoin d'une pause");
      expect(CARD_DESCRIPTIONS['?']).toBe('Je ne sais pas');
    });
  });

  describe('getCardDescription', () => {
    it('devrait retourner la description pour une valeur valide', () => {
      expect(getCardDescription('5')).toBe("ça commence à se voir");
      expect(getCardDescription('13')).toBe('ça pique un peu');
    });

    it('devrait retourner undefined pour une valeur inconnue', () => {
      expect(getCardDescription('invalid')).toBeUndefined();
      expect(getCardDescription('999')).toBeUndefined();
    });
  });

  describe('getCardStyle', () => {
    it('devrait retourner le style pour une valeur valide', () => {
      const style = getCardStyle('5');

      expect(style).toHaveProperty('bg');
      expect(style).toHaveProperty('color');
      expect(style.bg).toBe('bg-blue-200');
    });

    it('devrait retourner le style par défaut pour une valeur inconnue', () => {
      const style = getCardStyle('invalid');

      expect(style.bg).toBe('bg-gray-100');
      expect(style.color).toBe('#1f2937');
    });

    it('devrait retourner le style pour les cartes spéciales', () => {
      const questionStyle = getCardStyle('?');
      const coffeeStyle = getCardStyle('coffee');

      expect(questionStyle.bg).toBe('bg-purple-100');
      expect(coffeeStyle.bg).toBe('bg-amber-100');
    });
  });

  describe('getCardColor (deprecated)', () => {
    it('devrait retourner la classe bg pour une valeur valide', () => {
      expect(getCardColor('5')).toBe('bg-blue-200');
      expect(getCardColor('100')).toBe('bg-red-100');
    });

    it('devrait retourner la classe bg par défaut pour une valeur inconnue', () => {
      expect(getCardColor('invalid')).toBe('bg-gray-100');
    });
  });
});
