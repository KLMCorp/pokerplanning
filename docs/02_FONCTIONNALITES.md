# Fonctionnalités

## 1. Gestion des rooms

### Création de room
- Code unique à 6 caractères alphanumériques (A-Z, 2-9 sans confusion)
- Protection par mot de passe optionnelle
- Le créateur devient automatiquement l'organisateur
- Application automatique des personnalisations (deck, table) de l'utilisateur connecté
- Durée de vie configurable (TTL, défaut 180 minutes) ; à l'expiration, les participants reçoivent `room:closed` (raison `expired`), un toast et retournent à l'accueil
- Créer une room quitte la room précédente du même socket
- Limite de création : `ROOM_CREATE_RATE_LIMIT_PER_MINUTE` par IP (défaut 10, 0 = illimité) et plafond global `MAX_ACTIVE_ROOMS` (0 = illimité)

### Rejoindre une room
- Saisie du code room et du nom
- Vérification du mot de passe si requis
- Lien partageable pour invitation directe
- Rejoindre une room quitte la room précédente du même socket

### Quitter une room
- **Organisateur qui part** (`room:leave`) : la room est fermée pour tous, les participants reçoivent `room:closed` (raison `po_left`), un toast et retournent à l'accueil
- **Développeur qui part** : il est retiré de la room (ses votes sont supprimés), les autres reçoivent `room:updated`
- **Délai de grâce** : après une déconnexion (F5, coupure réseau), l'utilisateur reste dans la room pendant 30 s (`RECONNECT_GRACE_PERIOD_MS`) et peut se reconnecter avec `room:reconnect`. S'il ne revient pas : retiré de la room ; si c'est l'organisateur, la room est fermée pour tous (`po_left`)
- La room est supprimée quand le dernier participant part
- L'historique est clos pour le créateur dans tous les cas de fermeture

## 2. Système de comptes

### Inscription / Connexion
- Compte avec email, mot de passe, nom
- Choix du rôle : Développeur ou Organisateur (PO/PM)
- Persistance de session via localStorage
- Mot de passe hashé avec bcrypt

### Reset de mot de passe
- Demande par email, puis saisie de l'email **et** du code à 6 chiffres
- Expiration après 1 heure, usage unique, 5 essais par code
- Message d'échec unique (« Code invalide ou expiré. Vous pouvez demander un nouveau code. »), sans révéler si le compte existe
- Limites : 3 demandes/min par IP, 3 demandes/min, 5/heure et 10/24 h par email
- Un reset réussi révoque toutes les sessions du compte (base et sockets connectés)

