/**
 * Fonctions utilitaires pour le Planning Poker
 */

import { Vote, VoteStatistics } from '@/types';

/**
 * Calcule les statistiques des votes après reveal
 * Exclut les cartes ? et coffee des calculs numériques
 */
export function calculateVoteStatistics(votes: Record<string, Vote>): VoteStatistics {
  const allVotes = Object.values(votes);
  const totalVotes = allVotes.length;

  // Filtre les votes numériques (exclut ? et coffee)
  const numericVotes = allVotes
    .map((v) => v.value)
    .filter((value) => value !== '?' && value !== 'coffee')
    .map((value) => parseFloat(value))
    .filter((num) => !isNaN(num))
    .sort((a, b) => a - b);

  if (numericVotes.length === 0) {
    return {
      average: null,
      median: null,
      min: null,
      max: null,
      totalVotes,
      numericVotes: [],
    };
  }

  // Calcul de la moyenne
  const sum = numericVotes.reduce((acc, val) => acc + val, 0);
  const average = Math.round((sum / numericVotes.length) * 10) / 10;

  // Calcul de la médiane
  const mid = Math.floor(numericVotes.length / 2);
  const median =
    numericVotes.length % 2 !== 0
      ? numericVotes[mid]
      : Math.round(((numericVotes[mid - 1] + numericVotes[mid]) / 2) * 10) / 10;

  // Min et Max
  const min = numericVotes[0];
  const max = numericVotes[numericVotes.length - 1];

  return {
    average,
    median,
    min,
    max,
    totalVotes,
    numericVotes,
  };
}

/**
 * Génère une position autour de la table pour un utilisateur
 * Distribue les utilisateurs de manière équilibrée
 */
export function getTablePosition(
  index: number,
  total: number,
  tableWidth: number,
  tableHeight: number
): { x: number; y: number; rotation: number } {
  // Distribue les positions autour d'une ellipse
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;

  // Dimensions de l'ellipse (un peu plus petites que la table)
  const radiusX = (tableWidth / 2) * 0.75;
  const radiusY = (tableHeight / 2) * 0.7;

  const x = tableWidth / 2 + radiusX * Math.cos(angle);
  const y = tableHeight / 2 + radiusY * Math.sin(angle);

  // Rotation de la carte pour qu'elle pointe vers le centre
  const rotation = (angle * 180) / Math.PI + 90;

  return { x, y, rotation };
}

/**
 * Formate le label d'une carte
 */
export function formatCardLabel(value: string): string {
  if (value === 'coffee') return '☕';
  if (value === '?') return '?';
  return value;
}

/**
 * Vérifie si une valeur de carte est numérique
 */
export function isNumericCard(value: string): boolean {
  return value !== '?' && value !== 'coffee' && !isNaN(parseFloat(value));
}

/**
 * Génère un identifiant unique simple
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Tronque un texte avec ellipse
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

interface RelativeTimeTranslations {
  justNow: string;
  minutesAgo: (params: { minutes: number }) => string;
  hoursAgo: (params: { hours: number }) => string;
  daysAgo: (params: { days: number }) => string;
}

const defaultRelativeTimeTranslations: RelativeTimeTranslations = {
  justNow: 'à l\'instant',
  minutesAgo: ({ minutes }) => `il y a ${minutes} min`,
  hoursAgo: ({ hours }) => `il y a ${hours}h`,
  daysAgo: ({ days }) => `il y a ${days}j`,
};

/**
 * Formate une date relative (il y a X minutes)
 * Accepte un objet de traduction optionnel pour l'i18n
 */
export function formatRelativeTime(timestamp: number, translations?: RelativeTimeTranslations): string {
  const t = translations || defaultRelativeTimeTranslations;
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return t.justNow;
  if (seconds < 3600) return t.minutesAgo({ minutes: Math.floor(seconds / 60) });
  if (seconds < 86400) return t.hoursAgo({ hours: Math.floor(seconds / 3600) });
  return t.daysAgo({ days: Math.floor(seconds / 86400) });
}

/**
 * Copie un texte dans le presse-papier
 * Utilise navigator.clipboard si disponible (HTTPS), sinon fallback execCommand (HTTP)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Méthode moderne (HTTPS uniquement)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback si échec
    }
  }

  // Fallback pour HTTP : utiliser execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch {
    return false;
  }
}
