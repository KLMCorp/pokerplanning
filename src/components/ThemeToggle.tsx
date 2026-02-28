'use client';

/**
 * Bouton de basculement entre thème clair et sombre
 */

import { useTranslations } from 'next-intl';
import { useTheme } from '@/contexts/ThemeContext';

const THEME_SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
} as const;

const THEME_ICON_SIZE = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
} as const;

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function ThemeToggle({ className = '', size = 'md' }: ThemeToggleProps) {
  const t = useTranslations('theme');
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`
        ${THEME_SIZE_CLASSES[size]}
        flex items-center justify-center
        rounded-lg
        bg-gray-100 hover:bg-gray-200
        dark:bg-gray-700 dark:hover:bg-gray-600
        border border-gray-300 dark:border-gray-600
        text-gray-600 dark:text-gray-300
        transition-all duration-200
        hover:scale-105 active:scale-95
        ${className}
      `}
      title={theme === 'dark' ? t('switchToLight') : t('switchToDark')}
      aria-label={theme === 'dark' ? t('activateLight') : t('activateDark')}
    >
      {theme === 'dark' ? (
        // Icône soleil pour le mode sombre (cliquer pour passer en clair)
        <svg className={THEME_ICON_SIZE[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // Icône lune pour le mode clair (cliquer pour passer en sombre)
        <svg className={THEME_ICON_SIZE[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
