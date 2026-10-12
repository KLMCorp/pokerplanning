# Configuration des cartes

## Deck par défaut

Le deck standard contient 12 cartes :

| Valeur | Label | Description |
|--------|-------|-------------|
| 0 | 0 | Tâche triviale, déjà faite |
| 1 | 1 | Très simple |
| 2 | 2 | Simple |
| 3 | 3 | Relativement simple |
| 5 | 5 | Complexité moyenne |
| 8 | 8 | Complexe |
| 13 | 13 | Très complexe |
| 20 | 20 | Énorme |
| 40 | 40 | Très énorme |
| 100 | 100 | Épique |
| ? | ? | Incertain, besoin de plus d'infos |
| coffee | café | Pause demandée |

## Structure d'une carte

```typescript
interface CardConfig {
  value: string;          // Valeur logique (ex: "5", "?", "coffee")
  label: string;          // Affichage texte
  frontImageUrl?: string; // Image personnalisée du recto
}

interface DeckConfig {
  cards: CardConfig[];
  backImageUrl?: string;  // Image du dos (commune)
}
```

## Deux niveaux de deck

1. **Deck du compte** (profil) : configuration personnelle, **copiée** dans la room à sa création. Elle fournit les rectos personnalisés ; son dos (`backImageUrl`) devient le dos personnel du créateur.
2. **Deck de la room** (DeckSettings, organisateur) : modifié pendant la session, **propre à la room** (non persisté dans le compte). Les fichiers sont stockés dans `public/uploads/<ROOMID>/` et supprimés à la fermeture de la room.

**Priorité du dos de carte** : dos de room (`deck.backImageUrl`) > dos personnel du participant (`cardBackUrl`, image de son compte) > dos aléatoire parmi les 4 dos par défaut (assigné par le serveur à l'arrivée dans la room). Voir `resolveCardBackUrl` dans `src/lib/cardImages.ts`.

## Personnalisation

### Via le profil utilisateur

1. Se connecter à son compte
2. Aller sur la page Profil
3. Section "Personnaliser les cartes"
4. Uploader des images pour :
   - Le dos des cartes (commun à toutes)
   - Le recto de chaque carte individuellement

### Spécifications des images

- **Formats acceptés** : PNG, JPG, WEBP
- **Taille maximale** : 2 Mo par image
- **Dimensions recommandées** :
  - Recto : 100x140 px (ratio 5:7)
  - Dos : 100x140 px (ratio 5:7)

### Via DeckSettings (dans la room)

- Réservé à l'organisateur, si `ALLOW_UPLOADS` n'est pas `false`
- Import ou retrait du dos commun et du recto de chaque carte
- Un fichier retiré du deck reste sur disque jusqu'à la fermeture de la room

### Application

- Les personnalisations du compte sont stockées dans le compte utilisateur
- Elles sont automatiquement appliquées (copiées) lors de la création d'une room
- Tous les participants de la room voient les cartes personnalisées

## Affichage des cartes

### États

1. **Sélecteur** : Cartes cliquables pour voter
2. **Face cachée** : Dos de carte visible (vote non révélé)
3. **Face visible** : Valeur visible (après révélation)

### Tailles

| Taille | Dimensions | Usage |
|--------|------------|-------|
| `sm` | 48x64 px | Table de poker |
| `md` | 64x88 px | Sélecteur |
| `lg` | 80x112 px | Stats |

### Animations

- **Hover** : élévation de la carte
- **Sélection** : élévation + bordure dorée
- **Révélation** : animation de flip 3D

## Couleurs par défaut

Si aucune image personnalisée n'est définie, les cartes utilisent des couleurs selon la valeur :

| Valeur | Couleur |
|--------|---------|
| 0 | Gris clair |
| 1-2 | Vert |
| 3-5 | Bleu |
| 8-13 | Jaune |
| 20-40 | Orange |
| 100 | Rouge |
| ? | Violet |
| coffee | Ambre |

## Images par défaut

Des images de cartes par défaut sont disponibles dans `public/images/cartes/` :
- 4 dos de cartes disponibles : carreau, coeur, pique, trèfle (PNG transparents avec chat noir)
- Un dos est assigné aléatoirement à chaque participant lors de la connexion à la room
- Le fond de la carte utilise la couleur choisie par l'utilisateur
- Logos personnalisés pour chaque valeur de carte

Ces images sont utilisées si l'utilisateur n'a pas défini de personnalisation.
