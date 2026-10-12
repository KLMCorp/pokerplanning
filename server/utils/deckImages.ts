/**
 * Contrôle des URLs d'images d'un deck envoyé par le client (deck:update).
 * Une room ne peut référencer que : une image déjà présente dans son deck,
 * une image statique (/images/) ou un fichier de son propre dossier d'uploads.
 * Sans cela, un PO pourrait afficher (puis faire supprimer avec la room) le fichier d'un autre.
 */

import type { DeckConfig } from '../../src/types';

/** Ensemble des URLs d'images (dos + rectos) définies dans un deck */
export function collectDeckImageUrls(deck: DeckConfig): Set<string> {
  const urls = new Set<string>();
  if (deck.backImageUrl) urls.add(deck.backImageUrl);
  for (const card of deck.cards) {
    if (card.frontImageUrl) urls.add(card.frontImageUrl);
  }
  return urls;
}

/**
 * Vérifie qu'une URL d'image est autorisée pour la room `roomId`.
 * `currentUrls` = images déjà présentes dans le deck de la room (retrait/conservation toujours permis).
 */
export function isAllowedDeckImageUrl(url: string, roomId: string, currentUrls: Set<string>): boolean {
  const path = url.split('?')[0];

  // Traversée de répertoire, y compris encodée (%2e%2e) ou avec antislash
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (path.includes('..') || decoded.includes('..') || decoded.includes('\\')) return false;

  if (currentUrls.has(url)) return true;
  if (path.startsWith('/images/')) return true;
  if (path.startsWith('/uploads/' + roomId + '/')) return true;
  return false;
}
