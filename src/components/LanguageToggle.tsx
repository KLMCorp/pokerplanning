'use client';

/**
 * Bouton de basculement entre français et anglais
 */

import { useLocale } from '@/contexts/LocaleContext';

const LANG_SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
} as const;

interface LanguageToggleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function LanguageToggle({ className = '', size = 'md' }: LanguageToggleProps) {
  const { locale, setLocale } = useLocale();

  const toggleLocale = () => {
    setLocale(locale === 'fr' ? 'en' : 'fr');
  };

  return (
    <button
      onClick={toggleLocale}
      className={`
        ${LANG_SIZE_CLASSES[size]}
        flex items-center justify-center
        rounded-lg
        bg-gray-100 hover:bg-gray-200
        dark:bg-gray-700 dark:hover:bg-gray-600
        border border-gray-300 dark:border-gray-600
        text-gray-600 dark:text-gray-300
        font-medium
        transition-all duration-200
        hover:scale-105 active:scale-95
        ${className}
      `}
      title={locale === 'fr' ? 'Switch to English' : 'Passer en français'}
      aria-label={locale === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {locale === 'fr' ? 'EN' : 'FR'}
    </button>
  );
}
