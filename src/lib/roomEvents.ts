/**
 * Logique pure liée aux événements de room (testable sans composant)
 */

/**
 * Normalise un code de room saisi (trim + majuscules), comme le serveur
 */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Un événement de room n'est accepté que s'il concerne la room active du client.
 * Protège contre les événements tardifs d'une ancienne room.
 */
export function shouldAcceptRoomEvent(activeRoomId: string | null, eventRoomId: string): boolean {
  return activeRoomId !== null && activeRoomId === eventRoomId;
}

export type RoomClosedMessageKey = 'roomClosedByPO' | 'roomClosedExpired' | 'roomClosedGeneric';

/**
 * Clé i18n (namespace `room`) du message affiché à la fermeture d'une room
 */
export function getRoomClosedMessageKey(reason: unknown): RoomClosedMessageKey {
  if (reason === 'po_left') return 'roomClosedByPO';
  if (reason === 'expired') return 'roomClosedExpired';
  return 'roomClosedGeneric';
}
