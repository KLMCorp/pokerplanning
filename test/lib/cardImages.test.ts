import { describe, it, expect } from 'vitest';
import { getCardBackUrl, getCardLogoUrl, isSpecialCard, getRandomCardBackUrl } from '../../src/lib/cardImages';

describe('cardImages', () => {
  describe('getCardBackUrl', () => {
    it('devrait générer l\'URL du dos de carte générique', () => {
      const url = getCardBackUrl();

      expect(url).toBe('/images/cartes/back/default/BackCarreau.png');
    });
  });

  describe('getRandomCardBackUrl', () => {
    it('devrait retourner une URL valide de dos de carte', () => {
      const url = getRandomCardBackUrl();

      expect(url).toMatch(/^\/images\/cartes\/back\/default\/Back(Carreau|Coeur|Pique|Trefle)\.png$/);
    });

    it('devrait retourner une des 4 valeurs possibles', () => {
      const validUrls = [
        '/images/cartes/back/default/BackCarreau.png',
        '/images/cartes/back/default/BackCoeur.png',
        '/images/cartes/back/default/BackPique.png',
        '/images/cartes/back/default/BackTrefle.png',
      ];

      for (let i = 0; i < 20; i++) {
        expect(validUrls).toContain(getRandomCardBackUrl());
      }
    });

    it('devrait retourner au moins 2 valeurs différentes sur 50 appels', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        results.add(getRandomCardBackUrl());
      }

      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getCardLogoUrl', () => {
    it('devrait générer l\'URL du logo pour une carte numérique', () => {
      const url = getCardLogoUrl('5');

      expect(url).toBe('/images/cartes/logo/5/Logo5.png');
    });

    it('devrait générer l\'URL avec le dossier "inter" pour "?"', () => {
      const url = getCardLogoUrl('?');

      expect(url).toBe('/images/cartes/logo/inter/LogoInter.png');
    });

    it('devrait générer l\'URL avec le dossier "cafe" pour "coffee"', () => {
      const url = getCardLogoUrl('coffee');

      expect(url).toBe('/images/cartes/logo/cafe/LogoCafe.png');
    });

    it('devrait générer l\'URL pour toutes les valeurs numériques', () => {
      const values = ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100'];

      values.forEach((value) => {
        const url = getCardLogoUrl(value);
        expect(url).toBe(`/images/cartes/logo/${value}/Logo${value.charAt(0).toUpperCase() + value.slice(1)}.png`);
      });
    });
  });

  describe('isSpecialCard', () => {
    it('devrait retourner true pour "?"', () => {
      expect(isSpecialCard('?')).toBe(true);
    });

    it('devrait retourner true pour "coffee"', () => {
      expect(isSpecialCard('coffee')).toBe(true);
    });

    it('devrait retourner false pour les cartes numériques', () => {
      expect(isSpecialCard('5')).toBe(false);
      expect(isSpecialCard('13')).toBe(false);
      expect(isSpecialCard('0')).toBe(false);
    });
  });
});
