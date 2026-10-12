# Règles métier

## Gestion des rooms

### Création
- Un code unique de 6 caractères est généré (A-Z, 2-9, sans confusion 0/O, 1/I/L)
- Le créateur devient automatiquement l'organisateur
- Le mot de passe est optionnel
- Si l'utilisateur est connecté, son deck et sa table personnalisés sont appliqués
- La room est ajoutée à l'historique de l'utilisateur connecté
- Durée de vie configurable via `ROOM_TTL_MINUTES` (défaut 180 min)

### Accès
- Tout le monde peut rejoindre avec le code
- Si mot de passe défini, il est requis pour rejoindre
- Un utilisateur ne peut être que dans une seule room à la fois : créer ou rejoindre une room quitte la précédente (si c'était celle dont il est PO, elle est fermée pour tous)

### Fermeture
La suppression d'une room est centralisée (`roomStore.deleteRoomState`) et notifiée par un listener (`room:closed`). Cas de fermeture :
- **PO parti** (`room:leave`) : room fermée pour tous, raison `po_left`
- **PO non revenu** après une déconnexion : fermée à l'issue du délai de grâce (`RECONNECT_GRACE_PERIOD_MS`, défaut 30 000 ms), raison `po_left`
- **TTL expiré** : fermée, raison `expired` (notification + retour accueil côté client)
- **Dernière personne partie** : room supprimée, sans notification
- Un développeur qui part ou ne revient pas dans le délai de grâce est simplement retiré de la room
- Les uploads de la room (`public/uploads/<ROOMID>/`) sont supprimés à la fermeture
- L'historique du créateur est **clos dans tous les cas** (`is_active = 0`, `closed_at`). Au démarrage du serveur, tous les historiques encore actifs sont clos (les rooms étant en mémoire, elles ne survivent pas à un redémarrage)

## Rôles

### Organisateur (PO/PM)
**Peut :**
- Créer/modifier/supprimer des items
- Sélectionner l'item actif
- Démarrer le vote
- Révéler les votes
- Réinitialiser les votes
- Valider le score final
- Passer à l'item suivant
- Importer son backlog

**Ne peut pas :**
- Être désigné autrement que créateur de la room

### Développeur
**Peut :**
- Voter sur l'item actif
- Changer son vote avant révélation
- Envoyer des emojis aux autres

**Ne peut pas :**
- Gérer les items
- Contrôler le flux de vote

## Cycle de vote

### États de la room

```
IDLE --> VOTING --> REVEALED
  ^         |          |
  |         v          |
  +-------- RESET <----+
```

1. **IDLE** : En attente, pas de vote en cours
2. **VOTING** : Vote en cours, cartes cachées
3. **REVEALED** : Votes révélés, cartes visibles

### Transitions

| De | Vers | Action | Qui |
|----|------|--------|-----|
| IDLE | VOTING | Démarrer le vote | Organisateur |
| VOTING | REVEALED | Révéler | Organisateur |
| VOTING | IDLE | Reset | Organisateur |
| REVEALED | IDLE | Reset | Organisateur |
| * | IDLE | Sélectionner item | Organisateur |

### Règles de vote

1. Seul l'organisateur peut démarrer un vote
2. Il faut un item sélectionné pour voter
3. Un participant peut changer son vote tant que non révélé
4. L'organisateur reçoit automatiquement "?" au démarrage
5. Les votes sont visibles uniquement après révélation
6. Le dos de la carte s'affiche si le participant a voté

## Calcul des statistiques

### Valeurs numériques
- Les cartes ?, coffee sont exclues des calculs
- Moyenne : somme / nombre de votes numériques
- Médiane : valeur centrale triée
- Min/Max : extrêmes des votes numériques

### Suggestion de score
- Par défaut : médiane si disponible
- Sinon : moyenne arrondie

## Comptes utilisateurs

### Stockage
- Base de données SQLite (`data/pokerplanning.db`)
- Mots de passe hachés avec bcrypt
- Session maintenue via localStorage côté client
- Association socket <-> compte pour les actions

### Authentification
- Inscription avec email unique, mot de passe, nom, rôle
- Connexion avec email et mot de passe
- Déconnexion avec nettoyage de session

### Reset de mot de passe
- Demande avec email ; code à 6 chiffres envoyé par email (réponse identique que le compte existe ou non)
- Vérification et reset avec **email + code** ; le code est stocké haché (sha256 de `userId:code`)
- Expiration après 1 heure, usage unique, **5 essais** par code
- Message d'échec **unique** pour tous les cas (code faux, expiré, utilisé, trop d'essais, email inconnu) : « Code invalide ou expiré. Vous pouvez demander un nouveau code. »
- Limites : demande 3/min par IP, 3/min, 5/heure et 10/24 h par email ; vérification 5/min par IP
- Un reset réussi change le mot de passe (haché), marque le code utilisé et **révoque toutes les sessions** du compte (base de données et sockets connectés)

