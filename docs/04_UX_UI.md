# UX / UI

## Charte graphique

### Couleurs principales

| Nom | Valeur | Usage |
|-----|--------|-------|
| Poker Green | #0d5c2e | Table de poker (sombre) |
| Poker Felt | #1a7a3d | Table de poker (clair) |
| Poker Gold | #d4af37 | Accents, boutons principaux |
| Poker Red | #c41e3a | Alertes, erreurs |

### Thèmes

Le thème est piloté par la classe `dark` sur `<html>` : `globals.css` déclare `@custom-variant dark (&:where(.dark, .dark *))`, donc les utilitaires `dark:` suivent le toggle et non la préférence de l'OS. Un script inline dans `src/app/layout.tsx` lit `localStorage` (`pokerPlanning_theme`, sinon `prefers-color-scheme`) et pose la classe avant l'hydratation pour éviter un flash clair. `ThemeContext` maintient ensuite la classe.

#### Thème sombre
- Fond : `linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)`
- Texte : blanc/gris clair
- Cartes : fond sombre

#### Thème clair
- Fond : gris clair
- Texte : noir/gris foncé
- Cartes : fond blanc

### Typographie

- Police : Inter (Google Fonts)
- Titres : Bold
- Corps : Regular

## Layout

### Page d'accueil

```
+----------------------------------+
|  Logo   [Thème] [Lang] [Compte]  |
+----------------------------------+
|                                  |
|     Logo + Titre                 |
|                                  |
|  [Créer une room]                |
|                                  |
|  [Rejoindre]   [Se connecter]    |
|                                  |
+----------------------------------+
```

### Page Room (Desktop)

Le layout de la room est entièrement personnalisable par drag & drop. Les panneaux (Table, Cartes, Contrôles & Stats, Items, Items estimés, Participants) peuvent être réorganisés librement. Le nombre maximum de panneaux par ligne s'adapte à la taille de l'écran :

- **Écrans < 1280px** : max 2 panneaux par ligne, conteneur limité à 1024px
- **Écrans 1280px – 1535px** : max 2 panneaux par ligne, conteneur élargi à 1280px
- **Écrans >= 1536px (2xl)** : max 3 panneaux par ligne, conteneur élargi jusqu'à 1800px

Drag & drop : les panneaux se déplacent par glisser-déposer avec un type MIME dédié (`application/x-pokerplanning-panel`, `src/lib/panelDrag.ts`), distinct du glisser-déposer des items : un drag d'item n'est jamais interprété comme un déplacement de panneau, et inversement.

```
Layout par défaut (desktop) :
+----------------------------------+
|  Logo | Room: XXXX | Avatar [X]  |
+----------------------------------+
|  Items    |   Table    | Contrôles|
|           |            |          |
|  - Item 1 |   [Table   | Votes    |
|  - Item 2 |    Poker]  | Stats    |
|  - Item 3 |            | Users    |
|           |  [Cartes]  |          |
+----------------------------------+

Layout large (>= 1536px, 3 panneaux par ligne) :
+------------------------------------------------+
|  Logo     | Room: XXXX       | Avatar [X]      |
+------------------------------------------------+
|           |   Table Poker    |                  |
|           |                  |                  |
+------------------------------------------------+
|  Cartes   | Contrôles & Stats|  Participants    |
+------------------------------------------------+
|  Items    | Items estimés    |                  |
+------------------------------------------------+
```

### Page Room (Mobile)

Sous 768 px, chaque ligne du layout passe en **une seule colonne**. Les lignes à 2 panneaux repassent en 2 colonnes dès 768 px ; les lignes à 3 panneaux restent en une colonne jusqu'à 1024 px (`lg:`). Les classes de grille sont des littéraux complets dans `src/lib/defaultLayout.ts` (scannés par Tailwind via `@source`). Les modales rendues dans un panneau passent par un portail (`createPortal` sur `document.body`).

**Fermeture de la room** : quand la room est fermée par le serveur (`room:closed`), `RoomClosedNotifier` affiche un toast traduit (PO parti, room expirée) et ramène à l'accueil.

