import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteRoomUploads, deleteUserUploads } from '../../../server/utils/uploads';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('uploads', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-uploads-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeDir(...parts: string[]): string {
    const dir = path.join(root, ...parts);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'f.png'), 'x');
    return dir;
  }

  describe('deleteRoomUploads', () => {
    it('supprime <root>/ABC234 et son contenu', async () => {
      const dir = makeDir('ABC234');

      expect(await deleteRoomUploads('ABC234', root)).toBe(true);
      expect(fs.existsSync(dir)).toBe(false);
      expect(fs.existsSync(root)).toBe(true);
    });

    it("refuse les codes invalides sans toucher aux dossiers", async () => {
      const users = makeDir('users');
      const lower = makeDir('abc234');
      const upper = makeDir('ABC234');
      const outside = path.join(path.dirname(root), 'pp-outside-' + path.basename(root));
      fs.mkdirSync(outside, { recursive: true });

      try {
        for (const bad of ['users', 'abc234', 'ABC23', '../ABC234', 'ABCDE1', '../../etc', '', '..']) {
          expect(await deleteRoomUploads(bad, root), bad).toBe(false);
        }
        expect(fs.existsSync(users)).toBe(true);
        expect(fs.existsSync(lower)).toBe(true);
        expect(fs.existsSync(upper)).toBe(true);
        expect(fs.existsSync(outside)).toBe(true);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it('dossier absent → true (force)', async () => {
      expect(await deleteRoomUploads('ABC234', root)).toBe(true);
    });

    it('ne supprime pas les dossiers des autres rooms', async () => {
      const other = makeDir('XYZ789');
      makeDir('ABC234');

      await deleteRoomUploads('ABC234', root);

      expect(fs.existsSync(other)).toBe(true);
    });
  });

  describe('deleteUserUploads', () => {
    it('supprime users/<uuid>', async () => {
      const dir = makeDir('users', USER_ID);
      const sibling = makeDir('users', '223e4567-e89b-12d3-a456-426614174000');

      expect(await deleteUserUploads(USER_ID, root)).toBe(true);
      expect(fs.existsSync(dir)).toBe(false);
      expect(fs.existsSync(sibling)).toBe(true);
    });

    it('refuse un non-UUID et les chemins relatifs', async () => {
      const users = makeDir('users');
      const room = makeDir('ABC234');

      for (const bad of ['not-a-uuid', '..', '../ABC234', '', `${USER_ID}/..`]) {
        expect(await deleteUserUploads(bad, root), bad).toBe(false);
      }
      expect(fs.existsSync(users)).toBe(true);
      expect(fs.existsSync(room)).toBe(true);
    });

    it('dossier absent → true', async () => {
      expect(await deleteUserUploads(USER_ID, root)).toBe(true);
    });
  });
});
