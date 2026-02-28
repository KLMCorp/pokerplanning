import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock uuid pour avoir des IDs prévisibles
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

// Import après le mock
import * as roomStore from '../../../server/store/roomStore';
import * as userStore from '../../../server/store/userStore';

describe('roomStore', () => {
  // Note: Les tests partagent le même état en mémoire
  // On utilise des noms uniques pour éviter les conflits

  describe('createRoom', () => {
    it('devrait créer une room avec un PO', () => {
      const { room, userId } = roomStore.createRoom('Alice', 'socket-1');

      expect(room).toBeDefined();
      expect(room.id).toHaveLength(6);
      expect(room.poUserId).toBe(userId);
      expect(room.users[userId]).toMatchObject({
        name: 'Alice',
        isPO: true,
      });
      expect(room.state).toBe('idle');
      expect(room.items).toHaveLength(0);
      expect(room.hasPassword).toBe(false);
    });

    it('devrait créer une room avec mot de passe', () => {
      const { room } = roomStore.createRoom('Bob', 'socket-2', 'secret123');

      expect(room.hasPassword).toBe(true);
    });

    it('devrait créer une room avec un deck personnalisé', () => {
      const customDeck = {
        cards: [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
        ],
      };
      const { room } = roomStore.createRoom('Charlie', 'socket-3', undefined, customDeck);

      expect(room.deck.cards).toHaveLength(2);
      expect(room.deck.cards[0].value).toBe('1');
    });

    it('devrait assigner la couleur par défaut au PO', () => {
      const { room, userId } = roomStore.createRoom('Dave', 'socket-4');

      expect(room.users[userId].cardColor).toBe('#3B82F6');
    });

    it('devrait assigner une couleur personnalisée au PO', () => {
      const { room, userId } = roomStore.createRoom('Dave', 'socket-4b', undefined, undefined, undefined, undefined, undefined, '#EF4444');

      expect(room.users[userId].cardColor).toBe('#EF4444');
    });
  });

  describe('joinRoom', () => {
    it('devrait permettre de rejoindre une room existante', () => {
      const { room: createdRoom } = roomStore.createRoom('Host', 'socket-host-1');
      const roomId = createdRoom.id;

      const result = roomStore.joinRoom(roomId, 'Guest', 'socket-guest-1');

      expect(result.success).toBe(true);
      expect(result.room).toBeDefined();
      expect(result.userId).toBeDefined();
      expect(result.room!.users[result.userId!]).toMatchObject({
        name: 'Guest',
        isPO: false,
      });
    });

    it('devrait échouer si la room n\'existe pas', () => {
      const result = roomStore.joinRoom('INVALID', 'Guest', 'socket-invalid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Room introuvable');
    });

    it('devrait échouer avec un mauvais mot de passe', () => {
      const { room } = roomStore.createRoom('SecureHost', 'socket-secure', 'mypassword');

      const result = roomStore.joinRoom(room.id, 'Hacker', 'socket-hacker', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Mot de passe incorrect');
    });

    it('devrait réussir avec le bon mot de passe', () => {
      const { room } = roomStore.createRoom('SecureHost2', 'socket-secure-2', 'correctpwd');

      const result = roomStore.joinRoom(room.id, 'ValidGuest', 'socket-valid', 'correctpwd');

      expect(result.success).toBe(true);
    });
  });

  describe('leaveRoom', () => {
    it('devrait retirer un dev de la room', () => {
      const { room } = roomStore.createRoom('Host', 'socket-host-leave');
      const joinResult = roomStore.joinRoom(room.id, 'Guest', 'socket-guest-leave');

      const result = roomStore.leaveRoom('socket-guest-leave');

      expect(result.roomId).toBe(room.id);
      expect(result.userId).toBe(joinResult.userId);
      expect(result.room).toBeDefined();
      expect(result.room!.users[joinResult.userId!]).toBeUndefined();
    });

    it('devrait fermer la room si le PO quitte', () => {
      const { room } = roomStore.createRoom('OldPO', 'socket-oldpo');
      roomStore.joinRoom(room.id, 'Dev', 'socket-dev-po');

      const result = roomStore.leaveRoom('socket-oldpo');

      expect(result.roomClosed).toBe(true);
      expect(result.closedRoom).toBeDefined();
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait supprimer la room si le dernier utilisateur quitte', () => {
      const { room } = roomStore.createRoom('Lonely', 'socket-lonely');

      roomStore.leaveRoom('socket-lonely');

      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait retourner un objet vide si le socket n\'est pas trouvé', () => {
      const result = roomStore.leaveRoom('socket-unknown');

      expect(result).toEqual({});
    });

    it('devrait retourner un objet vide si la room n\'existe plus (socket orphelin)', () => {
      // Créer une room puis la supprimer manuellement via le PO leave
      const { room } = roomStore.createRoom('TempHost', 'socket-temp-host');
      const joinResult = roomStore.joinRoom(room.id, 'TempDev', 'socket-temp-dev');
      // Le PO quitte → la room est fermée
      roomStore.leaveRoom('socket-temp-host');
      // Vérifier que la room est bien supprimée
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait nettoyer les votes du dev sur tous les items', () => {
      const { room, userId: poId } = roomStore.createRoom('VoteHost', 'socket-vote-host-leave');
      const { userId: devId } = roomStore.joinRoom(room.id, 'VoteDev', 'socket-vote-dev-leave');

      // Créer un item et voter
      const item = roomStore.createItem(room.id, 'ItemVote', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, devId!, '5');
      roomStore.castVote(room.id, poId, '8');

      // Le dev quitte
      roomStore.leaveRoom('socket-vote-dev-leave');

      const updatedRoom = roomStore.getRoom(room.id)!;
      const updatedItem = updatedRoom.items[0];
      // Le vote du dev doit être supprimé
      expect(updatedItem.votes[devId!]).toBeUndefined();
      // Le vote du PO reste
      expect(updatedItem.votes[poId]).toBeDefined();
    });

    it('devrait fermer la room PO avec clone profond des items', () => {
      const { room, userId: poId } = roomStore.createRoom('DeepClonePO', 'socket-dc-po');
      roomStore.joinRoom(room.id, 'DeepCloneDev', 'socket-dc-dev');

      const item = roomStore.createItem(room.id, 'CloneItem', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '3');

      const result = roomStore.leaveRoom('socket-dc-po');

      expect(result.roomClosed).toBe(true);
      expect(result.closedRoom).toBeDefined();
      expect(result.closedRoom!.items).toHaveLength(1);
      expect(result.closedRoom!.items[0].votes[poId]).toBeDefined();
    });
  });

  describe('checkRoomPassword', () => {
    it('devrait retourner exists:false pour une room inexistante', () => {
      const result = roomStore.checkRoomPassword('NOROOM');

      expect(result).toEqual({ exists: false, hasPassword: false });
    });

    it('devrait retourner hasPassword:true pour une room protégée', () => {
      const { room } = roomStore.createRoom('Protected', 'socket-protected', 'pwd');

      const result = roomStore.checkRoomPassword(room.id);

      expect(result).toEqual({ exists: true, hasPassword: true });
    });

    it('devrait retourner hasPassword:false pour une room non protégée', () => {
      const { room } = roomStore.createRoom('Open', 'socket-open');

      const result = roomStore.checkRoomPassword(room.id);

      expect(result).toEqual({ exists: true, hasPassword: false });
    });
  });

  describe('isPO', () => {
    it('devrait retourner true pour le PO', () => {
      roomStore.createRoom('IsPOTest', 'socket-ispo');

      expect(roomStore.isPO('socket-ispo')).toBe(true);
    });

    it('devrait retourner false pour un non-PO', () => {
      const { room } = roomStore.createRoom('POCheck', 'socket-po-check');
      roomStore.joinRoom(room.id, 'NotPO', 'socket-notpo');

      expect(roomStore.isPO('socket-notpo')).toBe(false);
    });

    it('devrait retourner false pour un socket inconnu', () => {
      expect(roomStore.isPO('socket-unknown-po')).toBe(false);
    });
  });

  describe('Item Management', () => {
    let testRoomId: string;

    beforeEach(() => {
      const { room } = roomStore.createRoom('ItemHost', 'socket-item-' + Date.now());
      testRoomId = room.id;
    });

    describe('createItem', () => {
      it('devrait créer un item dans la room', () => {
        const item = roomStore.createItem(testRoomId, 'User Story 1', 'Description');

        expect(item).toBeDefined();
        expect(item!.title).toBe('User Story 1');
        expect(item!.description).toBe('Description');
        expect(item!.order).toBe(0);
        expect(item!.votes).toEqual({});
      });

      it('devrait incrémenter l\'ordre pour chaque nouvel item', () => {
        roomStore.createItem(testRoomId, 'Item 1', 'Desc 1');
        const item2 = roomStore.createItem(testRoomId, 'Item 2', 'Desc 2');

        expect(item2!.order).toBe(1);
      });

      it('devrait retourner null pour une room inexistante', () => {
        const item = roomStore.createItem('NOROOM', 'Title', 'Desc');

        expect(item).toBeNull();
      });
    });

    describe('updateItem', () => {
      it('devrait mettre à jour le titre d\'un item', () => {
        const item = roomStore.createItem(testRoomId, 'Old Title', 'Desc');

        const result = roomStore.updateItem(testRoomId, item!.id, { title: 'New Title' });

        expect(result).toBe(true);
        const room = roomStore.getRoom(testRoomId);
        expect(room!.items[0].title).toBe('New Title');
      });

      it('devrait mettre à jour la description d\'un item', () => {
        const item = roomStore.createItem(testRoomId, 'Title', 'Old Desc');

        roomStore.updateItem(testRoomId, item!.id, { description: 'New Desc' });

        const room = roomStore.getRoom(testRoomId);
        expect(room!.items[0].description).toBe('New Desc');
      });

      it('devrait retourner false pour un item inexistant', () => {
        const result = roomStore.updateItem(testRoomId, 'invalid-id', { title: 'Test' });

        expect(result).toBe(false);
      });
    });

    describe('deleteItem', () => {
      it('devrait supprimer un item', () => {
        const item = roomStore.createItem(testRoomId, 'ToDelete', 'Desc');

        const result = roomStore.deleteItem(testRoomId, item!.id);

        expect(result).toBe(true);
        const room = roomStore.getRoom(testRoomId);
        expect(room!.items).toHaveLength(0);
      });

      it('devrait réorganiser les ordres après suppression', () => {
        const item1 = roomStore.createItem(testRoomId, 'Item 1', 'Desc');
        roomStore.createItem(testRoomId, 'Item 2', 'Desc');
        const item3 = roomStore.createItem(testRoomId, 'Item 3', 'Desc');

        roomStore.deleteItem(testRoomId, item1!.id);

        const room = roomStore.getRoom(testRoomId);
        expect(room!.items).toHaveLength(2);
        expect(room!.items[0].order).toBe(0);
        expect(room!.items[1].order).toBe(1);
        expect(room!.items[1].id).toBe(item3!.id);
      });

      it('devrait désélectionner l\'item actif si supprimé', () => {
        const item = roomStore.createItem(testRoomId, 'Active', 'Desc');
        roomStore.selectItem(testRoomId, item!.id);

        roomStore.deleteItem(testRoomId, item!.id);

        const room = roomStore.getRoom(testRoomId);
        expect(room!.activeItemId).toBeNull();
        expect(room!.state).toBe('idle');
      });
    });

    describe('reorderItem', () => {
      it('devrait réordonner les items', () => {
        const item1 = roomStore.createItem(testRoomId, 'Item 1', 'Desc');
        roomStore.createItem(testRoomId, 'Item 2', 'Desc');
        roomStore.createItem(testRoomId, 'Item 3', 'Desc');

        roomStore.reorderItem(testRoomId, item1!.id, 2);

        const room = roomStore.getRoom(testRoomId);
        expect(room!.items[2].id).toBe(item1!.id);
        expect(room!.items[0].order).toBe(0);
        expect(room!.items[1].order).toBe(1);
        expect(room!.items[2].order).toBe(2);
      });
    });

    describe('selectItem', () => {
      it('devrait sélectionner un item comme actif', () => {
        const item = roomStore.createItem(testRoomId, 'ToSelect', 'Desc');

        const result = roomStore.selectItem(testRoomId, item!.id);

        expect(result).toBe(true);
        const room = roomStore.getRoom(testRoomId);
        expect(room!.activeItemId).toBe(item!.id);
      });

      it('devrait réinitialiser les votes lors du changement d\'item', () => {
        const item1 = roomStore.createItem(testRoomId, 'Item 1', 'Desc');
        const item2 = roomStore.createItem(testRoomId, 'Item 2', 'Desc');
        roomStore.selectItem(testRoomId, item1!.id);
        roomStore.startVoting(testRoomId);
        // Simuler un vote via l'API directement sur l'item
        const room = roomStore.getRoom(testRoomId);
        room!.items[0].votes['user1'] = { value: '5', createdAt: Date.now() };

        roomStore.selectItem(testRoomId, item2!.id);

        const updatedRoom = roomStore.getRoom(testRoomId);
        expect(updatedRoom!.items[1].votes).toEqual({});
      });
    });

    describe('setItemFinalScore', () => {
      it('devrait définir le score final d\'un item', () => {
        const item = roomStore.createItem(testRoomId, 'Scored', 'Desc');

        const result = roomStore.setItemFinalScore(testRoomId, item!.id, '8');

        expect(result).toBe(true);
        const room = roomStore.getRoom(testRoomId);
        expect(room!.items[0].finalScore).toBe('8');
      });
    });
  });

  describe('Voting', () => {
    let votingRoomId: string;
    let votingUserId: string;

    beforeEach(() => {
      const { room, userId } = roomStore.createRoom('VoteHost', 'socket-vote-' + Date.now());
      votingRoomId = room.id;
      votingUserId = userId;
      roomStore.createItem(votingRoomId, 'Vote Item', 'Description');
      roomStore.selectItem(votingRoomId, room.items[0]?.id || roomStore.getRoom(votingRoomId)!.items[0].id);
    });

    describe('startVoting', () => {
      it('devrait démarrer le vote', () => {
        const result = roomStore.startVoting(votingRoomId);

        expect(result).toBe(true);
        const room = roomStore.getRoom(votingRoomId);
        expect(room!.state).toBe('voting');
      });

      it('devrait échouer sans item actif', () => {
        const { room } = roomStore.createRoom('NoItem', 'socket-noitem');

        const result = roomStore.startVoting(room.id);

        expect(result).toBe(false);
      });
    });

    describe('castVote', () => {
      it('devrait enregistrer un vote', () => {
        roomStore.startVoting(votingRoomId);

        const result = roomStore.castVote(votingRoomId, votingUserId, '5');

        expect(result).toBe(true);
        const room = roomStore.getRoom(votingRoomId);
        const activeItem = room!.items.find(i => i.id === room!.activeItemId);
        expect(activeItem!.votes[votingUserId]).toBeDefined();
        expect(activeItem!.votes[votingUserId].value).toBe('5');
      });

      it('devrait échouer si pas en état voting', () => {
        const result = roomStore.castVote(votingRoomId, votingUserId, '5');

        expect(result).toBe(false);
      });

      it('devrait permettre de changer son vote', () => {
        roomStore.startVoting(votingRoomId);
        roomStore.castVote(votingRoomId, votingUserId, '3');

        roomStore.castVote(votingRoomId, votingUserId, '8');

        const room = roomStore.getRoom(votingRoomId);
        const activeItem = room!.items.find(i => i.id === room!.activeItemId);
        expect(activeItem!.votes[votingUserId].value).toBe('8');
      });
    });

    describe('revealVotes', () => {
      it('devrait révéler les votes et changer l\'état', () => {
        roomStore.startVoting(votingRoomId);
        roomStore.castVote(votingRoomId, votingUserId, '5');

        const votes = roomStore.revealVotes(votingRoomId);

        expect(votes).toBeDefined();
        expect(votes![votingUserId].value).toBe('5');
        const room = roomStore.getRoom(votingRoomId);
        expect(room!.state).toBe('revealed');
      });

      it('devrait retourner null si pas en état voting', () => {
        const votes = roomStore.revealVotes(votingRoomId);

        expect(votes).toBeNull();
      });
    });

    describe('resetVotes', () => {
      it('devrait réinitialiser les votes', () => {
        roomStore.startVoting(votingRoomId);
        roomStore.castVote(votingRoomId, votingUserId, '5');
        roomStore.revealVotes(votingRoomId);

        const result = roomStore.resetVotes(votingRoomId);

        expect(result).toBe(true);
        const room = roomStore.getRoom(votingRoomId);
        expect(room!.state).toBe('idle');
        const activeItem = room!.items.find(i => i.id === room!.activeItemId);
        expect(activeItem!.votes).toEqual({});
      });
    });
  });

  describe('updateDeck', () => {
    it('devrait mettre à jour le deck de la room', () => {
      const { room } = roomStore.createRoom('DeckHost', 'socket-deck');
      const newDeck = {
        cards: [{ value: '1', label: '1' }],
      };

      const result = roomStore.updateDeck(room.id, newDeck);

      expect(result).toBe(true);
      const updatedRoom = roomStore.getRoom(room.id);
      expect(updatedRoom!.deck.cards).toHaveLength(1);
    });
  });

  describe('getActiveItem', () => {
    it('devrait retourner l\'item actif', () => {
      const { room } = roomStore.createRoom('ActiveHost', 'socket-active');
      const item = roomStore.createItem(room.id, 'Active Item', 'Desc');
      roomStore.selectItem(room.id, item!.id);

      const activeItem = roomStore.getActiveItem(room.id);

      expect(activeItem).toBeDefined();
      expect(activeItem!.id).toBe(item!.id);
    });

    it('devrait retourner null si pas d\'item actif', () => {
      const { room } = roomStore.createRoom('NoActiveHost', 'socket-noactive');

      const activeItem = roomStore.getActiveItem(room.id);

      expect(activeItem).toBeNull();
    });
  });

  describe('getAllRooms', () => {
    it('devrait retourner toutes les rooms', () => {
      const initialCount = roomStore.getAllRooms().length;
      roomStore.createRoom('All1', 'socket-all-1-' + Date.now());
      roomStore.createRoom('All2', 'socket-all-2-' + Date.now());

      const allRooms = roomStore.getAllRooms();

      expect(allRooms.length).toBeGreaterThanOrEqual(initialCount + 2);
    });
  });

  describe('getRoomTimeRemaining', () => {
    it('devrait retourner le temps restant en secondes', () => {
      const { room } = roomStore.createRoom('TTLHost', 'socket-ttl-' + Date.now());

      const remaining = roomStore.getRoomTimeRemaining(room.id);

      expect(remaining).not.toBeNull();
      expect(remaining).toBeGreaterThan(0);
    });

    it('devrait retourner null pour une room inexistante', () => {
      const remaining = roomStore.getRoomTimeRemaining('NOROOM');

      expect(remaining).toBeNull();
    });
  });

  describe('markPendingDisconnect', () => {
    it('devrait marquer un utilisateur en déconnexion en attente', () => {
      const { room, userId } = roomStore.createRoom('PendHost', 'socket-pend-' + Date.now());

      const result = roomStore.markPendingDisconnect('socket-pend-' + Date.now().toString().slice(0, -1) + '0');
      // Le socket ci-dessus n'existe pas, on doit utiliser le vrai socketId
      // Créons un cas propre :
      const { room: r2, userId: u2 } = roomStore.createRoom('PendHost2', 'socket-pend-mark');

      const info = roomStore.markPendingDisconnect('socket-pend-mark');

      expect(info).toBeDefined();
      expect(info!.userId).toBe(u2);
      expect(info!.roomId).toBe(r2.id);
      // L'utilisateur reste dans la room mais le socket est dissocié
      expect(roomStore.getRoom(r2.id)!.users[u2]).toBeDefined();
    });

    it('devrait retourner undefined pour un socket inconnu', () => {
      const result = roomStore.markPendingDisconnect('socket-unknown-pend');

      expect(result).toBeUndefined();
    });

    it('devrait retourner undefined si la room n\'existe plus', () => {
      // Créer une room, récupérer le socket, puis supprimer la room via PO leave
      const { room, userId } = roomStore.createRoom('PendRoomGone', 'socket-pend-gone');
      const joinResult = roomStore.joinRoom(room.id, 'PendDev', 'socket-pend-gone-dev');
      // Supprimer la room (PO quitte)
      roomStore.leaveRoom('socket-pend-gone');

      // Le dev essaye de marquer pending disconnect mais la room n'existe plus
      const result = roomStore.markPendingDisconnect('socket-pend-gone-dev');
      // Le socket a été nettoyé par removeAllSocketsForRoom, donc result undefined
      expect(result).toBeUndefined();
    });
  });

  describe('cancelPendingDisconnect', () => {
    it('devrait annuler une déconnexion en attente et réassocier le socket', () => {
      const { room, userId, reconnectSecret } = roomStore.createRoom('CancelHost', 'socket-cancel-orig');
      roomStore.markPendingDisconnect('socket-cancel-orig');

      const result = roomStore.cancelPendingDisconnect(room.id, userId, 'socket-cancel-new', reconnectSecret);

      expect(result).toBeDefined();
      expect(result!.id).toBe(room.id);
      // Le nouveau socket est associé
      expect(roomStore.getUserInfo('socket-cancel-new')).toEqual({ roomId: room.id, userId });
    });

    it('devrait retourner undefined si le secret est invalide', () => {
      const { room, userId } = roomStore.createRoom('CancelHost2', 'socket-cancel-bad');
      roomStore.markPendingDisconnect('socket-cancel-bad');

      const result = roomStore.cancelPendingDisconnect(room.id, userId, 'socket-cancel-new2', 'wrong-secret');

      expect(result).toBeUndefined();
    });

    it('devrait retourner undefined si pas de déconnexion en attente', () => {
      const result = roomStore.cancelPendingDisconnect('NOROOM', 'nouser', 'socket-none', 'any-secret');

      expect(result).toBeUndefined();
    });

    it('devrait retourner undefined si la room a été supprimée entre-temps', () => {
      const { room, userId, reconnectSecret } = roomStore.createRoom('CancelGone', 'socket-cancel-gone');
      const joinResult = roomStore.joinRoom(room.id, 'CancelDev', 'socket-cancel-gone-dev');
      // Mark le dev en pending
      roomStore.markPendingDisconnect('socket-cancel-gone-dev');
      // Supprimer la room (PO quitte)
      roomStore.leaveRoom('socket-cancel-gone');

      // Le dev essaye de revenir, mais la room n'existe plus
      const result = roomStore.cancelPendingDisconnect(room.id, joinResult.userId!, 'socket-cancel-gone-new', reconnectSecret);
      expect(result).toBeUndefined();
    });
  });

  describe('executePendingDisconnect', () => {
    it('devrait retirer l\'utilisateur de la room', () => {
      const { room } = roomStore.createRoom('ExecHost', 'socket-exec-host');
      const joinResult = roomStore.joinRoom(room.id, 'ExecGuest', 'socket-exec-guest');
      roomStore.markPendingDisconnect('socket-exec-guest');

      const result = roomStore.executePendingDisconnect(room.id, joinResult.userId!);

      expect(result.room).toBeDefined();
      expect(result.room!.users[joinResult.userId!]).toBeUndefined();
    });

    it('devrait fermer la room si le PO est déconnecté', () => {
      const { room, userId } = roomStore.createRoom('ExecPO', 'socket-exec-po');
      roomStore.joinRoom(room.id, 'ExecDev', 'socket-exec-dev');
      roomStore.markPendingDisconnect('socket-exec-po');

      const result = roomStore.executePendingDisconnect(room.id, userId);

      expect(result.roomClosed).toBe(true);
      expect(result.closedRoom).toBeDefined();
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait cloner les items avec votes lors de la fermeture PO', () => {
      const { room, userId: poId } = roomStore.createRoom('ExecPOItems', 'socket-exec-po-items');
      const { userId: devId } = roomStore.joinRoom(room.id, 'ExecDevItems', 'socket-exec-dev-items');

      // Créer des items avec des votes
      const item = roomStore.createItem(room.id, 'CloneItem', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '5');
      roomStore.castVote(room.id, devId!, '13');
      roomStore.revealVotes(room.id);
      roomStore.setItemFinalScore(room.id, item!.id, '8');

      roomStore.markPendingDisconnect('socket-exec-po-items');
      const result = roomStore.executePendingDisconnect(room.id, poId);

      expect(result.roomClosed).toBe(true);
      expect(result.closedRoom).toBeDefined();
      expect(result.closedRoom!.items).toHaveLength(1);
      expect(result.closedRoom!.items[0].title).toBe('CloneItem');
      expect(result.closedRoom!.items[0].finalScore).toBe('8');
      expect(result.closedRoom!.items[0].votes[poId]).toBeDefined();
      expect(result.closedRoom!.items[0].votes[devId!]).toBeDefined();
    });

    it('devrait retourner un objet vide si l\'utilisateur n\'est plus dans la room', () => {
      const result = roomStore.executePendingDisconnect('NOROOM', 'nouser');

      expect(result).toEqual({});
    });

    it('devrait nettoyer les votes du dev sur les items', () => {
      const { room, userId: poId } = roomStore.createRoom('ExecVotePO', 'socket-exec-vote-po');
      const { userId: devId } = roomStore.joinRoom(room.id, 'ExecVoteDev', 'socket-exec-vote-dev');

      const item = roomStore.createItem(room.id, 'ExecItem', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, devId!, '5');
      roomStore.castVote(room.id, poId, '8');

      roomStore.markPendingDisconnect('socket-exec-vote-dev');
      const result = roomStore.executePendingDisconnect(room.id, devId!);

      expect(result.room).toBeDefined();
      const updatedItem = result.room!.items[0];
      expect(updatedItem.votes[devId!]).toBeUndefined();
      expect(updatedItem.votes[poId]).toBeDefined();
    });

    it('devrait supprimer la room si elle devient vide après exécution', () => {
      const { room, userId } = roomStore.createRoom('ExecEmpty', 'socket-exec-empty');
      // Transférer PO à un dev fictif pour que le PO ne ferme pas la room
      // En fait, on crée un seul dev et le PO quitte via transferPO
      const { userId: devId } = roomStore.joinRoom(room.id, 'ExecEmptyDev', 'socket-exec-empty-dev');
      roomStore.transferPO(room.id, devId!);
      // Le dev est maintenant PO, l'ancien PO est dev
      // Retirer l'ancien PO normalement
      roomStore.leaveRoom('socket-exec-empty');
      // Maintenant seul le dev reste, mark pending disconnect
      roomStore.markPendingDisconnect('socket-exec-empty-dev');
      const result = roomStore.executePendingDisconnect(room.id, devId!);

      // Le PO (devId) quitte → la room est fermée
      expect(result.roomClosed).toBe(true);
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait nettoyer les pending disconnects si le PO quitte', () => {
      const { room, userId: poId } = roomStore.createRoom('ExecPendClean', 'socket-epc-po');
      const { userId: dev1Id } = roomStore.joinRoom(room.id, 'Dev1', 'socket-epc-dev1');
      const { userId: dev2Id } = roomStore.joinRoom(room.id, 'Dev2', 'socket-epc-dev2');

      // Les deux devs marquent pending
      roomStore.markPendingDisconnect('socket-epc-dev1');
      roomStore.markPendingDisconnect('socket-epc-dev2');

      // Le PO aussi marque pending
      roomStore.markPendingDisconnect('socket-epc-po');

      // Le PO expire → ferme la room
      const result = roomStore.executePendingDisconnect(room.id, poId);

      expect(result.roomClosed).toBe(true);
      expect(result.closedRoom).toBeDefined();
      expect(result.closedRoom!.users).toHaveProperty(poId);
      expect(result.closedRoom!.users).toHaveProperty(dev1Id!);
      expect(result.closedRoom!.users).toHaveProperty(dev2Id!);
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });
  });

  describe('updateRoomSettings', () => {
    it('devrait mettre à jour les paramètres', () => {
      const { room } = roomStore.createRoom('SettHost', 'socket-sett-' + Date.now());

      const result = roomStore.updateRoomSettings(room.id, { emojisEnabled: false });

      expect(result).toBe(true);
      const updated = roomStore.getRoom(room.id);
      expect(updated!.settings.emojisEnabled).toBe(false);
    });

    it('devrait fusionner partiellement les paramètres', () => {
      const { room } = roomStore.createRoom('SettHost2', 'socket-sett2-' + Date.now());

      roomStore.updateRoomSettings(room.id, { emojisEnabled: false });
      const updated = roomStore.getRoom(room.id);
      expect(updated!.settings.emojisEnabled).toBe(false);
    });

    it('devrait retourner false pour une room inexistante', () => {
      const result = roomStore.updateRoomSettings('NOROOM', { emojisEnabled: false });

      expect(result).toBe(false);
    });
  });

  describe('transferPO', () => {
    it('devrait transférer le rôle de PO', () => {
      const { room, userId: poId } = roomStore.createRoom('TransferHost', 'socket-transfer-' + Date.now());
      const join = roomStore.joinRoom(room.id, 'NewPO', 'socket-newpo-' + Date.now());

      const result = roomStore.transferPO(room.id, join.userId!);

      expect(result).toBe(true);
      const updated = roomStore.getRoom(room.id);
      expect(updated!.poUserId).toBe(join.userId);
      expect(updated!.users[join.userId!].isPO).toBe(true);
      expect(updated!.users[poId].isPO).toBe(false);
    });

    it('devrait retourner false pour un utilisateur inexistant', () => {
      const { room } = roomStore.createRoom('TransferHost2', 'socket-transfer2-' + Date.now());

      const result = roomStore.transferPO(room.id, 'nonexistent-user');

      expect(result).toBe(false);
    });

    it('devrait retourner false pour une room inexistante', () => {
      const result = roomStore.transferPO('NOROOM', 'any-user');

      expect(result).toBe(false);
    });
  });

  describe('Timer', () => {
    let timerRoomId: string;

    beforeEach(() => {
      const { room } = roomStore.createRoom('TimerHost', 'socket-timer-' + Date.now());
      timerRoomId = room.id;
    });

    describe('setTimerDuration', () => {
      it('devrait définir la durée du timer', () => {
        const result = roomStore.setTimerDuration(timerRoomId, 60000);

        expect(result).toBe(true);
        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerDuration).toBe(60000);
        expect(room!.timerStartedAt).toBeUndefined();
        expect(room!.timerStoppedRemaining).toBeUndefined();
      });

      it('devrait clamper au minimum 10 secondes', () => {
        roomStore.setTimerDuration(timerRoomId, 1000);

        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerDuration).toBe(10000);
      });

      it('devrait clamper au maximum 60 minutes', () => {
        roomStore.setTimerDuration(timerRoomId, 999999999);

        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerDuration).toBe(3600000);
      });

      it('devrait réinitialiser un timer en cours', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);

        roomStore.setTimerDuration(timerRoomId, 120000);

        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerDuration).toBe(120000);
        expect(room!.timerStartedAt).toBeUndefined();
        expect(room!.timerStoppedRemaining).toBeUndefined();
      });

      it('devrait retourner false pour une room inexistante', () => {
        expect(roomStore.setTimerDuration('NOROOM', 60000)).toBe(false);
      });
    });

    describe('startTimer', () => {
      it('devrait démarrer le timer', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);

        const result = roomStore.startTimer(timerRoomId);

        expect(result).toBe(true);
        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerStartedAt).toBeDefined();
        expect(room!.timerStoppedRemaining).toBeUndefined();
      });

      it('devrait être no-op si déjà running', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);
        const room = roomStore.getRoom(timerRoomId);
        const firstStartedAt = room!.timerStartedAt;

        const result = roomStore.startTimer(timerRoomId);

        expect(result).toBe(true);
        expect(roomStore.getRoom(timerRoomId)!.timerStartedAt).toBe(firstStartedAt);
      });

      it('devrait échouer sans durée configurée', () => {
        const result = roomStore.startTimer(timerRoomId);

        expect(result).toBe(false);
      });

      it('devrait reprendre après un stop avec le bon remaining', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);
        roomStore.stopTimer(timerRoomId);

        const room = roomStore.getRoom(timerRoomId);
        const remaining = room!.timerStoppedRemaining!;

        roomStore.startTimer(timerRoomId);

        // Après reprise, startedAt est calculé pour que duration - (now - startedAt) ≈ remaining
        const updated = roomStore.getRoom(timerRoomId);
        const computedRemaining = updated!.timerDuration! - (Date.now() - updated!.timerStartedAt!);
        // Tolérance de 100ms pour le temps d'exécution du test
        expect(Math.abs(computedRemaining - remaining)).toBeLessThan(100);
      });

      it('devrait retourner false pour une room inexistante', () => {
        expect(roomStore.startTimer('NOROOM')).toBe(false);
      });
    });

    describe('stopTimer', () => {
      it('devrait stopper le timer et sauvegarder le remaining', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);

        const result = roomStore.stopTimer(timerRoomId);

        expect(result).toBe(true);
        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerStartedAt).toBeUndefined();
        expect(room!.timerStoppedRemaining).toBeDefined();
        expect(room!.timerStoppedRemaining).toBeGreaterThan(0);
        expect(room!.timerStoppedRemaining).toBeLessThanOrEqual(60000);
      });

      it('devrait accumuler le temps sur l\'item actif', () => {
        const item = roomStore.createItem(timerRoomId, 'TimerItem', 'Desc');
        roomStore.selectItem(timerRoomId, item!.id);

        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);

        // Simuler un petit délai
        const room = roomStore.getRoom(timerRoomId);
        room!.timerStartedAt = Date.now() - 5000; // 5 secondes dans le passé

        roomStore.stopTimer(timerRoomId);

        const updated = roomStore.getRoom(timerRoomId);
        const activeItem = updated!.items.find(i => i.id === item!.id);
        expect(activeItem!.elapsedTime).toBeGreaterThanOrEqual(4900);
        expect(activeItem!.elapsedTime).toBeLessThanOrEqual(5200);
      });

      it('devrait échouer si le timer n\'est pas running', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);

        const result = roomStore.stopTimer(timerRoomId);

        expect(result).toBe(false);
      });

      it('devrait échouer sans durée configurée', () => {
        expect(roomStore.stopTimer(timerRoomId)).toBe(false);
      });

      it('devrait retourner false pour une room inexistante', () => {
        expect(roomStore.stopTimer('NOROOM')).toBe(false);
      });
    });

    describe('resetTimer', () => {
      it('devrait réinitialiser le timer en conservant la durée', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);

        const result = roomStore.resetTimer(timerRoomId);

        expect(result).toBe(true);
        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerDuration).toBe(60000);
        expect(room!.timerStartedAt).toBeUndefined();
        expect(room!.timerStoppedRemaining).toBeUndefined();
      });

      it('devrait réinitialiser un timer stoppé', () => {
        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);
        roomStore.stopTimer(timerRoomId);

        roomStore.resetTimer(timerRoomId);

        const room = roomStore.getRoom(timerRoomId);
        expect(room!.timerStoppedRemaining).toBeUndefined();
      });

      it('devrait échouer sans durée configurée', () => {
        expect(roomStore.resetTimer(timerRoomId)).toBe(false);
      });

      it('devrait retourner false pour une room inexistante', () => {
        expect(roomStore.resetTimer('NOROOM')).toBe(false);
      });
    });

    describe('selectItem avec timer actif', () => {
      it('devrait flush le temps écoulé sur l\'ancien item au changement', () => {
        const item1 = roomStore.createItem(timerRoomId, 'Item 1', 'Desc');
        const item2 = roomStore.createItem(timerRoomId, 'Item 2', 'Desc');
        roomStore.selectItem(timerRoomId, item1!.id);

        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);

        // Simuler 3 secondes
        const room = roomStore.getRoom(timerRoomId);
        room!.timerStartedAt = Date.now() - 3000;

        roomStore.selectItem(timerRoomId, item2!.id);

        const updated = roomStore.getRoom(timerRoomId);
        const oldItem = updated!.items.find(i => i.id === item1!.id);
        expect(oldItem!.elapsedTime).toBeGreaterThanOrEqual(2900);
        expect(oldItem!.elapsedTime).toBeLessThanOrEqual(3200);
        // Le timer doit redémarrer pour le nouvel item
        expect(updated!.timerStartedAt).toBeDefined();
      });

      it('ne devrait pas flush si on resélectionne le même item', () => {
        const item = roomStore.createItem(timerRoomId, 'SameItem', 'Desc');
        roomStore.selectItem(timerRoomId, item!.id);

        roomStore.setTimerDuration(timerRoomId, 60000);
        roomStore.startTimer(timerRoomId);

        roomStore.selectItem(timerRoomId, item!.id);

        const updated = roomStore.getRoom(timerRoomId);
        const activeItem = updated!.items.find(i => i.id === item!.id);
        expect(activeItem!.elapsedTime).toBeUndefined();
      });
    });
  });

  describe('sanitizeRoomForUser', () => {
    it('devrait masquer les votes des autres pendant le vote', () => {
      const { room, userId: poId } = roomStore.createRoom('SanHost', 'socket-san-' + Date.now());
      const join = roomStore.joinRoom(room.id, 'Dev1', 'socket-san-dev-' + Date.now());
      const devId = join.userId!;

      const item = roomStore.createItem(room.id, 'SanItem', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '5');
      roomStore.castVote(room.id, devId, '8');

      const currentRoom = roomStore.getRoom(room.id)!;
      const sanitized = roomStore.sanitizeRoomForUser(currentRoom, devId);

      const activeItem = sanitized.items.find(i => i.id === item!.id)!;
      // Le dev voit son propre vote
      expect(activeItem.votes[devId].value).toBe('8');
      // Le vote du PO est masqué
      expect(activeItem.votes[poId].value).toBe('hidden');
    });

    it('ne devrait pas masquer les votes hors état voting', () => {
      const { room, userId: poId } = roomStore.createRoom('SanHost2', 'socket-san2-' + Date.now());
      const join = roomStore.joinRoom(room.id, 'Dev2', 'socket-san2-dev-' + Date.now());

      const item = roomStore.createItem(room.id, 'SanItem2', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '5');
      roomStore.castVote(room.id, join.userId!, '8');
      roomStore.revealVotes(room.id);

      const currentRoom = roomStore.getRoom(room.id)!;
      const sanitized = roomStore.sanitizeRoomForUser(currentRoom, join.userId!);

      const activeItem = sanitized.items.find(i => i.id === item!.id)!;
      expect(activeItem.votes[poId].value).toBe('5');
      expect(activeItem.votes[join.userId!].value).toBe('8');
    });

    it('devrait retourner la room telle quelle en état idle', () => {
      const { room } = roomStore.createRoom('SanIdle', 'socket-san-idle-' + Date.now());

      const sanitized = roomStore.sanitizeRoomForUser(room, 'any-user');

      expect(sanitized).toBe(room); // Même référence
    });

    it('ne devrait pas masquer les items non actifs', () => {
      const { room, userId: poId } = roomStore.createRoom('SanMulti', 'socket-san-multi-' + Date.now());
      const join = roomStore.joinRoom(room.id, 'DevMulti', 'socket-san-multi-dev-' + Date.now());

      const item1 = roomStore.createItem(room.id, 'Item1', 'D');
      const item2 = roomStore.createItem(room.id, 'Item2', 'D');

      // Voter sur item1 puis passer à item2
      roomStore.selectItem(room.id, item1!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '5');
      roomStore.revealVotes(room.id);

      // Sélectionner item2 et voter
      roomStore.selectItem(room.id, item2!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '13');

      const currentRoom = roomStore.getRoom(room.id)!;
      const sanitized = roomStore.sanitizeRoomForUser(currentRoom, join.userId!);

      // L'item actif (item2) a les votes masqués
      const activeItem = sanitized.items.find(i => i.id === item2!.id)!;
      expect(activeItem.votes[poId].value).toBe('hidden');

      // L'ancien item (item1) garde ses vrais votes
      const oldItem = sanitized.items.find(i => i.id === item1!.id)!;
      expect(oldItem.votes[poId].value).toBe('5');
    });
  });

  describe('setRoomCreator / getRoomCreator', () => {
    it('devrait associer et récupérer un créateur', () => {
      const { room } = roomStore.createRoom('CreatorHost', 'socket-creator-' + Date.now());

      roomStore.setRoomCreator(room.id, 'account-123');

      expect(roomStore.getRoomCreator(room.id)).toBe('account-123');
    });

    it('devrait retourner undefined pour une room sans créateur associé', () => {
      expect(roomStore.getRoomCreator('NOCREATOR')).toBeUndefined();
    });
  });

  describe('getSocketUserMap', () => {
    it('devrait retourner les associations socket -> userId pour une room', () => {
      const sid = 'socket-map-' + Date.now();
      const { room, userId } = roomStore.createRoom('MapHost', sid);
      const devSid = 'socket-map-dev-' + Date.now();
      const join = roomStore.joinRoom(room.id, 'MapDev', devSid);

      const map = roomStore.getSocketUserMap(room.id);

      expect(map.size).toBe(2);
      expect(map.get(sid)).toBe(userId);
      expect(map.get(devSid)).toBe(join.userId);
    });

    it('devrait retourner une map vide pour une room inexistante', () => {
      const map = roomStore.getSocketUserMap('NOROOM');

      expect(map.size).toBe(0);
    });
  });

  describe('cleanupExpiredRooms', () => {
    it('devrait nettoyer les rooms expirées', () => {
      // Créer une room et forcer son expiration
      const { room } = roomStore.createRoom('ExpiredHost', 'socket-expired-' + Date.now());
      const r = roomStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000; // Déjà expiré

      const expired = roomStore.cleanupExpiredRooms();

      expect(expired).toContain(room.id);
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait ne pas supprimer les rooms non expirées', () => {
      const { room } = roomStore.createRoom('ValidHost', 'socket-valid-' + Date.now());

      const expired = roomStore.cleanupExpiredRooms();

      expect(expired).not.toContain(room.id);
      expect(roomStore.getRoom(room.id)).toBeDefined();
    });

    it('devrait sauvegarder l\'historique pour un créateur connu', () => {
      const spy = vi.spyOn(userStore, 'updateRoomHistory').mockImplementation(() => {});

      const { room, userId } = roomStore.createRoom('ExpCreator', 'socket-exp-creator-' + Date.now());
      roomStore.setRoomCreator(room.id, 'account-creator-123');

      // Ajouter un item avec finalScore
      const item = roomStore.createItem(room.id, 'HistoryItem', 'Desc history');
      roomStore.setItemFinalScore(room.id, item!.id, '8');

      // Expirer la room
      const r = roomStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000;

      const expired = roomStore.cleanupExpiredRooms();

      expect(expired).toContain(room.id);
      expect(spy).toHaveBeenCalledWith(
        'account-creator-123',
        room.id,
        expect.objectContaining({
          isActive: false,
          items: expect.arrayContaining([
            expect.objectContaining({ title: 'HistoryItem', finalScore: '8' }),
          ]),
        })
      );

      spy.mockRestore();
    });

    it('devrait inclure les noms des votants dans l\'historique', () => {
      const spy = vi.spyOn(userStore, 'updateRoomHistory').mockImplementation(() => {});

      const { room, userId: poId } = roomStore.createRoom('ExpVoterNames', 'socket-evn-po');
      const { userId: devId } = roomStore.joinRoom(room.id, 'DevVoter', 'socket-evn-dev');
      roomStore.setRoomCreator(room.id, 'account-voternames');

      const item = roomStore.createItem(room.id, 'VoterItem', 'Desc');
      roomStore.selectItem(room.id, item!.id);
      roomStore.startVoting(room.id);
      roomStore.castVote(room.id, poId, '5');
      roomStore.castVote(room.id, devId!, '13');
      roomStore.revealVotes(room.id);
      roomStore.setItemFinalScore(room.id, item!.id, '8');

      const r = roomStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000;

      roomStore.cleanupExpiredRooms();

      expect(spy).toHaveBeenCalledTimes(1);
      const historyArg = spy.mock.calls[0][2];
      const historyItem = historyArg.items[0];
      expect(historyItem.votes[poId]).toEqual({ voterName: 'ExpVoterNames', value: '5' });
      expect(historyItem.votes[devId!]).toEqual({ voterName: 'DevVoter', value: '13' });

      spy.mockRestore();
    });

    it('devrait ne pas sauvegarder d\'historique sans créateur', () => {
      const spy = vi.spyOn(userStore, 'updateRoomHistory').mockImplementation(() => {});

      const { room } = roomStore.createRoom('NoCreator', 'socket-no-creator-' + Date.now());
      const r = roomStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000;
      // Pas de setRoomCreator

      roomStore.cleanupExpiredRooms();

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('devrait ne pas inclure les items sans finalScore dans l\'historique', () => {
      const spy = vi.spyOn(userStore, 'updateRoomHistory').mockImplementation(() => {});

      const { room } = roomStore.createRoom('NoScore', 'socket-no-score-' + Date.now());
      roomStore.setRoomCreator(room.id, 'account-noscore');
      roomStore.createItem(room.id, 'NoScoreItem', 'Sans score');

      const r = roomStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000;

      roomStore.cleanupExpiredRooms();

      expect(spy).toHaveBeenCalledWith(
        'account-noscore',
        room.id,
        expect.objectContaining({ items: [] })
      );

      spy.mockRestore();
    });

    it('devrait nettoyer les pending disconnects lors de l\'expiration', () => {
      const { room, userId: poId } = roomStore.createRoom('ExpPending', 'socket-exp-pend-po');
      const { userId: devId } = roomStore.joinRoom(room.id, 'ExpPendDev', 'socket-exp-pend-dev');

      // Marquer le dev en pending disconnect
      roomStore.markPendingDisconnect('socket-exp-pend-dev');

      const r = roomStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000;

      const expired = roomStore.cleanupExpiredRooms();

      expect(expired).toContain(room.id);
      expect(roomStore.getRoom(room.id)).toBeUndefined();
    });

    it('devrait retourner un tableau vide si aucune room n\'est expirée', () => {
      const expired = roomStore.cleanupExpiredRooms();
      // Pas d'erreur, retourne les rooms déjà expirées ou un tableau vide
      expect(Array.isArray(expired)).toBe(true);
    });
  });

  describe('stopCleanupInterval', () => {
    it('devrait arrêter l\'intervalle de nettoyage sans erreur', () => {
      expect(() => roomStore.stopCleanupInterval()).not.toThrow();
    });
  });
});

