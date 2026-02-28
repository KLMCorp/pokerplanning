/**
 * Avatars rigolos pour les utilisateurs
 * Assignes aleatoirement a chaque participant
 */

// Liste d'avatars fun (emojis)
export const AVATARS = [
  // Animaux rigolos
  '🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐲', '🦖', '🦕',
  '🐙', '🦑', '🦀', '🐳', '🐬', '🦈', '🐊', '🦩', '🦚', '🦜',
  '🐧', '🐤', '🦉', '🦇', '🐺', '🐗', '🦝', '🦨', '🦫', '🦦',
  // Personnages fun
  '🤖', '👽', '👻', '🎃', '🦸', '🦹', '🧙', '🧛', '🧟', '🥷',
  '🧑‍🚀', '🧑‍🎤', '🧑‍🎨', '🧑‍💻', '🧑‍🔬', '🧑‍🚒', '🦾', '🧠', '👾', '🤡',
  // Objets/Nature fun
  '🌵', '🌴', '🍄', '🌈', '⭐', '🌙', '☀️', '🔥', '💎', '🎲',
  '🎯', '🎪', '🎭', '🎨', '🎸', '🎺', '🥁', '🪩', '🛸', '🚀',
];

// Couleurs de fond pour les avatars
export const AVATAR_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
];

/**
 * Obtient un avatar aleatoire base sur un seed (userId)
 */
export function getAvatarForUser(userId: string): { emoji: string; color: string } {
  // Utilise le oderId comme seed pour avoir toujours le meme avatar
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const emojiIndex = Math.abs(hash) % AVATARS.length;
  const colorIndex = Math.abs(hash >> 4) % AVATAR_COLORS.length;

  return {
    emoji: AVATARS[emojiIndex],
    color: AVATAR_COLORS[colorIndex],
  };
}

/**
 * Obtient un avatar special pour le PO
 */
export function getPOAvatar(): { emoji: string; color: string } {
  return {
    emoji: '👑',
    color: 'bg-poker-gold',
  };
}
