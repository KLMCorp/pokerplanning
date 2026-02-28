'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import JoinRoom from '@/components/JoinRoom';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import HelpModal from '@/components/HelpModal';

/**
 * Page d'accueil - Création ou rejoindre une room
 */
export default function Home() {
  const router = useRouter();
  const t = useTranslations('home');
  const { account, isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Theme, Language & Help Toggle */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <HelpModal />
        <LanguageToggle />
        <ThemeToggle />
        {isAuthenticated && account && (
          <button
            onClick={() => router.push('/account')}
            className="w-8 h-8 rounded-full bg-poker-gold/20 flex items-center justify-center text-sm overflow-hidden hover:ring-2 hover:ring-poker-gold transition-all"
          >
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-4 h-4 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </button>
        )}
      </div>

      <div className="w-full max-w-md">
        {/* En-tête */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-poker-gold">Planning</span>{' '}
            <span className="text-gray-900 dark:text-white">Poker</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>

        {/* Composant de création/join de room */}
        <JoinRoom />

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 dark:text-gray-500 text-sm">
          <p>{t('createRoomHint')}</p>
          <p>{t('joinRoomHint')}</p>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-600">
            {t('loginHint')}
          </p>
        </div>
      </div>
    </main>
  );
}