```
+------------------+
|  Header          |
+------------------+
|  Table Poker     |
+------------------+
|  Cartes          |
+------------------+
|  Stats           |
+------------------+
|  Items (accordéon)|
+------------------+
|  Contrôles       |
+------------------+
```

### Page Profil

```
+----------------------------------+
|  [Retour]              [Déconnexion]|
+----------------------------------+
|  Avatar | Nom                    |
|         | Email                  |
|         | Rôle                   |
+----------------------------------+
|  Personnaliser les cartes        |
|  [Dos] [Carte 0] [Carte 1] ...   |
+----------------------------------+
|  Personnaliser la table          |
|  [Aperçu]                        |
|  [Couleurs] [Image]              |
+----------------------------------+
|  Historique des rooms            |
|  - Room XXXX (date)              |
|  - Room YYYY (date)              |
+----------------------------------+
```

### Page Backlog

```
+----------------------------------+
|  [Retour]     Backlog    [Add]   |
+----------------------------------+
|  [Item 1]                 [Edit] |
|  [Item 2]                 [Edit] |
|  [Item 3]                 [Edit] |
+----------------------------------+
```

### Page Admin

```
+----------------------------------+
|  [Retour]   Administration       |
+----------------------------------+
|  Statistiques                    |
|  - Utilisateurs : X              |
|  - Sessions : Y                  |
+----------------------------------+
|  Liste des utilisateurs          |
|  [User 1] [User 2] [User 3]      |
+----------------------------------+
```

## Composants

### Table de poker

- Forme elliptique
- Bordure en bois (personnalisable)
- Feutre vert (personnalisable)
- Image de fond (optionnelle)
- Ombre portée
- Avatars disposés autour

### Cartes

- Coins arrondis
- Ombre au hover
- Animation de sélection
- Flip 3D pour révélation

### Avatars

- Cercle avec emoji ou image
- Couleur de fond basée sur l'ID
- Badge "Orga" pour l'organisateur
- Support image personnalisée

### Boutons

- Primaire : fond doré, texte sombre
- Secondaire : fond gris, texte clair
- Danger : fond rouge
- Disabled : opacité réduite

### Modales

- Fond semi-transparent
- Carte centrée
- Animation d'apparition
- Z-index élevé (100+)
- Fermeture par clic externe ou bouton

### Formulaires

- Labels au-dessus des champs
- Placeholder explicatifs
- Messages d'erreur en rouge
- Validation en temps réel

## Animations

### Cartes

```css
/* Hover */
transform: translateY(-8px);
box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);

/* Sélection */
transform: translateY(-12px);
box-shadow: 0 15px 35px rgba(212, 175, 55, 0.4);
border-color: var(--poker-gold);
```

### Flip de carte

```css
@keyframes revealCard {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(180deg); }
}
```

### Emojis volants

```css
transition: all 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
/* Position de départ vers position cible */
/* Effet d'agrandissement et disparition */
```

### Konami Code

```css
@keyframes konami-fall {
  0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
```

## Responsive

### Breakpoints

- Mobile : < 768px
- Tablette : 768px - 1023px
- Desktop : 1024px - 1279px
- Desktop large (xl) : 1280px - 1535px
- Desktop très large (2xl) : >= 1536px

### Adaptations

- **Mobile** : Layout vertical (une colonne), accordéons, menu hamburger
- **Tablette** : lignes à 2 panneaux sur 2 colonnes ; lignes à 3 panneaux sur une colonne jusqu'à 1024 px
- **Desktop** : Layout drag & drop, max 2 panneaux par ligne, conteneur 1024px
- **Desktop large (xl)** : Conteneur élargi à 1280px, max 2 panneaux par ligne
- **Desktop très large (2xl)** : Conteneur élargi à 1800px, max 3 panneaux par ligne, table de poker agrandie

## Accessibilité

- Contraste suffisant (WCAG AA)
- Focus visible sur éléments interactifs
- Labels sur les inputs
- Messages d'erreur explicites
- Navigation au clavier
- Attributs ARIA sur les éléments interactifs

## Internationalisation

- Toggle de langue dans le header
- Toutes les chaînes dans des fichiers JSON
- Support RTL possible (non implémenté)
- Formats de date localisés
