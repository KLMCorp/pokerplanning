# Documentation Planning Poker

## Vue d'ensemble

Application web de Planning Poker permettant aux équipes agiles d'estimer collaborativement la complexité des tâches en temps réel.

## Table des matières

1. [README](01_README.md) - Vue d'ensemble
2. [Fonctionnalités](02_FONCTIONNALITES.md) - Liste complète des fonctionnalités
3. [Cartes](03_CARTES.md) - Configuration des cartes de vote
4. [UX/UI](04_UX_UI.md) - Interface utilisateur
5. [Règles métier](05_REGLES_METIER.md) - Logique applicative
6. [Stack technique](06_TECH_STACK.md) - Technologies utilisées
7. [Modèles de données](07_MODELES_DE_DONNEES.md) - Structure des données
8. [Upload d'images](08_UPLOAD_IMAGES.md) - Gestion des images

## Concepts clés

### Rooms

Une room est une session de Planning Poker identifiée par un code unique à 6 caractères (ex: `ABC123`). Elle peut être protégée par mot de passe et a une durée de vie configurable (TTL, défaut 180 minutes).

Une room est fermée **pour tous** quand l'organisateur part (ou ne revient pas dans le délai de grâce de 30 s après une déconnexion), à l'expiration du TTL (les participants sont notifiés par un toast et ramenés à l'accueil) ou quand elle devient vide. Créer ou rejoindre une room quitte la précédente.

### Rôles

- **Organisateur (PO/PM)** : Crée la room, gère les items, démarre/révèle les votes, valide les scores
- **Développeur** : Rejoint la room, vote sur les items, envoie des émojis

### Items

Les items sont les éléments à estimer (user stories, tâches, etc.). Chaque item a un titre, une description optionnelle, et peut recevoir un score final après révélation des votes.

### Votes

Les participants votent en sélectionnant une carte. Les votes sont cachés jusqu'à la révélation par l'organisateur. Des statistiques sont calculées automatiquement (moyenne, médiane, min/max).

### Backlog

Chaque utilisateur connecté peut gérer un backlog personnel d'items à estimer. Ce backlog peut être importé dans une room pour faciliter le travail.

## Démarrage rapide

1. Installer les dépendances : `npm install`
2. Configurer l'environnement : copier `.env.example` vers `.env.local`
3. Lancer le serveur : `npm run dev`
4. Ouvrir http://localhost:3000
5. Créer un compte ou continuer en tant qu'invité
6. Créer une room ou rejoindre avec un code

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│                 │ ◄───────────────► │                 │
│   Next.js App   │                    │   Socket.IO     │
│   (React 19)    │                    │   Server        │
│                 │                    │   (Express 5)   │
└─────────────────┘                    └────────┬────────┘
                                                │
                                       ┌────────▼────────┐
                                       │     SQLite      │
                                       │   (Comptes,     │
                                       │   Historiques)  │
                                       └─────────────────┘
```

## Fonctionnalités principales

- Rooms temps réel avec code unique
- Système de comptes avec authentification
- Protection par mot de passe des rooms
- Personnalisation (cartes, table, avatars)
- Layout drag & drop adaptatif (jusqu'à 3 panneaux par ligne sur grands écrans)
- Gestion de backlog personnel
- Historique des sessions
- Émojis animés
- Internationalisation (FR/EN)
- Thème sombre/clair
- Dashboard admin
- Reset de mot de passe par email + code à 6 chiffres
- Paramètres du deck de la room (DeckSettings, organisateur)
