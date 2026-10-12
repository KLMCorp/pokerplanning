/**
 * Utilitaires sur les codes de room (6 caractères, alphabet sans I/O/0/1)
 * Partagé entre le store (génération) et les handlers/uploads (validation des entrées client).
 */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

// Dérivé de l'alphabet pour rester cohérent avec la génération
const ROOM_CODE_REGEX = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * Normalise un code de room saisi par un client (trim + majuscules)
 */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Vérifie qu'un code (déjà normalisé) respecte strictement le format des codes générés
 */
export function isValidRoomCode(code: string): boolean {
  return typeof code === 'string' && ROOM_CODE_REGEX.test(code);
}
