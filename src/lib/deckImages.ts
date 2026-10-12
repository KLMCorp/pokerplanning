import type { DeckConfig } from '@/types';

/** Cible d'un retrait d'image dans un deck : le dos commun ou le recto d'une carte */
export type DeckImageTarget = { type: 'back' } | { type: 'front'; cardValue: string };

/**
 * Retourne une copie profonde du deck sans l'image ciblée.
 * Le deck d'entrée n'est jamais muté ; une carte inexistante laisse le deck inchangé.
 */
export function removeDeckImage(deck: DeckConfig, target: DeckImageTarget): DeckConfig {
  const copy: DeckConfig = structuredClone(deck);
  if (target.type === 'back') {
    delete copy.backImageUrl;
  } else {
    const card = copy.cards.find((c) => c.value === target.cardValue);
    if (card) delete card.frontImageUrl;
  }
  return copy;
}