### Reconnexion
- Au refresh, tentative de reconnexion automatique
- Le compte est conservé même après redémarrage du serveur
- L'utilisateur peut se reconnecter avec ses identifiants

### Personnalisations
- Stockées dans le compte utilisateur (SQLite)
- Appliquées à la création de room
- Partagées avec tous les participants de la room

## Backlog

### Gestion
- Chaque utilisateur a son propre backlog
- Items avec titre et description
- Persistance en base de données
- Chaque item à estimer reçoit automatiquement une priorité (1, 2, 3...)
- Les priorités peuvent être réordonnées par drag & drop ou boutons haut/bas
- Les priorités sont recompactées automatiquement après suppression ou estimation d'un item

### Import
- L'organisateur peut importer son backlog dans une room
- Les items deviennent des items de la room
- L'import dans une room respecte l'ordre de priorité du backlog
- L'original n'est pas modifié

## Emojis

### Envoi
- Cliquer sur un participant (pas soi-même)
- Choisir un emoji dans le picker
- L'emoji vole vers la cible

### Réception
- Tous les participants voient l'animation
- L'emoji part du centre (si c'est soi) ou de l'avatar de l'envoyeur
- Animation de 1.5 secondes

### Emojis disponibles
- Bière
- Boule de papier
- Avion en papier
- Dollar

## Historique

### Sauvegarde
- À chaque validation de score
- À la fermeture de la room
- Stocké : items, votes, participants

### Consultation
- Via la page profil
- Détails expandables par room
- Suppression possible

## Administration

### Accès
- Uniquement si l'email du compte correspond à `ADMIN_EMAIL`
- Page `/admin` protégée
- `ADMIN_SECRET_PATH` (optionnel) masque `/admin` ; valeur **figée au build** (rebuild nécessaire pour la changer), passée en build arg Docker et donc visible dans `docker history`. L'accès reste de toute façon contrôlé côté serveur (`isAdmin`)
- ⚠️ Sécurité : le premier compte inscrit avec l'email `ADMIN_EMAIL` obtient les droits admin. L'adresse n'est pas vérifiée. Créez ce compte **immédiatement après le premier déploiement, avant toute exposition publique**. Sinon, n'importe qui connaissant ou devinant l'adresse peut s'approprier l'administration.

### Fonctionnalités
- Statistiques globales (utilisateurs, sessions)
- Liste des utilisateurs, suppression d'un utilisateur (sessions socket invalidées, uploads supprimés)
- Gestion des sessions (révocation)
- Rooms actives (`admin:getActiveRooms`), historiques et backlogs

## Limites

### Uploads
- Taille max : 2 Mo par image
- Formats : PNG, JPG, WEBP

### Texte
- Nom utilisateur : 30 caractères max
- Titre item : 200 caractères max
- Description item : 1000 caractères max
- Mot de passe room : 50 caractères max

### Rooms
- TTL configurable (défaut 180 min)
- Max participants configurable (`MAX_PARTICIPANTS_PER_ROOM`, défaut illimité)
- Création de room : `ROOM_CREATE_RATE_LIMIT_PER_MINUTE` par IP (défaut 10, `0` = pas de limite)
- Plafond global de rooms actives : `MAX_ACTIVE_ROOMS` (défaut `0` = illimité)
- Délai de grâce après déconnexion : `RECONNECT_GRACE_PERIOD_MS` (défaut 30 000)
- Connexions WebSocket par IP : `MAX_WS_CONNECTIONS_PER_IP` (défaut 20, `0` = illimité)

### Adresse IP du client
- `TRUST_PROXY` = nombre de reverse proxies de confiance (défaut 0 : `X-Forwarded-For` ignoré ; `true` vaut 1)
- `X-Forwarded-For` est lu **depuis la droite** : les entrées de gauche sont fournies par le client
- Derrière un proxy, la variable est obligatoire : sinon tous les clients ont l'IP du proxy et les limites deviennent globales. Derrière deux proxys (CDN + nginx), utiliser `TRUST_PROXY=2`
