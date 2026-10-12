import { describe, it, expect } from 'vitest';
import { removeDeckImage } from '../../src/lib/deckImages';
import type { DeckConfig } from '../../src/types';

function makeDeck(): DeckConfig {
  return {
    backImageUrl: '/uploads/ABC234/back.png',
    cards: [
      { value: '1', label: '1', frontImageUrl: '/uploads/ABC234/card_1.png' },
      { value: '2', label: '2' },
    ],
  };
}

describe('removeDeckImage', () => {
  it('retire le dos', () => {
    const result = removeDeckImage(makeDeck(), { type: 'back' });

    expect(result.backImageUrl).toBeUndefined();
    expect(result.cards[0].frontImageUrl).toBe('/uploads/ABC234/card_1.png');
  });

  it('retire le recto d\'une carte existante', () => {
    const result = removeDeckImage(makeDeck(), { type: 'front', cardValue: '1' });

    expect(result.cards[0].frontImageUrl).toBeUndefined();
    expect(result.backImageUrl).toBe('/uploads/ABC234/back.png');
  });

  it('laisse le deck inchangé pour une carte inexistante', () => {
    const deck = makeDeck();

    expect(removeDeckImage(deck, { type: 'front', cardValue: '999' })).toEqual(deck);
  });

  it('ne mute pas le deck d\'entrée', () => {
    const deck = makeDeck();
    const snapshot = JSON.parse(JSON.stringify(deck));

    const result = removeDeckImage(deck, { type: 'back' });
    removeDeckImage(deck, { type: 'front', cardValue: '1' });

    expect(deck).toEqual(snapshot);
    expect(result).not.toBe(deck);
    expect(result.cards).not.toBe(deck.cards);
  });
});
