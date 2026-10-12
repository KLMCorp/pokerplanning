'use client';

/**
 * Composant EmojiPicker - Sélecteur d'emojis pour envoyer à un utilisateur
 */

import { useTranslations } from 'next-intl';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  targetName: string;
  position?: 'above' | 'below';
  /** Ancrage horizontal : évite de sortir de l'écran pour les joueurs du bord de la table */
  align?: 'start' | 'center' | 'end';
}

const EMOJIS = ['🍺', '🗞️', '✈️', '💵'];

export default function EmojiPicker({ onSelect, onClose, targetName, position = 'above', align = 'center' }: EmojiPickerProps) {
  const t = useTranslations('emojiPicker');
  const tCommon = useTranslations('common');
  const positionClasses = position === 'above'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  // Classes littérales complètes (scan Tailwind)
  const alignClasses = align === 'start'
    ? 'left-0'
    : align === 'end'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <div className={`absolute ${positionClasses} ${alignClasses} z-[200]`}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 border border-gray-200 dark:border-gray-700 min-w-[200px]">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center whitespace-nowrap">
          {t.rich('sendTo', {
            name: targetName,
            highlight: (chunks) => <span className="text-poker-gold font-medium">{chunks}</span>,
          })}
        </div>
        <div className="flex justify-center gap-3">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="w-12 h-12 flex items-center justify-center text-3xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-3 w-full text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors py-1"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  );
}
