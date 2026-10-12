import { describe, it, expect } from 'vitest';
import { collectDeckImageUrls, isAllowedDeckImageUrl } from '../../../server/utils/deckImages';

describe('collectDeckImageUrls', () => {
  it('collecte le dos et les rectos définis', () => {
    const urls = collectDeckImageUrls({
      backImageUrl: '/uploads/ABC234/back.png',
      cards: [
        { value: '1', label: '1', frontImageUrl: '/uploads/ABC234/card_1.png' },
        { value: '2', label: '2' },
      ],
    });

    expect([...urls].sort()).toEqual(['/uploads/ABC234/back.png', '/uploads/ABC234/card_1.png']);
  });

  it('retourne un ensemble vide sans image', () => {
    expect(collectDeckImageUrls({ cards: [{ value: '1', label: '1' }] }).size).toBe(0);
  });
});

describe('isAllowedDeckImageUrl', () => {
  const room = 'ABC234';
  const none = new Set<string>();

  it('autorise une URL déjà présente dans le deck courant', () => {
    const current = new Set(['/uploads/users/u1/card_1.png']);
    expect(isAllowedDeckImageUrl('/uploads/users/u1/card_1.png', room, current)).toBe(true);
  });

  it('autorise un fichier du dossier de la room, avec cache-busting', () => {
    expect(isAllowedDeckImageUrl('/uploads/ABC234/x.png?t=1', room, none)).toBe(true);
  });

  it('refuse un fichier du dossier d\'une autre room', () => {
    expect(isAllowedDeckImageUrl('/uploads/XYZ789/x.png', room, none)).toBe(false);
  });

  it('refuse un fichier d\'utilisateur absent du deck courant', () => {
    expect(isAllowedDeckImageUrl('/uploads/users/autre/avatar.png', room, none)).toBe(false);
  });

  it('autorise les images statiques', () => {
    expect(isAllowedDeckImageUrl('/images/cartes/back/default/BackCarreau.png', room, none)).toBe(true);
  });

  it('refuse la traversée de répertoire (brute, encodée, antislash)', () => {
    expect(isAllowedDeckImageUrl('/uploads/ABC234/../users/x', room, none)).toBe(false);
    expect(isAllowedDeckImageUrl('/uploads/ABC234/%2e%2e/users/x', room, none)).toBe(false);
    expect(isAllowedDeckImageUrl('/uploads/ABC234/..\\users\\x', room, none)).toBe(false);
    // Même présente dans le deck courant, une URL avec traversée reste refusée
    expect(isAllowedDeckImageUrl('/uploads/ABC234/../users/x', room, new Set(['/uploads/ABC234/../users/x']))).toBe(false);
  });

  it('refuse une URL externe', () => {
    expect(isAllowedDeckImageUrl('https://evil.example/x.png', room, none)).toBe(false);
  });
});
