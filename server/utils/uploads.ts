/**
 * Nettoyage des fichiers uploadés (public/uploads)
 * Les identifiants viennent du client ou de la base : ils sont validés strictement
 * et le chemin résolu est contrôlé pour empêcher toute traversée de répertoire.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isValidRoomCode } from './roomCode';

export const DEFAULT_UPLOADS_ROOT: string = path.resolve(process.cwd(), 'public', 'uploads');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supprime récursivement un dossier, à condition qu'il soit strictement sous `base`
 */
async function removeDirUnder(base: string, dir: string): Promise<boolean> {
  if (!dir.startsWith(base + path.sep)) return false;
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.error('[uploads] suppression impossible', dir, e);
    return false;
  }
}

/**
 * Supprime les uploads d'une room (<root>/<ROOMID>/)
 * Retourne false si le code est invalide ou si la suppression échoue.
 */
export async function deleteRoomUploads(roomId: string, uploadsRoot: string = DEFAULT_UPLOADS_ROOT): Promise<boolean> {
  if (!isValidRoomCode(roomId)) return false;
  const root = path.resolve(uploadsRoot);
  const dir = path.resolve(root, roomId);
  return removeDirUnder(root, dir);
}

/**
 * Supprime les uploads d'un compte utilisateur (<root>/users/<uuid>/)
 * Retourne false si l'identifiant n'est pas un UUID ou si la suppression échoue.
 */
export async function deleteUserUploads(accountId: string, uploadsRoot: string = DEFAULT_UPLOADS_ROOT): Promise<boolean> {
  if (typeof accountId !== 'string' || !UUID_REGEX.test(accountId)) return false;
  const base = path.resolve(uploadsRoot, 'users');
  const dir = path.resolve(base, accountId);
  return removeDirUnder(base, dir);
}
