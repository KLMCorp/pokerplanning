'use client';

/**
 * Composant Avatar - Affiche un avatar rigolo pour un utilisateur
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getAvatarForUser, getPOAvatar } from '@/lib/avatars';

const AVATAR_SIZE_CLASSES = {
  sm: 'w-8 h-8 text-lg',
  md: 'w-10 h-10 text-xl',
  lg: 'w-12 h-12 text-2xl',
  xl: 'w-16 h-16 text-3xl',
} as const;

interface AvatarProps {
  userId: string;
  name: string;
  isPO?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  className?: string;
  avatarUrl?: string;
  cardColor?: string;
}

export default function Avatar({
  userId,
  name,
  isPO = false,
  size = 'md',
  showName = false,
  className = '',
  avatarUrl,
  cardColor,
}: AvatarProps) {
  const t = useTranslations('common');
  const avatar = useMemo(() => {
    return isPO ? getPOAvatar() : getAvatarForUser(userId);
  }, [userId, isPO]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`
          ${AVATAR_SIZE_CLASSES[size]}
          ${avatarUrl || cardColor ? '' : avatar.color}
          rounded-full
          flex items-center justify-center
          shadow-lg
          ring-2 ring-white/20
          transition-transform hover:scale-110
          cursor-default
          select-none
          overflow-hidden
        `}
        style={!avatarUrl && cardColor ? { backgroundColor: cardColor } : undefined}
        title={isPO ? `${name} (${t('organizer')})` : name}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="drop-shadow-md">{avatar.emoji}</span>
        )}
      </div>
      {showName && (
        <div className="flex flex-col">
          <span className="text-gray-900 dark:text-white text-sm font-medium">{name}</span>
          {isPO && (
            <span className="text-[10px] text-poker-gold">{t('organizer')}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mini avatar pour les espaces reduits
 */
export function MiniAvatar({
  userId,
  isPO = false,
  avatarUrl,
  cardColor,
}: {
  userId: string;
  isPO?: boolean;
  avatarUrl?: string;
  cardColor?: string;
}) {
  const avatar = useMemo(() => {
    return isPO ? getPOAvatar() : getAvatarForUser(userId);
  }, [userId, isPO]);

  return (
    <div
      className={`
        w-6 h-6 text-sm
        ${avatarUrl || cardColor ? '' : avatar.color}
        rounded-full
        flex items-center justify-center
        shadow
        overflow-hidden
      `}
      style={!avatarUrl && cardColor ? { backgroundColor: cardColor } : undefined}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        avatar.emoji
      )}
    </div>
  );
}