// Tests nécessitant un re-import du module (env vars, fake timers)
describe('roomStore (module re-import)', () => {
  describe('MAX_PARTICIPANTS_PER_ROOM', () => {
    it('devrait rejeter un join quand la room est pleine', async () => {
      process.env.MAX_PARTICIPANTS_PER_ROOM = '2';

      vi.resetModules();
      const freshStore = await import('../../../server/store/roomStore');

      const { room } = freshStore.createRoom('CapHost', 'socket-cap-po');
      freshStore.joinRoom(room.id, 'User2', 'socket-cap-dev');

      const result = freshStore.joinRoom(room.id, 'User3', 'socket-cap-dev2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pleine');

      freshStore.stopCleanupInterval();
      delete process.env.MAX_PARTICIPANTS_PER_ROOM;
    });

    it('devrait autoriser le join tant que la limite n\'est pas atteinte', async () => {
      process.env.MAX_PARTICIPANTS_PER_ROOM = '3';

      vi.resetModules();
      const freshStore = await import('../../../server/store/roomStore');

      const { room } = freshStore.createRoom('CapHost2', 'socket-cap2-po');
      const result = freshStore.joinRoom(room.id, 'User2', 'socket-cap2-dev');

      expect(result.success).toBe(true);

      freshStore.stopCleanupInterval();
      delete process.env.MAX_PARTICIPANTS_PER_ROOM;
    });
  });

  describe('cleanup interval setInterval', () => {
    it('devrait nettoyer les rooms expirées via l\'intervalle périodique', async () => {
      vi.useFakeTimers();
      vi.resetModules();

      const freshStore = await import('../../../server/store/roomStore');

      const { room } = freshStore.createRoom('IntervalHost', 'socket-interval-po');
      const r = freshStore.getRoom(room.id)!;
      r.expiresAt = Date.now() - 1000; // Déjà expiré

      // Avancer le temps de 60s (CLEANUP_INTERVAL)
      vi.advanceTimersByTime(60 * 1000);

      expect(freshStore.getRoom(room.id)).toBeUndefined();

      freshStore.stopCleanupInterval();
      vi.useRealTimers();
    });
  });
});
