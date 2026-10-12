# Upload d'images

## Types d'images

### Avatar utilisateur
- **Chemin** : `/uploads/users/{accountId}/avatar.{ext}`
- **Usage** : Affiché dans le header et sur la table
- **Dimensions recommandées** : 200x200 px

### Image de table
- **Chemin** : `/uploads/users/{accountId}/table.{ext}`
- **Usage** : Fond de la table de poker
- **Dimensions recommandées** : 800x600 px

### Dos des cartes
- **Chemin** : `/uploads/users/{accountId}/back.{ext}`
- **Usage** : Dos commun à toutes les cartes
- **Dimensions recommandées** : 100x140 px

### Recto des cartes
- **Chemin** : `/uploads/users/{accountId}/card_{value}.{ext}`
- **Usage** : Face de chaque carte
- **Dimensions recommandées** : 100x140 px

### Images de room (DeckSettings)
- **Chemin** : `/uploads/{ROOMID}/back.{ext}` et `/uploads/{ROOMID}/card_{value}.{ext}` (répertoire `public/uploads/<ROOMID>/`)
- **Événement** : `deck:uploadImage` (PO uniquement, `ALLOW_UPLOADS` actif, 20 uploads/min par IP)
- **Usage** : dos commun et recto par carte, propres à la room (le deck du compte n'est pas modifié)
- L'URL retournée porte un paramètre `?t=<timestamp>` (cache busting)

## Spécifications techniques

### Formats acceptés
- PNG
- JPEG / JPG
- WEBP

### Taille maximale
- 2 Mo par image

### Validation

```typescript
// Côté client
if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
  // Format non supporté
}

if (file.size > 2 * 1024 * 1024) {
  // Trop volumineux
}

// Côté serveur
const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
if (!matches) {
  // Format invalide
}

const extension = matches[1];
if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension.toLowerCase())) {
  // Extension non supportée
}
```

## Flux d'upload

### 1. Sélection du fichier

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);

<input
  type="file"
  ref={fileInputRef}
  accept="image/png,image/jpeg,image/webp"
  onChange={handleFileSelect}
/>
```

### 2. Lecture en base64

```typescript
const reader = new FileReader();
reader.onload = () => {
  const imageData = reader.result as string;
  // Envoi au serveur
};
reader.readAsDataURL(file);
```

### 3. Envoi via Socket

```typescript
socket.emit('auth:uploadAvatar', { imageData, fileName }, (success, url) => {
  if (success && url) {
    // Mise à jour de l'état
  }
});
```

### 4. Traitement serveur

```typescript
// Extraction des données base64
const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
const extension = matches[1];
const base64Data = matches[2];
const buffer = Buffer.from(base64Data, 'base64');

// Création du dossier
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'users', accountId);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Écriture du fichier
fs.writeFileSync(filePath, buffer);

// Retour de l'URL
const url = `/uploads/users/${accountId}/${fileName}?t=${Date.now()}`;
callback(true, url);
```

### 5. Mise à jour de l'état

```typescript
// Mise à jour du compte local
const updatedAccount = { ...account, avatarUrl: url };
setAccount(updatedAccount);
localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAccount));
```

## Cache busting

Les URLs incluent un timestamp pour éviter les problèmes de cache :

```typescript
const url = `/uploads/users/${accountId}/avatar.png?t=${Date.now()}`;
```

## Sécurité

### Vérification du compte
- L'upload n'est possible que si l'utilisateur est connecté
- Le socket doit être associé à un compte valide

```typescript
const accountId = userStore.getSocketAccount(socket.id);
if (!accountId) {
  callback(false);
  return;
}
```

### Isolation des fichiers
- Chaque utilisateur a son propre dossier
- Impossible d'écrire dans le dossier d'un autre utilisateur

### Validation des données
- Type MIME vérifié
- Extension vérifiée
- Taille vérifiée

## Gestion des erreurs

### Erreurs possibles
1. **Non connecté** : Socket non associé à un compte
2. **Format invalide** : Type MIME non supporté
3. **Trop volumineux** : Dépasse 2 Mo
4. **Erreur serveur** : Échec d'écriture du fichier

### Messages d'erreur

```typescript
// Affichage à l'utilisateur
setUploadError('Format non supporté. Utilisez PNG, JPG ou WEBP.');
setUploadError('L\'image ne doit pas dépasser 2 Mo.');
setUploadError('Erreur lors de l\'upload');
```

## Service des fichiers

Les fichiers sont servis par Express sur `/uploads` (port 3001). Avec nginx, `/uploads/` est routé directement vers ce port. Sans nginx, Next relaie `/uploads/*` vers `UPLOADS_UPSTREAM_URL` (rewrite `fallback`, valeur figée au build), car en production Next ne détecte pas les fichiers ajoutés dans `public/` après son démarrage. Le limiteur HTTP global d'Express ignore `/uploads/`.

## Suppression

Les anciennes images sont automatiquement écrasées lors d'un nouvel upload du même type (avatar, table, carte).

- **Room** : le dossier `public/uploads/<ROOMID>/` est supprimé à la fermeture de la room (PO parti, expiration, room vide) et si la room disparaît pendant un upload.
- **Compte** : `public/uploads/users/<id>/` est supprimé quand l'admin supprime le compte (`admin:deleteUser`).
- **Retrait d'une image du deck de room** : via `deck:update` (DeckSettings) ; le fichier est conservé sur disque jusqu'à la fermeture de la room.
- **Image du compte** : `auth:deleteDeckImage` pour le deck du compte.