### Page profil
- Visualisation des informations du compte
- Avatar personnalisable (upload d'image)
- Historique des rooms créées
- Personnalisation des cartes
- Personnalisation de la table de poker

### Historique des rooms
- Liste des rooms créées par l'utilisateur
- Détails : code, date, nombre de participants, items estimés
- Visualisation des votes par item
- Suppression de l'historique

## 3. Gestion des items

### Création d'items (Organisateur)
- Titre obligatoire
- Description optionnelle
- Ajout à la liste des items

### Modification / Suppression
- Édition du titre et de la description
- Suppression d'un item
- Réordonnancement par drag & drop

### Sélection d'item
- L'organisateur sélectionne l'item à estimer
- Reset automatique des votes lors du changement d'item

### Score final
- Après révélation, l'organisateur valide un score
- Score suggéré (médiane) ou personnalisé

## 4. Système de vote

### Déroulement
1. L'organisateur sélectionne un item
2. L'organisateur démarre le vote
3. Les participants choisissent leur carte
4. L'organisateur révèle les votes
5. Discussion et validation du score

### Cartes disponibles
- Valeurs : 0, 1, 2, 3, 5, 8, 13, 20, 40, 100
- Cartes spéciales : ? (incertain), café (pause)

### Changement de vote
- Possible tant que les votes ne sont pas révélés
- Visible uniquement après révélation

### Statistiques
- Moyenne des votes numériques
- Médiane
- Min / Max
- Nombre de votants

## 5. Gestion du backlog

### Backlog personnel
- Chaque utilisateur connecté a son propre backlog
- Création, modification, suppression d'items
- Persistance en base de données
- Priorité automatique pour les items à estimer
- Réordonnancement par drag & drop ou boutons haut/bas
- Les priorités sont recompactées automatiquement après suppression

### Import dans une room
- L'organisateur peut importer son backlog dans une room
- Les items importés deviennent des items de la room
- Suivi des items estimés

## 6. Personnalisation

### Avatar
- Upload d'une image personnalisée
- Formats : PNG, JPG, WEBP
- Taille max : 2 Mo
- Affiché dans le header et la table

### Cartes
- Image personnalisée pour le dos des cartes
- Image personnalisée pour chaque carte (recto)
- Appliqué automatiquement lors de la création de room
- 4 dos de cartes par défaut (carreau, coeur, pique, trèfle) assignés aléatoirement
- Couleur de fond des cartes personnalisable par utilisateur

### Paramètres du deck de la room (DeckSettings)
- Accessible à l'organisateur depuis les contrôles de la room (si les uploads sont activés)
- Import ou retrait d'un dos commun et d'un recto par carte, via `deck:uploadImage` et `deck:update`
- Propre à la room : le deck du compte n'est pas modifié
- Le dos de room est prioritaire sur le dos personnel des participants

### Table de poker
- Couleur du feutre (5 options)
- Couleur de la bordure (5 options)
- Image de fond personnalisée
- Appliqué automatiquement lors de la création de room

## 7. Interactions sociales

### Émojis
- Sélection d'un participant sur la table
- Envoi d'émojis animés
- Émojis disponibles : bière, boule de papier, avion, dollar
- Animation de vol à travers la table
- Visible par tous les participants

### Avatars dynamiques
- Avatars générés automatiquement (émojis)
- Couleurs basées sur l'ID utilisateur
- Avatar spécial pour l'organisateur

## 8. Interface temps réel

### Synchronisation
- Mise à jour instantanée via WebSocket
- Notification des entrées/sorties
- État des votes en direct

### Indicateurs visuels
- Statut de connexion
- Cartes face cachée pendant le vote
- Animation de révélation (flip 3D)
- Progression des votes (X/Y)

### Layout personnalisable (drag & drop)
- 6 panneaux réorganisables : Table, Cartes, Contrôles & Stats, Items, Items estimés, Participants
- Réorganisation par glisser-déposer (gauche, droite, au-dessus)
- Max 2 panneaux par ligne sur écrans standards, 3 panneaux par ligne sur grands écrans (>= 1536px)
- Mobile : une colonne sous 768 px (lignes à 3 panneaux : une colonne sous 1024 px)
- Le conteneur s'élargit progressivement sur les grands écrans (1280px, puis 1800px)
- Layout sauvegardé par utilisateur (localStorage + compte)
- Bouton de réinitialisation du layout

## 9. Internationalisation

### Langues supportées
- Français (défaut)
- Anglais

### Changement de langue
- Toggle dans l'interface
- Persistance du choix

## 10. Thèmes

### Modes disponibles
- Thème clair
- Thème sombre

### Changement de thème
- Toggle dans le header (la classe `dark` est posée sur `<html>`, variant Tailwind `dark:`)
- Persistance du choix (localStorage) ; sans choix, préférence de l'OS
- Un script inline dans le `<head>` applique la classe avant l'hydratation (pas de flash clair)

## 11. Administration

### Dashboard admin
- Accessible uniquement avec l'email configuré dans `ADMIN_EMAIL`
- Statistiques globales
- Liste des utilisateurs
- Gestion des sessions actives
- Rooms actives (participants, items, état, expiration)
- Historique des rooms et backlogs de tous les utilisateurs
- ⚠️ L'adresse `ADMIN_EMAIL` n'est pas vérifiée : créer ce compte dès le premier déploiement (voir `05_REGLES_METIER.md`)

### Actions admin
- Consultation des statistiques
- Gestion des utilisateurs

## 12. Easter eggs

### Konami Code
- Séquence : haut, haut, bas, bas, gauche, droite, gauche, droite, B, A
- Déclenche une animation spéciale
- Émojis qui tombent de l'écran
