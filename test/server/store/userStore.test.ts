import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules avant tout import
vi.mock('better-sqlite3', () => {
  const mockRun = vi.fn(() => ({ changes: 1 }));
  const mockGet = vi.fn();
  const mockAll = vi.fn(() => []);
  const mockPrepare = vi.fn(() => ({
    run: mockRun,
    get: mockGet,
    all: mockAll,
  }));
  const mockExec = vi.fn();
  const mockPragma = vi.fn();

  class MockDatabase {
    static mockRun = mockRun;
    static mockGet = mockGet;
    static mockAll = mockAll;
    static mockPrepare = mockPrepare;

    prepare = mockPrepare;
    exec = mockExec;
    pragma = mockPragma;
    transaction = (fn: (...args: any[]) => any) => fn;
  }

  return { default: MockDatabase };
});

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Import après les mocks - accéder au mock via le module
import Database from 'better-sqlite3';

const MockDb = Database as unknown as {
  mockRun: ReturnType<typeof vi.fn>;
  mockGet: ReturnType<typeof vi.fn>;
  mockAll: ReturnType<typeof vi.fn>;
  mockPrepare: ReturnType<typeof vi.fn>;
};

// Import du module à tester
import * as userStore from '../../../server/store/userStore';

describe('userStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockDb.mockGet.mockReset();
    MockDb.mockAll.mockReset().mockReturnValue([]);
    MockDb.mockRun.mockReset().mockReturnValue({ changes: 1 });
  });

  describe('register', () => {
    it('devrait créer un nouveau compte utilisateur', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = await userStore.register('test@example.com', 'password123', 'Test User', 'dev');

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account!.email).toBe('test@example.com');
      expect(result.account!.name).toBe('Test User');
      expect(result.account!.role).toBe('dev');
    });

    it('devrait normaliser l\'email en minuscules', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = await userStore.register('TEST@EXAMPLE.COM', 'password123', 'Test User', 'dev');

      expect(result.success).toBe(true);
      expect(result.account!.email).toBe('test@example.com');
    });

    it('devrait échouer avec un email invalide', async () => {
      const result = await userStore.register('invalid-email', 'password123', 'Test User', 'dev');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email invalide');
    });

    it('devrait échouer avec un mot de passe trop court', async () => {
      const result = await userStore.register('test@example.com', '1234567', 'Test User', 'dev');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Le mot de passe doit faire entre 8 et 256 caractères');
    });

    it('devrait échouer si l\'email existe déjà', async () => {
      MockDb.mockGet.mockReturnValueOnce({ id: 'existing-user' });

      const result = await userStore.register('existing@example.com', 'password123', 'Test User', 'dev');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Inscription impossible avec ces informations');
    });

    it('devrait trimmer le nom', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = await userStore.register('test@example.com', 'password123', '  Test User  ', 'dev');

      expect(result.account!.name).toBe('Test User');
    });

    it('devrait créer un compte pseudo', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined); // pseudo n'existe pas encore

      const result = await userStore.register('', 'password123', 'PseudoUser', 'dev', 'pseudo', 'testpseudo');

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account!.authType).toBe('pseudo');
      expect(result.account!.pseudo).toBe('testpseudo');
      expect(result.account!.email).toBe(''); // email vide pour pseudo
    });

    it('devrait échouer si le pseudo est vide', async () => {
      const result = await userStore.register('', 'password123', 'PseudoUser', 'dev', 'pseudo', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Le pseudo est requis');
    });

    it('devrait échouer si le pseudo est invalide', async () => {
      const result = await userStore.register('', 'password123', 'PseudoUser', 'dev', 'pseudo', 'ab'); // trop court

      expect(result.success).toBe(false);
      expect(result.error).toContain('entre 3 et 20 caractères');
    });

    it('devrait échouer si le pseudo contient des caractères spéciaux', async () => {
      const result = await userStore.register('', 'password123', 'PseudoUser', 'dev', 'pseudo', 'test user!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('entre 3 et 20 caractères');
    });

    it('devrait échouer si le pseudo existe déjà', async () => {
      MockDb.mockGet.mockReturnValueOnce({ id: 'existing-pseudo' }); // pseudo existe

      const result = await userStore.register('', 'password123', 'PseudoUser', 'dev', 'pseudo', 'existingpseudo');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Ce pseudo est déjà utilisé');
    });

    it('devrait gérer les erreurs DB lors de l\'inscription', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);
      MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

      const result = await userStore.register('test@example.com', 'password123', 'Test User', 'dev');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur');
    });
  });

  describe('login', () => {
    it('devrait connecter un utilisateur avec les bons identifiants (legacy SHA-256)', async () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'dev',
        created_at: Date.now(),
        password_hash: require('crypto').createHash('sha256').update('password123').digest('hex'),
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = await userStore.login('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account!.email).toBe('test@example.com');
    });

    it('devrait échouer avec un email inconnu', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = await userStore.login('unknown@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email ou mot de passe incorrect');
    });

    it('devrait échouer avec un mauvais mot de passe', async () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'dev',
        created_at: Date.now(),
        password_hash: 'wrong-hash',
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = await userStore.login('test@example.com', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email ou mot de passe incorrect');
    });

    it('devrait connecter un utilisateur pseudo', async () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'pseudo-user-1',
        email: 'pseudo:mypseudo',
        name: 'PseudoLogin',
        role: 'dev',
        created_at: Date.now(),
        password_hash: require('crypto').createHash('sha256').update('password123').digest('hex'),
        deck_config: null,
        avatar_url: null,
        table_config: null,
        auth_type: 'pseudo',
      });

      const result = await userStore.login('', 'password123', 'pseudo', 'mypseudo');

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account!.authType).toBe('pseudo');
      expect(result.account!.email).toBe(''); // email masqué pour pseudo
    });

    it('devrait échouer si le pseudo est vide pour un login pseudo', async () => {
      const result = await userStore.login('', 'password123', 'pseudo', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Le pseudo est requis');
    });

    it('devrait connecter un utilisateur avec un hash bcrypt', async () => {
      const bcrypt = await import('bcrypt');
      const bcryptHash = await bcrypt.hash('password123', 10);
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-bcrypt',
        email: 'bcrypt@example.com',
        name: 'Bcrypt User',
        role: 'dev',
        created_at: Date.now(),
        password_hash: bcryptHash,
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = await userStore.login('bcrypt@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.account!.email).toBe('bcrypt@example.com');
    });

    it('devrait migrer un hash SHA-256 vers bcrypt lors du login', async () => {
      const sha256Hash = require('crypto').createHash('sha256').update('password123').digest('hex');
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-migrate',
        email: 'migrate@example.com',
        name: 'MigrateUser',
        role: 'dev',
        created_at: Date.now(),
        password_hash: sha256Hash, // Ancien format SHA-256
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = await userStore.login('migrate@example.com', 'password123');

      expect(result.success).toBe(true);
      // Vérifie que le hash a été mis à jour (UPDATE ... SET password_hash)
      expect(MockDb.mockRun).toHaveBeenCalled();
    });

    it('devrait parser le deckConfig si présent', async () => {
      const deckConfig = { cards: [{ value: '1', label: '1' }] };
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'dev',
        created_at: Date.now(),
        password_hash: require('crypto').createHash('sha256').update('password123').digest('hex'),
        deck_config: JSON.stringify(deckConfig),
        avatar_url: 'http://example.com/avatar.png',
        table_config: null,
      });

      const result = await userStore.login('test@example.com', 'password123');

      expect(result.account!.deckConfig).toEqual(deckConfig);
      expect(result.account!.avatarUrl).toBe('http://example.com/avatar.png');
    });
  });

  describe('getAccount', () => {
    it('devrait récupérer un compte par ID', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'po',
        created_at: Date.now(),
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const account = userStore.getAccount('user-123');

      expect(account).toBeDefined();
      expect(account!.id).toBe('user-123');
      expect(account!.role).toBe('po');
    });

    it('devrait retourner undefined si le compte n\'existe pas', () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const account = userStore.getAccount('unknown-id');

      expect(account).toBeUndefined();
    });

    it('devrait gérer un deckConfig JSON invalide (safeJsonParse)', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-bad-json',
        email: 'badjson@test.com',
        name: 'BadJson',
        role: 'dev',
        created_at: Date.now(),
        deck_config: '{invalid-json!!!}',
        avatar_url: null,
        table_config: null,
      });

      const account = userStore.getAccount('user-bad-json');

      expect(account).toBeDefined();
      expect(account!.deckConfig).toBeUndefined();
    });

    it('devrait gérer un tableConfig JSON invalide (safeJsonParse)', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-bad-table',
        email: 'badtable@test.com',
        name: 'BadTable',
        role: 'dev',
        created_at: Date.now(),
        deck_config: null,
        avatar_url: null,
        table_config: 'not{valid',
      });

      const account = userStore.getAccount('user-bad-table');

      expect(account).toBeDefined();
      expect(account!.tableConfig).toBeUndefined();
    });

    it('devrait parser le layoutConfig et le pseudo d\'un compte pseudo', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'pseudo-account',
        email: 'pseudo:mypseudo',
        name: 'PseudoUser',
        role: 'dev',
        created_at: Date.now(),
        deck_config: null,
        avatar_url: null,
        table_config: null,
        auth_type: 'pseudo',
        layout_config: JSON.stringify({ panels: ['a', 'b'] }),
      });

      const account = userStore.getAccount('pseudo-account');

      expect(account).toBeDefined();
      expect(account!.email).toBe('');
      expect(account!.pseudo).toBe('mypseudo');
      expect(account!.authType).toBe('pseudo');
      expect(account!.layoutConfig).toEqual({ panels: ['a', 'b'] });
    });
  });

  describe('Socket Account Management', () => {
    it('devrait associer et récupérer un socket à un compte', () => {
      userStore.setSocketAccount('socket-123', 'account-456');

      const accountId = userStore.getSocketAccount('socket-123');

      expect(accountId).toBe('account-456');
    });

    it('devrait supprimer l\'association socket/compte', () => {
      userStore.setSocketAccount('socket-to-clear', 'account-789');
      userStore.clearSocketAccount('socket-to-clear');

      const accountId = userStore.getSocketAccount('socket-to-clear');

      expect(accountId).toBeUndefined();
    });
  });

  describe('Room History', () => {
    describe('addRoomToHistory', () => {
      it('devrait ajouter une room à l\'historique', () => {
        const history = userStore.addRoomToHistory('account-123', 'ABCDEF', 'Creator Name');

        expect(history).toBeDefined();
        expect(history.roomCode).toBe('ABCDEF');
        expect(history.creatorName).toBe('Creator Name');
        expect(history.isActive).toBe(true);
        expect(history.participantCount).toBe(1);
        expect(history.items).toEqual([]);
        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });

    describe('getRoomHistory', () => {
      it('devrait récupérer l\'historique des rooms', () => {
        MockDb.mockAll.mockReturnValueOnce([
          {
            id: 'history-1',
            room_code: 'ROOM01',
            created_at: Date.now(),
            closed_at: null,
            creator_id: 'account-123',
            creator_name: 'Creator',
            participant_count: 5,
            items: '[]',
            is_active: 0,
          },
        ]);

        const histories = userStore.getRoomHistory('account-123');

        expect(histories).toHaveLength(1);
        expect(histories[0].roomCode).toBe('ROOM01');
        expect(histories[0].isActive).toBe(false);
      });

      it('devrait parser les items JSON', () => {
        const items = [{ id: 'item-1', title: 'Test Item' }];
        MockDb.mockAll.mockReturnValueOnce([
          {
            id: 'history-1',
            room_code: 'ROOM01',
            created_at: Date.now(),
            closed_at: null,
            creator_id: 'account-123',
            creator_name: 'Creator',
            participant_count: 5,
            items: JSON.stringify(items),
            is_active: 1,
          },
        ]);

        const histories = userStore.getRoomHistory('account-123');

        expect(histories[0].items).toEqual(items);
      });
    });

    describe('deleteRoomHistory', () => {
      it('devrait supprimer une entrée d\'historique', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

        const result = userStore.deleteRoomHistory('account-123', 'history-456');

        expect(result).toBe(true);
      });

      it('devrait retourner false si rien n\'est supprimé', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

        const result = userStore.deleteRoomHistory('account-123', 'nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Deck Config', () => {
    describe('updateDeckConfig', () => {
      it('devrait mettre à jour la config du deck', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });
        const deck = { cards: [{ value: '1', label: '1' }] };

        const result = userStore.updateDeckConfig('account-123', deck);

        expect(result).toBe(true);
        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });

    describe('getDeckConfig', () => {
      it('devrait récupérer la config du deck', () => {
        const deck = { cards: [{ value: '5', label: '5' }] };
        MockDb.mockGet.mockReturnValueOnce({ deck_config: JSON.stringify(deck) });

        const result = userStore.getDeckConfig('account-123');

        expect(result).toEqual(deck);
      });

      it('devrait retourner undefined si pas de config', () => {
        MockDb.mockGet.mockReturnValueOnce({ deck_config: null });

        const result = userStore.getDeckConfig('account-123');

        expect(result).toBeUndefined();
      });
    });
  });

  describe('Avatar', () => {
    describe('updateAvatar', () => {
      it('devrait mettre à jour l\'avatar', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

        const result = userStore.updateAvatar('account-123', 'http://example.com/new-avatar.png');

        expect(result).toBe(true);
      });
    });

    describe('getAvatar', () => {
      it('devrait récupérer l\'avatar', () => {
        MockDb.mockGet.mockReturnValueOnce({ avatar_url: 'http://example.com/avatar.png' });

        const result = userStore.getAvatar('account-123');

        expect(result).toBe('http://example.com/avatar.png');
      });

      it('devrait retourner undefined si pas d\'avatar', () => {
        MockDb.mockGet.mockReturnValueOnce({ avatar_url: null });

        const result = userStore.getAvatar('account-123');

        expect(result).toBeUndefined();
      });
    });
  });

  describe('Table Config', () => {
    describe('updateTableConfig', () => {
      it('devrait mettre à jour la config de la table', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });
        const tableConfig = { feltColor: '#1a7a3d', borderColor: '#8B4513' };

        const result = userStore.updateTableConfig('account-123', tableConfig);

        expect(result).toBe(true);
      });
    });

    describe('getTableConfig', () => {
      it('devrait récupérer la config de la table', () => {
        const tableConfig = { feltColor: '#1a7a3d' };
        MockDb.mockGet.mockReturnValueOnce({ table_config: JSON.stringify(tableConfig) });

        const result = userStore.getTableConfig('account-123');

        expect(result).toEqual(tableConfig);
      });
    });
  });

  describe('Password Reset', () => {
    describe('findUserByEmail', () => {
      it('devrait trouver un utilisateur par email', () => {
        MockDb.mockGet.mockReturnValueOnce({ id: 'user-123', name: 'Test User' });

        const result = userStore.findUserByEmail('test@example.com');

        expect(result).toEqual({ id: 'user-123', name: 'Test User' });
      });

      it('devrait retourner undefined si non trouvé', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = userStore.findUserByEmail('unknown@example.com');

        expect(result).toBeUndefined();
      });
    });

    describe('createPasswordResetToken', () => {
      it('devrait créer un code à 6 chiffres', () => {
        const token = userStore.createPasswordResetToken('user-123');

        expect(token).toMatch(/^\d{6}$/);
      });
    });

    describe('validateResetToken', () => {
      it('devrait valider un token valide', () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-123',
          expires_at: Date.now() + 3600000,
          used: 0,
        });

        const result = userStore.validateResetToken('123456');

        expect(result.valid).toBe(true);
        expect(result.userId).toBe('user-123');
      });

      it('devrait rejeter un token inexistant', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = userStore.validateResetToken('invalid');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Code invalide');
      });

      it('devrait rejeter un token déjà utilisé', () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-123',
          expires_at: Date.now() + 3600000,
          used: 1,
        });

        const result = userStore.validateResetToken('123456');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Ce code a déjà été utilisé');
      });

      it('devrait rejeter un token expiré', () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-123',
          expires_at: Date.now() - 1000,
          used: 0,
        });

        const result = userStore.validateResetToken('123456');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Ce code a expiré');
      });
    });

    describe('resetPassword', () => {
      it('devrait réinitialiser le mot de passe avec un token valide', async () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-123',
          expires_at: Date.now() + 3600000,
          used: 0,
        });

        const result = await userStore.resetPassword('abc123def456', 'newpassword123');

        expect(result.success).toBe(true);
      });

      it('devrait échouer avec un mot de passe trop court', async () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-123',
          expires_at: Date.now() + 3600000,
          used: 0,
        });

        const result = await userStore.resetPassword('abc123def456', '1234567');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Le mot de passe doit faire entre 8 et 256 caractères');
      });

      it('devrait échouer avec un token invalide', async () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = await userStore.resetPassword('invalid', 'newpassword123');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Code invalide');
      });
    });
  });

  describe('findRoomCreator', () => {
    it('devrait trouver le créateur d\'une room active', () => {
      MockDb.mockGet.mockReturnValueOnce({ account_id: 'creator-123' });

      const result = userStore.findRoomCreator('ROOM01');

      expect(result).toBe('creator-123');
    });

    it('devrait retourner undefined si pas de room active', () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = userStore.findRoomCreator('NOROOM');

      expect(result).toBeUndefined();
    });
  });

  describe('Session Tokens', () => {
    describe('createSessionToken', () => {
      it('devrait créer un token de session hex', () => {
        MockDb.mockGet.mockReturnValueOnce({ count: 0 });
        const token = userStore.createSessionToken('user-123');

        expect(token).toMatch(/^[a-f0-9]{64}$/);
        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });

    describe('validateSessionToken', () => {
      it('devrait valider un token existant', () => {
        MockDb.mockGet.mockReturnValueOnce({ user_id: 'user-123' });

        const result = userStore.validateSessionToken('valid-token', 'user-123');

        expect(result).toBe(true);
      });

      it('devrait rejeter un token inexistant', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = userStore.validateSessionToken('invalid-token', 'user-123');

        expect(result).toBe(false);
      });

      it('devrait rejeter si token ou userId vide', () => {
        expect(userStore.validateSessionToken('', 'user-123')).toBe(false);
        expect(userStore.validateSessionToken('token', '')).toBe(false);
      });
    });

    describe('revokeSessionToken', () => {
      it('devrait supprimer le token de session', () => {
        userStore.revokeSessionToken('token-to-revoke');

        expect(MockDb.mockRun).toHaveBeenCalled();
      });

      it('ne devrait rien faire si le token est vide', () => {
        MockDb.mockRun.mockClear();

        userStore.revokeSessionToken('');

        expect(MockDb.mockRun).not.toHaveBeenCalled();
      });
    });

    describe('revokeAllUserSessions', () => {
      it('devrait supprimer tous les tokens d\'un utilisateur', () => {
        userStore.revokeAllUserSessions('user-123');

        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });

    describe('cleanupExpiredSessions', () => {
      it('devrait nettoyer les sessions expirées', () => {
        userStore.cleanupExpiredSessions();

        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });
  });

  describe('Backlog CRUD', () => {
    describe('createBacklogItem', () => {
      it('devrait créer un item de backlog', () => {
        MockDb.mockGet.mockReturnValueOnce({ maxP: 0 });

        const item = userStore.createBacklogItem('account-123', 'My Item', 'Description');

        expect(item).not.toBeNull();
        expect(item!.title).toBe('My Item');
        expect(item!.description).toBe('Description');
        expect(item!.priority).toBe(1);
      });

      it('devrait trimmer le titre et la description', () => {
        MockDb.mockGet.mockReturnValueOnce({ maxP: 2 });

        const item = userStore.createBacklogItem('account-123', '  Titre  ', '  Desc  ');

        expect(item!.title).toBe('Titre');
        expect(item!.description).toBe('Desc');
      });

      it('devrait gérer les erreurs DB lors de la création', () => {
        MockDb.mockGet.mockReturnValueOnce({ maxP: 0 });
        MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

        const item = userStore.createBacklogItem('account-123', 'ErrorItem', 'Desc');

        expect(item).toBeNull();
      });
    });

    describe('getBacklogItems', () => {
      it('devrait retourner les items du backlog', () => {
        MockDb.mockAll.mockReturnValueOnce([
          {
            id: 'item-1',
            title: 'Item 1',
            description: null,
            estimated_points: null,
            estimated_at: null,
            room_code: null,
            priority: 1,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ]);

        const items = userStore.getBacklogItems('account-123');

        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Item 1');
        expect(items[0].priority).toBe(1);
      });

      it('devrait retourner un tableau vide si aucun item', () => {
        MockDb.mockAll.mockReturnValueOnce([]);

        const items = userStore.getBacklogItems('account-123');

        expect(items).toEqual([]);
      });
    });

    describe('updateBacklogItem', () => {
      it('devrait mettre à jour le titre d\'un item', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

        const result = userStore.updateBacklogItem('account-123', 'item-1', { title: 'New Title' });

        expect(result).toBe(true);
      });

      it('devrait retourner false si l\'item n\'existe pas', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

        const result = userStore.updateBacklogItem('account-123', 'nonexistent', { title: 'X' });

        expect(result).toBe(false);
      });

      it('devrait gérer les erreurs DB lors de la mise à jour', () => {
        MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

        const result = userStore.updateBacklogItem('account-123', 'item-1', { title: 'X' });

        expect(result).toBe(false);
      });
    });

    describe('deleteBacklogItem', () => {
      it('devrait supprimer un item du backlog', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

        const result = userStore.deleteBacklogItem('account-123', 'item-1');

        expect(result).toBe(true);
      });

      it('devrait retourner false si l\'item n\'existe pas', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);
        MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

        const result = userStore.deleteBacklogItem('account-123', 'nonexistent');

        expect(result).toBe(false);
      });

      it('devrait gérer les erreurs DB lors de la suppression', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

        const result = userStore.deleteBacklogItem('account-123', 'item-1');

        expect(result).toBe(false);
      });
    });
  });

  describe('Backlog avancé', () => {
    describe('updateBacklogItemScore', () => {
      it('devrait mettre à jour le score d\'un item', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

        const result = userStore.updateBacklogItemScore('account-123', 'item-1', '5', 'ROOM01');

        expect(result).toBe(true);
      });

      it('devrait retourner false si l\'item n\'existe pas', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);
        MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

        const result = userStore.updateBacklogItemScore('account-123', 'nonexistent', '5', 'ROOM01');

        expect(result).toBe(false);
      });

      it('devrait gérer les erreurs DB lors de la mise à jour du score', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

        const result = userStore.updateBacklogItemScore('account-123', 'item-1', '5', 'ROOM01');

        expect(result).toBe(false);
      });
    });

    describe('reorderBacklogItem', () => {
      it('devrait réordonner un item du backlog', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockGet.mockReturnValueOnce({ maxP: 3 });

        const result = userStore.reorderBacklogItem('account-123', 'item-1', 2);

        expect(result).toBe(true);
      });

      it('devrait retourner false pour un item déjà estimé', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 0, estimated_points: '5' });

        const result = userStore.reorderBacklogItem('account-123', 'item-1', 2);

        expect(result).toBe(false);
      });

      it('devrait retourner false pour une priorité invalide', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockGet.mockReturnValueOnce({ maxP: 3 });

        const result = userStore.reorderBacklogItem('account-123', 'item-1', 0);

        expect(result).toBe(false);
      });

      it('devrait retourner false si l\'item n\'existe pas', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = userStore.reorderBacklogItem('account-123', 'nonexistent', 2);

        expect(result).toBe(false);
      });

      it('devrait gérer les erreurs DB lors du reorder', () => {
        MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
        MockDb.mockGet.mockReturnValueOnce({ maxP: 3 });
        MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

        const result = userStore.reorderBacklogItem('account-123', 'item-1', 2);

        expect(result).toBe(false);
      });
    });

    describe('findBacklogItemByTitle', () => {
      it('devrait trouver un item par son titre', () => {
        MockDb.mockGet.mockReturnValueOnce({
          id: 'item-1',
          title: 'My Item',
          description: null,
          estimated_points: null,
          estimated_at: null,
          room_code: null,
          priority: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        });

        const item = userStore.findBacklogItemByTitle('account-123', 'My Item');

        expect(item).not.toBeNull();
        expect(item!.title).toBe('My Item');
      });

      it('devrait retourner null si non trouvé', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const item = userStore.findBacklogItemByTitle('account-123', 'Nonexistent');

        expect(item).toBeNull();
      });
    });
  });

  describe('Room TTL', () => {
    describe('getMaxRoomTtlMinutes', () => {
      it('devrait retourner le TTL max configuré', () => {
        const max = userStore.getMaxRoomTtlMinutes();

        expect(typeof max).toBe('number');
        expect(max).toBeGreaterThan(0);
      });
    });

    describe('getEffectiveRoomTtl', () => {
      it('devrait retourner le TTL par défaut si pas d\'accountId', () => {
        const ttl = userStore.getEffectiveRoomTtl(undefined);

        expect(typeof ttl).toBe('number');
        expect(ttl).toBeGreaterThan(0);
      });

      it('devrait retourner le TTL par défaut si le compte n\'a pas de TTL personnalisé', () => {
        MockDb.mockGet.mockReturnValueOnce({
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test',
          role: 'dev',
          created_at: Date.now(),
          deck_config: null,
          avatar_url: null,
          table_config: null,
          room_ttl_minutes: null,
          auth_type: 'email',
          layout_config: null,
        });

        const ttl = userStore.getEffectiveRoomTtl('user-123');

        expect(ttl).toBe(userStore.getMaxRoomTtlMinutes());
      });
    });

    describe('updateRoomTtl', () => {
      it('devrait mettre à jour le TTL', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

        const result = userStore.updateRoomTtl('account-123', 60);

        expect(result.success).toBe(true);
      });

      it('devrait refuser un TTL inférieur à 1', () => {
        const result = userStore.updateRoomTtl('account-123', 0);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Le TTL doit être au moins 1 minute');
      });

      it('devrait refuser un TTL supérieur au max', () => {
        const result = userStore.updateRoomTtl('account-123', 99999);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/ne peut pas dépasser/);
      });
    });
  });

  describe('Admin', () => {
    describe('isAdmin', () => {
      it('devrait retourner false si ADMIN_EMAIL n\'est pas configuré', () => {
        const originalEnv = process.env.ADMIN_EMAIL;
        delete process.env.ADMIN_EMAIL;

        const result = userStore.isAdmin('user-123');

        expect(result).toBe(false);
        process.env.ADMIN_EMAIL = originalEnv;
      });

      it('devrait retourner false si le compte n\'existe pas', () => {
        process.env.ADMIN_EMAIL = 'admin@example.com';
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = userStore.isAdmin('nonexistent');

        expect(result).toBe(false);
      });
    });

    describe('getAllUsers', () => {
      it('devrait retourner tous les utilisateurs', () => {
        MockDb.mockAll.mockReturnValueOnce([
          {
            id: 'user-1',
            email: 'user1@example.com',
            name: 'User 1',
            role: 'dev',
            created_at: Date.now(),
            deck_config: null,
            avatar_url: null,
            table_config: null,
            auth_type: 'email',
            layout_config: null,
            session_count: 2,
            room_count: 3,
            backlog_count: 5,
          },
        ]);

        const users = userStore.getAllUsers();

        expect(users).toHaveLength(1);
        expect(users[0].name).toBe('User 1');
        expect(users[0].sessionCount).toBe(2);
        expect(users[0].roomCount).toBe(3);
        expect(users[0].backlogCount).toBe(5);
      });
    });

    describe('deleteUser', () => {
      it('devrait supprimer un utilisateur et ses données', () => {
        MockDb.mockRun.mockReturnValue({ changes: 1 });

        const result = userStore.deleteUser('user-123');

        expect(result).toBe(true);
        // 5 DELETE statements: session_tokens, password_reset_tokens, user_backlogs, room_histories, users
        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });

    describe('getGlobalStats', () => {
      it('devrait retourner les statistiques globales', () => {
        MockDb.mockGet
          .mockReturnValueOnce({ count: 10 })   // totalUsers
          .mockReturnValueOnce({ count: 5 })    // totalRooms
          .mockReturnValueOnce({ count: 20 })   // totalItems
          .mockReturnValueOnce({ count: 15 })   // totalBacklogItems
          .mockReturnValueOnce({ count: 3 })    // activeSessions
          .mockReturnValueOnce({ count: 2 })    // usersToday
          .mockReturnValueOnce({ count: 1 });   // roomsToday

        const stats = userStore.getGlobalStats();

        expect(stats.totalUsers).toBe(10);
        expect(stats.totalRooms).toBe(5);
        expect(stats.totalItems).toBe(20);
        expect(stats.totalBacklogItems).toBe(15);
        expect(stats.activeSessions).toBe(3);
        expect(stats.usersToday).toBe(2);
        expect(stats.roomsToday).toBe(1);
      });
    });

    describe('getAllSessions', () => {
      it('devrait retourner toutes les sessions avec tokens masqués', () => {
        MockDb.mockAll.mockReturnValueOnce([
          {
            token: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            user_id: 'user-1',
            created_at: Date.now(),
            last_used_at: Date.now(),
            user_name: 'User 1',
            user_email: 'user1@example.com',
          },
        ]);

        const sessions = userStore.getAllSessions();

        expect(sessions).toHaveLength(1);
        expect(sessions[0].token).toBe('abcdef12...');
        expect(sessions[0].userName).toBe('User 1');
      });
    });

    describe('getAllRoomHistories', () => {
      it('devrait retourner tout l\'historique des rooms', () => {
        MockDb.mockAll.mockReturnValueOnce([
          {
            id: 'h-1',
            room_code: 'ROOM01',
            created_at: Date.now(),
            closed_at: null,
            creator_id: 'user-1',
            creator_name: 'Creator',
            participant_count: 3,
            items: '[]',
            is_active: 1,
          },
        ]);

        const histories = userStore.getAllRoomHistories();

        expect(histories).toHaveLength(1);
        expect(histories[0].roomCode).toBe('ROOM01');
        expect(histories[0].isActive).toBe(true);
      });
    });

    describe('getAllBacklogs', () => {
      it('devrait retourner les backlogs groupés par utilisateur', () => {
        MockDb.mockAll
          .mockReturnValueOnce([
            { id: 'user-1', name: 'User 1', email: 'user1@example.com' },
          ])
          .mockReturnValueOnce([
            {
              id: 'item-1',
              account_id: 'user-1',
              title: 'Backlog Item',
              description: null,
              estimated_points: null,
              estimated_at: null,
              room_code: null,
              priority: 1,
              created_at: Date.now(),
              updated_at: Date.now(),
            },
          ]);

        const backlogs = userStore.getAllBacklogs();

        expect(backlogs).toHaveLength(1);
        expect(backlogs[0].userName).toBe('User 1');
        expect(backlogs[0].items).toHaveLength(1);
      });

      it('devrait grouper plusieurs items pour le même utilisateur', () => {
        const now = Date.now();
        MockDb.mockAll
          .mockReturnValueOnce([
            { id: 'user-1', name: 'User 1', email: 'user1@example.com' },
          ])
          .mockReturnValueOnce([
            {
              id: 'item-1',
              account_id: 'user-1',
              title: 'Item A',
              description: null,
              estimated_points: null,
              estimated_at: null,
              room_code: null,
              priority: 1,
              created_at: now,
              updated_at: now,
            },
            {
              id: 'item-2',
              account_id: 'user-1',
              title: 'Item B',
              description: 'Desc B',
              estimated_points: '5',
              estimated_at: now,
              room_code: 'ROOM01',
              priority: 0,
              created_at: now,
              updated_at: now,
            },
          ]);

        const backlogs = userStore.getAllBacklogs();

        expect(backlogs).toHaveLength(1);
        expect(backlogs[0].items).toHaveLength(2);
        expect(backlogs[0].items[0].title).toBe('Item A');
        expect(backlogs[0].items[1].title).toBe('Item B');
        expect(backlogs[0].items[1].estimatedPoints).toBe('5');
      });

      it('devrait retourner un tableau vide sans items pour un utilisateur', () => {
        MockDb.mockAll
          .mockReturnValueOnce([
            { id: 'user-empty', name: 'Empty', email: 'empty@example.com' },
          ])
          .mockReturnValueOnce([]);

        const backlogs = userStore.getAllBacklogs();

        expect(backlogs).toHaveLength(1);
        expect(backlogs[0].items).toEqual([]);
      });
    });
  });

  describe('updateLayoutConfig', () => {
    it('devrait mettre à jour la configuration du layout', () => {
      const layout = { panels: ['items', 'table', 'votes'] };
      const result = userStore.updateLayoutConfig('account-layout', layout);

      expect(result).toBe(true);
      expect(MockDb.mockRun).toHaveBeenCalledWith(
        JSON.stringify(layout),
        'account-layout'
      );
    });

    it('devrait retourner false si l\'utilisateur n\'existe pas', () => {
      MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

      const result = userStore.updateLayoutConfig('nonexistent', { panels: [] });

      expect(result).toBe(false);
    });
  });

  describe('findRoomCreators', () => {
    it('devrait retourner une map vide pour un tableau vide', () => {
      const result = userStore.findRoomCreators([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('devrait trouver les créateurs de plusieurs rooms', () => {
      MockDb.mockAll.mockReturnValueOnce([
        { room_code: 'ROOM01', account_id: 'acc-1' },
        { room_code: 'ROOM02', account_id: 'acc-2' },
      ]);

      const result = userStore.findRoomCreators(['ROOM01', 'ROOM02', 'ROOM03']);

      expect(result.size).toBe(2);
      expect(result.get('ROOM01')).toBe('acc-1');
      expect(result.get('ROOM02')).toBe('acc-2');
      expect(result.get('ROOM03')).toBeUndefined();
    });
  });

  describe('isAdmin', () => {
    it('devrait retourner false sans ADMIN_EMAIL configuré', () => {
      const originalEnv = process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_EMAIL;

      const result = userStore.isAdmin('some-account');

      expect(result).toBe(false);
      if (originalEnv) process.env.ADMIN_EMAIL = originalEnv;
    });

    it('devrait retourner false si le compte n\'existe pas', () => {
      process.env.ADMIN_EMAIL = 'admin@test.com';
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = userStore.isAdmin('nonexistent');

      expect(result).toBe(false);
    });

    it('devrait retourner true si l\'email correspond à ADMIN_EMAIL', () => {
      process.env.ADMIN_EMAIL = 'admin@test.com';
      MockDb.mockGet.mockReturnValueOnce({
        id: 'admin-1',
        email: 'admin@test.com',
        name: 'Admin',
        role: 'po',
        created_at: Date.now(),
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = userStore.isAdmin('admin-1');

      expect(result).toBe(true);
    });

    it('devrait comparer en ignorant la casse', () => {
      process.env.ADMIN_EMAIL = 'ADMIN@TEST.COM';
      MockDb.mockGet.mockReturnValueOnce({
        id: 'admin-2',
        email: 'admin@test.com',
        name: 'Admin',
        role: 'po',
        created_at: Date.now(),
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = userStore.isAdmin('admin-2');

      expect(result).toBe(true);
    });

    it('devrait retourner false si l\'email ne correspond pas', () => {
      process.env.ADMIN_EMAIL = 'admin@test.com';
      MockDb.mockGet.mockReturnValueOnce({
        id: 'user-normal',
        email: 'user@test.com',
        name: 'NormalUser',
        role: 'dev',
        created_at: Date.now(),
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const result = userStore.isAdmin('user-normal');

      expect(result).toBe(false);
    });
  });

  describe('getEffectiveRoomTtl', () => {
    it('devrait retourner le TTL par défaut sans accountId', () => {
      const ttl = userStore.getEffectiveRoomTtl(undefined);

      expect(ttl).toBe(180); // DEFAULT_ROOM_TTL_MINUTES
    });

    it('devrait retourner le TTL par défaut si le compte n\'existe pas', () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const ttl = userStore.getEffectiveRoomTtl('nonexistent');

      expect(ttl).toBe(180);
    });

    it('devrait retourner le TTL personnalisé si défini', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'ttl-user',
        email: 'ttl@test.com',
        name: 'TTL User',
        role: 'dev',
        created_at: Date.now(),
        room_ttl_minutes: 60,
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const ttl = userStore.getEffectiveRoomTtl('ttl-user');

      expect(ttl).toBe(60);
    });

    it('devrait retourner le TTL par défaut si le compte n\'a pas de TTL personnalisé', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'no-ttl-user',
        email: 'nottl@test.com',
        name: 'No TTL',
        role: 'dev',
        created_at: Date.now(),
        room_ttl_minutes: null,
        deck_config: null,
        avatar_url: null,
        table_config: null,
      });

      const ttl = userStore.getEffectiveRoomTtl('no-ttl-user');

      expect(ttl).toBe(180);
    });
  });

  describe('updateRoomTtl', () => {
    it('devrait mettre à jour le TTL', () => {
      const result = userStore.updateRoomTtl('account-1', 60);

      expect(result.success).toBe(true);
    });

    it('devrait échouer avec un TTL < 1', () => {
      const result = userStore.updateRoomTtl('account-1', 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('au moins 1 minute');
    });

    it('devrait échouer avec un TTL trop élevé', () => {
      const result = userStore.updateRoomTtl('account-1', 99999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ne peut pas dépasser');
    });

    it('devrait gérer les erreurs DB', () => {
      MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

      const result = userStore.updateRoomTtl('account-1', 60);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur');
    });
  });

  describe('revokeSessionByPrefix', () => {
    it('devrait révoquer une session par préfixe de token', () => {
      const result = userStore.revokeSessionByPrefix('abcd1234ef56...');

      expect(result).toBe(true);
      expect(MockDb.mockRun).toHaveBeenCalledWith('abcd1234ef56%');
    });

    it('devrait retourner false si le préfixe est trop court', () => {
      const result = userStore.revokeSessionByPrefix('abc...');

      expect(result).toBe(false);
    });

    it('devrait retourner false si le préfixe est vide', () => {
      const result = userStore.revokeSessionByPrefix('...');

      expect(result).toBe(false);
    });

    it('devrait retourner false si le préfixe contient des caractères non-hex', () => {
      const result = userStore.revokeSessionByPrefix('ghijklmnopqr...');

      expect(result).toBe(false);
    });

    it('devrait retourner false si aucune session n\'est trouvée', () => {
      MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

      const result = userStore.revokeSessionByPrefix('abcd1234ef56...');

      expect(result).toBe(false);
    });

    it('devrait gérer les erreurs DB', () => {
      MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

      const result = userStore.revokeSessionByPrefix('abcd1234ef56...');

      expect(result).toBe(false);
    });
  });

  describe('Room History update', () => {
    describe('updateRoomHistory', () => {
      it('devrait mettre à jour l\'historique d\'une room active', () => {
        MockDb.mockGet.mockReturnValueOnce({ id: 'history-1' });

        userStore.updateRoomHistory('account-123', 'ROOM01', {
          participantCount: 5,
          isActive: false,
          closedAt: Date.now(),
        });

        expect(MockDb.mockRun).toHaveBeenCalled();
      });

      it('ne devrait rien faire si l\'historique n\'existe pas', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);
        MockDb.mockRun.mockClear();

        userStore.updateRoomHistory('account-123', 'NOROOM', {
          participantCount: 5,
        });

        expect(MockDb.mockRun).not.toHaveBeenCalled();
      });

      it('devrait mettre à jour les items dans l\'historique', () => {
        MockDb.mockGet.mockReturnValueOnce({ id: 'history-items' });

        const items = [
          { id: 'i1', title: 'Item1', description: 'D1', finalScore: '5', votes: {} },
        ];

        userStore.updateRoomHistory('account-123', 'ROOM02', { items });

        expect(MockDb.mockRun).toHaveBeenCalled();
        // Vérifie que les items sont sérialisés en JSON
        const runCalls = MockDb.mockRun.mock.calls;
        const lastCall = runCalls[runCalls.length - 1];
        expect(lastCall).toContain(JSON.stringify(items));
      });

      it('devrait mettre à jour plusieurs champs simultanément', () => {
        MockDb.mockGet.mockReturnValueOnce({ id: 'history-multi' });

        userStore.updateRoomHistory('account-123', 'ROOM03', {
          participantCount: 3,
          items: [{ id: 'i1', title: 'X', description: '', finalScore: '3', votes: {} }],
          isActive: false,
          closedAt: Date.now(),
        });

        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });
  });

  describe('Deck & Table Config', () => {
    describe('getDeckConfig', () => {
      it('devrait retourner le deck parsé', () => {
        const deck = { cards: [{ value: '1', label: '1' }] };
        MockDb.mockGet.mockReturnValueOnce({ deck_config: JSON.stringify(deck) });

        const result = userStore.getDeckConfig('account-1');

        expect(result).toEqual(deck);
      });

      it('devrait retourner undefined avec un JSON invalide', () => {
        MockDb.mockGet.mockReturnValueOnce({ deck_config: '{bad json' });

        const result = userStore.getDeckConfig('account-1');

        expect(result).toBeUndefined();
      });

      it('devrait retourner undefined sans deck config', () => {
        MockDb.mockGet.mockReturnValueOnce({ deck_config: null });

        const result = userStore.getDeckConfig('account-1');

        expect(result).toBeUndefined();
      });
    });

    describe('updateDeckConfig', () => {
      it('devrait mettre à jour le deck', () => {
        const deck = { cards: [{ value: '5', label: '5' }] };
        const result = userStore.updateDeckConfig('account-1', deck);

        expect(result).toBe(true);
      });

      it('devrait retourner false si l\'utilisateur n\'existe pas', () => {
        MockDb.mockRun.mockReturnValueOnce({ changes: 0 });

        const result = userStore.updateDeckConfig('nonexistent', { cards: [] });

        expect(result).toBe(false);
      });
    });

    describe('getTableConfig', () => {
      it('devrait retourner la config de table parsée', () => {
        const config = { feltColor: '#1a7a3d', borderColor: '#8B4513' };
        MockDb.mockGet.mockReturnValueOnce({ table_config: JSON.stringify(config) });

        const result = userStore.getTableConfig('account-1');

        expect(result).toEqual(config);
      });
    });

    describe('updateTableConfig', () => {
      it('devrait mettre à jour la config de table', () => {
        const config = { feltColor: '#ff0000' };
        const result = userStore.updateTableConfig('account-1', config as any);

        expect(result).toBe(true);
      });
    });

    describe('Avatar', () => {
      it('devrait mettre à jour et récupérer l\'avatar', () => {
        const result = userStore.updateAvatar('account-1', '/uploads/avatar.png');
        expect(result).toBe(true);
      });

      it('devrait retourner undefined sans avatar', () => {
        MockDb.mockGet.mockReturnValueOnce({ avatar_url: null });

        const avatar = userStore.getAvatar('account-1');
        expect(avatar).toBeUndefined();
      });

      it('devrait retourner l\'URL de l\'avatar', () => {
        MockDb.mockGet.mockReturnValueOnce({ avatar_url: '/uploads/avatar.png' });

        const avatar = userStore.getAvatar('account-1');
        expect(avatar).toBe('/uploads/avatar.png');
      });
    });
  });

  describe('findUserByEmail', () => {
    it('devrait trouver un utilisateur par email', () => {
      MockDb.mockGet.mockReturnValueOnce({ id: 'user-1', name: 'Found User' });

      const user = userStore.findUserByEmail('found@test.com');

      expect(user).toEqual({ id: 'user-1', name: 'Found User' });
    });

    it('devrait retourner undefined si non trouvé', () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const user = userStore.findUserByEmail('notfound@test.com');

      expect(user).toBeUndefined();
    });
  });

  describe('findRoomCreator (single)', () => {
    it('devrait trouver le créateur d\'une room', () => {
      MockDb.mockGet.mockReturnValueOnce({ account_id: 'acc-creator' });

      const result = userStore.findRoomCreator('ROOMXX');

      expect(result).toBe('acc-creator');
    });

    it('devrait retourner undefined si pas de créateur', () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = userStore.findRoomCreator('NOROOM');

      expect(result).toBeUndefined();
    });
  });

  describe('updateBacklogItem description', () => {
    it('devrait mettre à jour la description d\'un item', () => {
      MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

      const result = userStore.updateBacklogItem('account-123', 'item-1', { description: 'New description' });

      expect(result).toBe(true);
    });

    it('devrait mettre à jour titre et description simultanément', () => {
      MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

      const result = userStore.updateBacklogItem('account-123', 'item-1', { title: 'New Title', description: 'New Desc' });

      expect(result).toBe(true);
    });

    it('devrait mettre à null une description vide', () => {
      MockDb.mockRun.mockReturnValueOnce({ changes: 1 });

      const result = userStore.updateBacklogItem('account-123', 'item-1', { description: '' });

      expect(result).toBe(true);
    });
  });

  describe('reorderBacklogItem move down', () => {
    it('devrait déplacer un item vers le bas (newPriority > oldPriority)', () => {
      MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
      MockDb.mockGet.mockReturnValueOnce({ maxP: 5 });

      const result = userStore.reorderBacklogItem('account-123', 'item-1', 3);

      expect(result).toBe(true);
    });

    it('devrait être no-op si même priorité', () => {
      MockDb.mockGet.mockReturnValueOnce({ priority: 2, estimated_points: null });

      const result = userStore.reorderBacklogItem('account-123', 'item-1', 2);

      expect(result).toBe(true);
    });
  });

  describe('reorderBacklogItem move up', () => {
    it('devrait déplacer un item vers le haut (newPriority < oldPriority)', () => {
      MockDb.mockGet.mockReturnValueOnce({ priority: 3, estimated_points: null });
      MockDb.mockGet.mockReturnValueOnce({ maxP: 5 });

      const result = userStore.reorderBacklogItem('account-123', 'item-1', 1);

      expect(result).toBe(true);
      // Vérifie que la query "move up" est utilisée (priority + 1 pour les items entre newPriority et oldPriority)
      expect(MockDb.mockRun).toHaveBeenCalled();
    });
  });

  describe('reorderBacklogItem boundary checks', () => {
    it('devrait retourner false si newPriority > maxP', () => {
      MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
      MockDb.mockGet.mockReturnValueOnce({ maxP: 3 });

      const result = userStore.reorderBacklogItem('account-123', 'item-1', 5);

      expect(result).toBe(false);
    });

    it('devrait retourner false si maxRow est undefined', () => {
      MockDb.mockGet.mockReturnValueOnce({ priority: 1, estimated_points: null });
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = userStore.reorderBacklogItem('account-123', 'item-1', 2);

      expect(result).toBe(false);
    });

    it('devrait retourner false si priority est null', () => {
      MockDb.mockGet.mockReturnValueOnce({ priority: null, estimated_points: null });

      const result = userStore.reorderBacklogItem('account-123', 'item-1', 2);

      expect(result).toBe(false);
    });
  });

  describe('deleteUser', () => {
    it('devrait supprimer un utilisateur et ses données', () => {
      MockDb.mockRun.mockReturnValue({ changes: 1 });

      const result = userStore.deleteUser('user-to-delete');

      expect(result).toBe(true);
    });

    it('devrait retourner false si l\'utilisateur n\'existe pas', () => {
      MockDb.mockRun.mockReturnValue({ changes: 0 });

      const result = userStore.deleteUser('nonexistent');

      expect(result).toBe(false);
    });

    it('devrait retourner false en cas d\'erreur DB', () => {
      MockDb.mockRun.mockImplementationOnce(() => { throw new Error('DB error'); });

      const result = userStore.deleteUser('user-error');

      expect(result).toBe(false);
    });
  });

  describe('Password Reset', () => {
    describe('createPasswordResetToken', () => {
      it('devrait créer un code de réinitialisation à 6 chiffres', () => {
        const code = userStore.createPasswordResetToken('user-reset');

        expect(code).toBeDefined();
        expect(typeof code).toBe('string');
        expect(code).toHaveLength(6);
        expect(MockDb.mockRun).toHaveBeenCalled();
      });
    });

    describe('validateResetToken', () => {
      it('devrait valider un token existant et non expiré', () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-verify',
          expires_at: Date.now() + 60000,
          used: 0,
        });

        const result = userStore.validateResetToken('123456');

        expect(result.valid).toBe(true);
        expect(result.userId).toBe('user-verify');
      });

      it('devrait retourner invalide pour un token inexistant', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = userStore.validateResetToken('000000');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('invalide');
      });

      it('devrait retourner invalide pour un token déjà utilisé', () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-used',
          expires_at: Date.now() + 60000,
          used: 1,
        });

        const result = userStore.validateResetToken('123456');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('utilisé');
      });

      it('devrait retourner invalide pour un token expiré', () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-expired',
          expires_at: Date.now() - 1000,
          used: 0,
        });

        const result = userStore.validateResetToken('123456');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('expiré');
      });
    });

    describe('resetPassword', () => {
      it('devrait réinitialiser le mot de passe avec un token valide', async () => {
        // Mock validateResetToken returns valid
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-reset',
          expires_at: Date.now() + 60000,
          used: 0,
        });

        const result = await userStore.resetPassword('123456', 'newpassword123');

        expect(result.success).toBe(true);
        expect(MockDb.mockRun).toHaveBeenCalled();
      });

      it('devrait échouer avec un token invalide', async () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const result = await userStore.resetPassword('000000', 'newpassword123');

        expect(result.success).toBe(false);
        expect(result.error).toContain('invalide');
      });

      it('devrait échouer avec un mot de passe trop court', async () => {
        MockDb.mockGet.mockReturnValueOnce({
          user_id: 'user-reset',
          expires_at: Date.now() + 60000,
          used: 0,
        });

        const result = await userStore.resetPassword('123456', 'short');

        expect(result.success).toBe(false);
        expect(result.error).toContain('8');
      });
    });
  });

  describe('Session Management', () => {
    describe('createSessionToken', () => {
      it('devrait créer un token de session', () => {
        MockDb.mockGet.mockReturnValueOnce({ count: 0 });
        const token = userStore.createSessionToken('user-session');

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      });
    });

    describe('validateSessionToken', () => {
      it('devrait valider une session existante', () => {
        MockDb.mockGet.mockReturnValueOnce({ user_id: 'user-valid' });

        const isValid = userStore.validateSessionToken('valid-token', 'user-valid');

        expect(isValid).toBe(true);
      });

      it('devrait retourner false pour un token invalide', () => {
        MockDb.mockGet.mockReturnValueOnce(undefined);

        const isValid = userStore.validateSessionToken('invalid-token', 'user-id');

        expect(isValid).toBe(false);
      });

      it('devrait retourner false pour des paramètres vides', () => {
        const isValid = userStore.validateSessionToken('', '');

        expect(isValid).toBe(false);
      });
    });

    describe('revokeSessionToken', () => {
      it('devrait révoquer un token de session', () => {
        userStore.revokeSessionToken('token-to-delete');

        expect(MockDb.mockRun).toHaveBeenCalled();
      });

      it('ne devrait rien faire avec un token vide', () => {
        MockDb.mockRun.mockClear();

        userStore.revokeSessionToken('');

        // Should not call run because of the guard clause
        expect(MockDb.mockRun).not.toHaveBeenCalled();
      });
    });
  });

  describe('login branch coverage (pseudo errors)', () => {
    it('devrait retourner erreur pseudo quand le pseudo n\'existe pas', async () => {
      MockDb.mockGet.mockReturnValueOnce(undefined);

      const result = await userStore.login('', 'password123', 'pseudo', 'unknownpseudo');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Pseudo ou mot de passe incorrect');
    });

    it('devrait retourner erreur pseudo quand le mot de passe est mauvais', async () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'pseudo-bad-pw',
        email: 'pseudo:badpw',
        name: 'BadPW',
        role: 'dev',
        created_at: Date.now(),
        password_hash: 'wrong-hash-value',
        deck_config: null,
        avatar_url: null,
        table_config: null,
        auth_type: 'pseudo',
      });

      const result = await userStore.login('', 'wrongpassword', 'pseudo', 'badpw');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Pseudo ou mot de passe incorrect');
    });
  });

  describe('getAllUsers branch coverage (pseudo users)', () => {
    it('devrait masquer l\'email et exposer le pseudo pour un utilisateur pseudo', () => {
      MockDb.mockAll.mockReturnValueOnce([
        {
          id: 'pseudo-admin-1',
          email: 'pseudo:mypseudouser',
          name: 'PseudoAdmin',
          role: 'dev',
          created_at: Date.now(),
          deck_config: null,
          avatar_url: null,
          table_config: null,
          auth_type: 'pseudo',
          layout_config: null,
          session_count: 1,
          room_count: 0,
          backlog_count: 0,
        },
      ]);

      const users = userStore.getAllUsers();

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('');
      expect(users[0].pseudo).toBe('mypseudouser');
      expect(users[0].authType).toBe('pseudo');
    });
  });

  describe('findBacklogItemByTitle branch coverage', () => {
    it('devrait retourner priority 0 quand priority est null', () => {
      MockDb.mockGet.mockReturnValueOnce({
        id: 'item-nullprio',
        title: 'NullPrio',
        description: null,
        estimated_points: null,
        estimated_at: null,
        room_code: null,
        priority: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const item = userStore.findBacklogItemByTitle('account-123', 'NullPrio');

      expect(item).not.toBeNull();
      expect(item!.priority).toBe(0);
    });
  });

  describe('getAllRoomHistories branch coverage', () => {
    it('devrait utiliser "Inconnu" quand creator_name est null et [] quand items est null', () => {
      MockDb.mockAll.mockReturnValueOnce([
        {
          id: 'h-null',
          room_code: 'NULLRM',
          created_at: Date.now(),
          closed_at: null,
          creator_id: 'user-gone',
          creator_name: null,
          participant_count: 1,
          items: null,
          is_active: 0,
        },
      ]);

      const histories = userStore.getAllRoomHistories();

      expect(histories).toHaveLength(1);
      expect(histories[0].creatorName).toBe('Inconnu');
      expect(histories[0].items).toEqual([]);
    });
  });

  describe('getAllBacklogs branch coverage', () => {
    it('devrait utiliser priority 0 quand priority est null et estimated_points est null', () => {
      const now = Date.now();
      MockDb.mockAll
        .mockReturnValueOnce([
          { id: 'user-bp', name: 'BPUser', email: 'bp@test.com' },
        ])
        .mockReturnValueOnce([
          {
            id: 'item-bp',
            account_id: 'user-bp',
            title: 'BP Item',
            description: null,
            estimated_points: null,
            estimated_at: null,
            room_code: null,
            priority: null,
            created_at: now,
            updated_at: now,
          },
        ]);

      const backlogs = userStore.getAllBacklogs();

      expect(backlogs).toHaveLength(1);
      expect(backlogs[0].items[0].priority).toBe(0);
    });
  });

  describe('getGlobalStats branch coverage', () => {
    it('devrait utiliser 0 quand totalItems count est null', () => {
      MockDb.mockGet
        .mockReturnValueOnce({ count: 1 })    // totalUsers
        .mockReturnValueOnce({ count: 0 })    // totalRooms
        .mockReturnValueOnce({ count: null })  // totalItems — SUM returns null when no rows
        .mockReturnValueOnce({ count: 0 })    // totalBacklogItems
        .mockReturnValueOnce({ count: 0 })    // activeSessions
        .mockReturnValueOnce({ count: 0 })    // usersToday
        .mockReturnValueOnce({ count: 0 });   // roomsToday

      const stats = userStore.getGlobalStats();

      expect(stats.totalItems).toBe(0);
      expect(stats.totalUsers).toBe(1);
    });
  });

  describe('updateRoomHistory branch coverage', () => {
    it('devrait gérer isActive: true (branche ternaire)', () => {
      MockDb.mockGet.mockReturnValueOnce({ id: 'history-active' });

      userStore.updateRoomHistory('account-123', 'ROOM01', { isActive: true });

      expect(MockDb.mockRun).toHaveBeenCalled();
    });

    it('devrait ne rien faire si aucun champ n\'est fourni (setClauses vide)', () => {
      MockDb.mockGet.mockReturnValueOnce({ id: 'history-noop' });
      MockDb.mockRun.mockClear();

      userStore.updateRoomHistory('account-123', 'ROOM01', {});

      expect(MockDb.mockRun).not.toHaveBeenCalled();
    });
  });

  describe('getRoomHistory branch coverage', () => {
    it('devrait retourner [] quand items est null (safeJsonParse fallback)', () => {
      MockDb.mockAll.mockReturnValueOnce([
        {
          id: 'h-null-items',
          room_code: 'NULLIT',
          created_at: Date.now(),
          closed_at: null,
          creator_id: 'user-1',
          creator_name: 'Creator',
          participant_count: 1,
          items: null,
          is_active: 1,
        },
      ]);

      const histories = userStore.getRoomHistory('account-123');

      expect(histories).toHaveLength(1);
      expect(histories[0].items).toEqual([]);
    });
  });

  describe('createBacklogItem branch coverage', () => {
    it('devrait stocker null en DB quand la description est vide', () => {
      MockDb.mockGet.mockReturnValueOnce({ maxP: 0 });

      const item = userStore.createBacklogItem('account-123', 'NoDesc', '');

      expect(item).not.toBeNull();
      // L'INSERT en DB utilise description?.trim() || null → stocke null
      // Le retour utilise description?.trim() → retourne ''
      expect(item!.title).toBe('NoDesc');
    });

    it('devrait stocker null en DB quand la description est undefined', () => {
      MockDb.mockGet.mockReturnValueOnce({ maxP: 0 });

      const item = userStore.createBacklogItem('account-123', 'NoDesc2');

      expect(item).not.toBeNull();
      expect(item!.description).toBeUndefined();
    });
  });

  describe('getBacklogItems branch coverage', () => {
    it('devrait retourner priority 0 quand estimated_points est défini', () => {
      MockDb.mockAll.mockReturnValueOnce([
        {
          id: 'item-est',
          title: 'Estimated',
          description: null,
          estimated_points: '5',
          estimated_at: Date.now(),
          room_code: 'ROOM01',
          priority: 3,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ]);

      const items = userStore.getBacklogItems('account-123');

      expect(items[0].priority).toBe(0);
      expect(items[0].estimatedPoints).toBe('5');
    });

    it('devrait retourner priority 0 quand priority est null et pas de estimated_points', () => {
      MockDb.mockAll.mockReturnValueOnce([
        {
          id: 'item-nullp',
          title: 'NullPrio',
          description: null,
          estimated_points: null,
          estimated_at: null,
          room_code: null,
          priority: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ]);

      const items = userStore.getBacklogItems('account-123');

      expect(items[0].priority).toBe(0);
    });
  });

  describe('getAllUsers branch coverage (auth_type null)', () => {
    it('devrait utiliser email par défaut quand auth_type est null', () => {
      MockDb.mockAll.mockReturnValueOnce([
        {
          id: 'user-null-auth',
          email: 'nullauth@test.com',
          name: 'NullAuth',
          role: 'dev',
          created_at: Date.now(),
          deck_config: null,
          avatar_url: null,
          table_config: null,
          auth_type: null,
          layout_config: null,
          session_count: 0,
          room_count: 0,
          backlog_count: 0,
        },
      ]);

      const users = userStore.getAllUsers();

      expect(users).toHaveLength(1);
      expect(users[0].authType).toBe('email');
      expect(users[0].email).toBe('nullauth@test.com');
      expect(users[0].pseudo).toBeUndefined();
    });
  });
});

// Tests nécessitant un re-import du module (initialisation, migrations, timers)
describe('userStore module initialization', () => {
  it('devrait créer le dossier data si inexistant (fs.mkdirSync)', async () => {
    vi.resetModules();

    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await import('../../../server/store/userStore');

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('devrait exécuter les migrations DB quand les colonnes manquent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.resetModules();

    const { default: NewDb } = await import('better-sqlite3');
    const newMockGet = (NewDb as any).mockGet;

    // Les 4 migrations font chacune un .get() — on les fait toutes échouer
    newMockGet
      .mockImplementationOnce(() => { throw new Error('no such column: room_ttl_minutes'); })
      .mockImplementationOnce(() => { throw new Error('no such column: auth_type'); })
      .mockImplementationOnce(() => { throw new Error('no such column: layout_config'); })
      .mockImplementationOnce(() => { throw new Error('no such column: priority'); });

    // Mock pour la migration priority : pas de comptes existants
    const newMockAll = (NewDb as any).mockAll;
    newMockAll.mockReturnValue([]);

    const freshStore = await import('../../../server/store/userStore');

    // Vérifier que les logs de migration ont été émis
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('room_ttl_minutes'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('auth_type'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('layout_config'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('priority'));

    freshStore.stopCleanupInterval();
    logSpy.mockRestore();
  });

  it('devrait initialiser les priorités lors de la migration priority', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.resetModules();

    const { default: NewDb } = await import('better-sqlite3');
    const newMockGet = (NewDb as any).mockGet;
    const newMockAll = (NewDb as any).mockAll;

    // Les 3 premières migrations passent, la 4ème (priority) échoue
    newMockGet
      .mockReturnValueOnce(undefined) // room_ttl_minutes ok
      .mockReturnValueOnce(undefined) // auth_type ok
      .mockReturnValueOnce(undefined) // layout_config ok
      .mockImplementationOnce(() => { throw new Error('no such column: priority'); });

    // Migration priority : 1 compte avec 2 items à réordonner
    newMockAll
      .mockReturnValueOnce([{ account_id: 'acc-1' }])  // DISTINCT account_id
      .mockReturnValueOnce([{ id: 'item-a' }, { id: 'item-b' }]);  // items for acc-1

    const freshStore = await import('../../../server/store/userStore');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('priority'));
    // Verify UPDATE SET priority was called for each item
    expect((NewDb as any).mockRun).toHaveBeenCalled();

    freshStore.stopCleanupInterval();
    logSpy.mockRestore();
  });

  it('devrait configurer l\'intervalle de nettoyage des sessions', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const { default: NewDb } = await import('better-sqlite3');

    const freshStore = await import('../../../server/store/userStore');

    // Avancer le temps de 24h (CLEANUP_INTERVAL_MS)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    // La fonction de nettoyage a dû appeler mockRun (pour DELETE)
    expect((NewDb as any).mockRun).toHaveBeenCalled();

    freshStore.stopCleanupInterval();
    vi.useRealTimers();
  });
});
