import { describe, it, expect } from 'vitest';
import {
  ALL_PANEL_IDS,
  DEFAULT_LAYOUT,
  MAX_PER_ROW,
  mergeLayoutWithDefaults,
} from '../../src/lib/defaultLayout';

describe('defaultLayout', () => {
  describe('constantes', () => {
    it('devrait exporter 6 panel IDs', () => {
      expect(ALL_PANEL_IDS).toHaveLength(6);
      expect(ALL_PANEL_IDS).toContain('pokerTable');
      expect(ALL_PANEL_IDS).toContain('cardPicker');
      expect(ALL_PANEL_IDS).toContain('controlsStats');
      expect(ALL_PANEL_IDS).toContain('itemList');
      expect(ALL_PANEL_IDS).toContain('estimatedItems');
      expect(ALL_PANEL_IDS).toContain('userList');
    });

    it('devrait avoir un layout par défaut contenant tous les panels', () => {
      const allPanels = DEFAULT_LAYOUT.flat();
      for (const id of ALL_PANEL_IDS) {
        expect(allPanels).toContain(id);
      }
    });

    it('devrait avoir MAX_PER_ROW à 2', () => {
      expect(MAX_PER_ROW).toBe(2);
    });
  });

  describe('mergeLayoutWithDefaults', () => {
    it('devrait retourner le layout par défaut pour null', () => {
      const result = mergeLayoutWithDefaults(null);

      expect(result).toEqual(DEFAULT_LAYOUT);
    });

    it('devrait retourner le layout par défaut pour undefined', () => {
      const result = mergeLayoutWithDefaults(undefined);

      expect(result).toEqual(DEFAULT_LAYOUT);
    });

    it('devrait retourner le layout par défaut pour un tableau vide', () => {
      const result = mergeLayoutWithDefaults([]);

      expect(result).toEqual(DEFAULT_LAYOUT);
    });

    it('devrait retourner le layout par défaut pour une valeur non-tableau', () => {
      const result = mergeLayoutWithDefaults('invalid');

      expect(result).toEqual(DEFAULT_LAYOUT);
    });

    describe('migration ancien format plat', () => {
      it('devrait migrer un tableau plat de panel IDs', () => {
        const flat = ['pokerTable', 'cardPicker', 'controlsStats', 'itemList', 'estimatedItems', 'userList'];

        const result = mergeLayoutWithDefaults(flat);

        // Chaque panel dans sa propre ligne
        const allPanels = result.flat();
        for (const id of ALL_PANEL_IDS) {
          expect(allPanels).toContain(id);
        }
      });

      it('devrait migrer les anciens IDs (poControls -> controlsStats)', () => {
        const flat = ['pokerTable', 'poControls', 'cardPicker'];

        const result = mergeLayoutWithDefaults(flat);
        const allPanels = result.flat();

        expect(allPanels).toContain('controlsStats');
        expect(allPanels).not.toContain('poControls');
      });

      it('devrait migrer les anciens IDs (voteStats -> controlsStats)', () => {
        const flat = ['pokerTable', 'voteStats', 'cardPicker'];

        const result = mergeLayoutWithDefaults(flat);
        const allPanels = result.flat();

        expect(allPanels).toContain('controlsStats');
        expect(allPanels).not.toContain('voteStats');
      });

      it('devrait dédupliquer si poControls et voteStats sont tous les deux présents', () => {
        const flat = ['pokerTable', 'poControls', 'voteStats', 'cardPicker'];

        const result = mergeLayoutWithDefaults(flat);
        const allPanels = result.flat();

        const controlsCount = allPanels.filter(id => id === 'controlsStats').length;
        expect(controlsCount).toBe(1);
      });

      it('devrait ajouter les panels manquants', () => {
        const flat = ['pokerTable', 'cardPicker'];

        const result = mergeLayoutWithDefaults(flat);
        const allPanels = result.flat();

        for (const id of ALL_PANEL_IDS) {
          expect(allPanels).toContain(id);
        }
      });
    });

    describe('format lignes (nouveau)', () => {
      it('devrait accepter un layout en lignes valide', () => {
        const rows = [['pokerTable'], ['cardPicker', 'userList'], ['controlsStats'], ['itemList'], ['estimatedItems']];

        const result = mergeLayoutWithDefaults(rows);
        const allPanels = result.flat();

        for (const id of ALL_PANEL_IDS) {
          expect(allPanels).toContain(id);
        }
      });

      it('devrait filtrer les IDs invalides', () => {
        const rows = [['pokerTable', 'invalidPanel'], ['cardPicker']];

        const result = mergeLayoutWithDefaults(rows);
        const allPanels = result.flat();

        expect(allPanels).not.toContain('invalidPanel');
      });

      it('devrait dédupliquer les panels en double', () => {
        const rows = [['pokerTable'], ['pokerTable', 'cardPicker']];

        const result = mergeLayoutWithDefaults(rows);
        const allPanels = result.flat();

        const pokerCount = allPanels.filter(id => id === 'pokerTable').length;
        expect(pokerCount).toBe(1);
      });

      it('devrait ajouter les panels manquants à la fin', () => {
        const rows = [['pokerTable'], ['cardPicker']];

        const result = mergeLayoutWithDefaults(rows);

        // Les 2 premiers sont ceux du layout d'entrée
        expect(result[0]).toEqual(['pokerTable']);
        expect(result[1]).toEqual(['cardPicker']);
        // Les panels manquants sont ajoutés en fin
        const remaining = result.slice(2).flat();
        expect(remaining).toContain('controlsStats');
        expect(remaining).toContain('itemList');
        expect(remaining).toContain('estimatedItems');
        expect(remaining).toContain('userList');
      });

      it('devrait supprimer les lignes vides après filtrage', () => {
        const rows = [['invalidPanel'], ['pokerTable']];

        const result = mergeLayoutWithDefaults(rows);

        // Aucune ligne vide
        for (const row of result) {
          expect(row.length).toBeGreaterThan(0);
        }
      });

      it('devrait migrer les anciens IDs dans le format lignes', () => {
        const rows = [['pokerTable'], ['poControls', 'cardPicker']];

        const result = mergeLayoutWithDefaults(rows);
        const allPanels = result.flat();

        expect(allPanels).toContain('controlsStats');
        expect(allPanels).not.toContain('poControls');
      });

      it('devrait supprimer une ligne entièrement composée de doublons', () => {
        // La 2ème ligne contient uniquement des panels déjà présents dans la 1ère
        const rows = [['pokerTable', 'cardPicker'], ['pokerTable', 'cardPicker']];

        const result = mergeLayoutWithDefaults(rows);

        // Pas de ligne vide dans le résultat
        for (const row of result) {
          expect(row.length).toBeGreaterThan(0);
        }
        // pokerTable et cardPicker apparaissent chacun exactement 1 fois
        const allPanels = result.flat();
        expect(allPanels.filter(id => id === 'pokerTable')).toHaveLength(1);
        expect(allPanels.filter(id => id === 'cardPicker')).toHaveLength(1);
      });
    });
  });
});
