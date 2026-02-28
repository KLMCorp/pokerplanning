/**
 * Configuration du deck par défaut
 * Conforme aux spécifications du cahier des charges
 */

import { DeckConfig } from '@/types';

/**
 * Deck de Planning Poker par défaut
 * Valeurs: 0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, coffee (pause)
 */
export const DEFAULT_DECK: DeckConfig = {
  cards: [
    { value: '0', label: '0' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '5', label: '5' },
    { value: '8', label: '8' },
    { value: '13', label: '13' },
    { value: '20', label: '20' },
    { value: '40', label: '40' },
    { value: '100', label: '100' },
    { value: '?', label: '?' },
    { value: 'coffee', label: '☕' },
  ],
  backImageUrl: undefined,
};

/**
 * Configuration des couleurs pour les cartes
 * bg = classe Tailwind pour le fond
 * color = couleur hex pour le texte (utilisée en inline style pour éviter les conflits dark mode)
 */
export const CARD_STYLES: Record<string, { bg: string; color: string }> = {
  '0': { bg: 'bg-gray-100', color: '#1f2937' },
  '1': { bg: 'bg-green-100', color: '#166534' },
  '2': { bg: 'bg-green-200', color: '#14532d' },
  '3': { bg: 'bg-blue-100', color: '#1e40af' },
  '5': { bg: 'bg-blue-200', color: '#1e3a8a' },
  '8': { bg: 'bg-yellow-100', color: '#854d0e' },
  '13': { bg: 'bg-yellow-200', color: '#713f12' },
  '20': { bg: 'bg-orange-100', color: '#9a3412' },
  '40': { bg: 'bg-orange-200', color: '#7c2d12' },
  '100': { bg: 'bg-red-100', color: '#991b1b' },
  '?': { bg: 'bg-purple-100', color: '#6b21a8' },
  'coffee': { bg: 'bg-amber-100', color: '#92400e' },
};

const DEFAULT_STYLE = { bg: 'bg-gray-100', color: '#1f2937' };

/**
 * Descriptions des cartes pour les tooltips
 */
export const CARD_DESCRIPTIONS: Record<string, string> = {
  '0': 'Même pas un effort',
  '1': 'Un café et c\'est reglé',
  '2': 'Une mini-quête annexe',
  '3': 'Pas bien méchant',
  '5': 'ça commence à se voir',
  '8': 'Une petite épopée',
  '13': 'ça pique un peu',
  '20': 'Gros morceau à avaler',
  '40': 'Un gros projet dans le projet',
  '100': 'Force et honneur',
  '?': 'Je ne sais pas',
  'coffee': 'Besoin d\'une pause',
};

/**
 * Récupère la description d'une carte
 */
export function getCardDescription(value: string): string | undefined {
  return CARD_DESCRIPTIONS[value];
}

/**
 * Récupère le style d'une carte (fond + couleur texte)
 */
export function getCardStyle(value: string): { bg: string; color: string } {
  return CARD_STYLES[value] || DEFAULT_STYLE;
}

/**
 * @deprecated Utiliser getCardStyle à la place
 */
export function getCardColor(value: string): string {
  const style = CARD_STYLES[value] || DEFAULT_STYLE;
  return style.bg;
}
