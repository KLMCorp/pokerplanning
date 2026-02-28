/**
 * Utilitaires pour les images de cartes
 * Gère les URLs des dos et logos de cartes
 */

// Chemin de base des cartes (configurable via env)
const CARDS_BASE_PATH = process.env.NEXT_PUBLIC_CARDS_PATH || '/images/cartes';

/**
 * Les 4 dos de cartes disponibles
 */
const CARD_BACKS = [
  'BackCarreau.png',
  'BackCoeur.png',
  'BackPique.png',
  'BackTrefle.png',
];

/**
 * Retourne l'URL d'un dos de carte aléatoire
 */
export function getRandomCardBackUrl(): string {
  const index = Math.floor(Math.random() * CARD_BACKS.length);
  return `${CARDS_BASE_PATH}/back/default/${CARD_BACKS[index]}`;
}

/**
 * Construit l'URL du dos de carte générique (premier par défaut)
 */
export function getCardBackUrl(): string {
  return `${CARDS_BASE_PATH}/back/default/${CARD_BACKS[0]}`;
}

/**
 * Construit l'URL du logo de carte à partir de la valeur
 * @param value - Valeur de la carte (0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, coffee)
 */
export function getCardLogoUrl(value: string): string {
  let folderName: string;
  switch (value) {
    case '?':
      folderName = 'inter';
      break;
    case 'coffee':
      folderName = 'cafe';
      break;
    default:
      folderName = value;
  }
  // Capitalize first letter for file name
  const fileName = folderName.charAt(0).toUpperCase() + folderName.slice(1);
  return `${CARDS_BASE_PATH}/logo/${folderName}/Logo${fileName}.png`;
}

/**
 * Vérifie si une carte est "spéciale" (pas de chiffre à afficher)
 * Les cartes spéciales affichent uniquement le logo centré
 */
export function isSpecialCard(value: string): boolean {
  return value === '?' || value === 'coffee';
}
