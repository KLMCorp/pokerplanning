'use client';

/**
 * Modal d'aide expliquant les fonctionnalités de l'application
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function HelpModal() {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('help');

  return (
    <>
      {/* Bouton d'aide */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors"
        title={t('title')}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Contenu */}
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-6 h-6 text-poker-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('title')}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Introduction */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="text-2xl">🎴</span>
                  {t('whatIsTitle')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t('whatIsDescription')}
                </p>
              </section>

              {/* Mode déconnecté */}
              <section className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="text-2xl">👤</span>
                  {t('guestModeTitle')}
                </h3>
                <ul className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                      <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{t(`guestFeature${i}`)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Mode connecté */}
              <section className="bg-poker-gold/10 dark:bg-poker-gold/20 rounded-xl p-4 border border-poker-gold/30">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="text-2xl">⭐</span>
                  {t('loggedModeTitle')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {t('loggedModeSubtitle')}
                </p>
                <ul className="space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                      <svg className="w-5 h-5 text-poker-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{t(`loggedFeature${i}`)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Rôles */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="text-2xl">👥</span>
                  {t('rolesTitle')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Organisateur */}
                  <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-3 border border-purple-200 dark:border-purple-700">
                    <h4 className="font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                      <span>👔</span> {t('roleOrganizer')}
                    </h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <li>• {t('organizerTask1')}</li>
                      <li>• {t('organizerTask2')}</li>
                      <li>• {t('organizerTask3')}</li>
                      <li>• {t('organizerTask4')}</li>
                    </ul>
                  </div>
                  {/* Participant */}
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                    <h4 className="font-medium text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1">
                      <span>💻</span> {t('roleParticipant')}
                    </h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <li>• {t('participantTask1')}</li>
                      <li>• {t('participantTask2')}</li>
                      <li>• {t('participantTask3')}</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Comment ça marche */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="text-2xl">🚀</span>
                  {t('howItWorksTitle')}
                </h3>
                <ol className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-600 dark:text-gray-400">
                      <span className="w-6 h-6 rounded-full bg-poker-gold text-gray-900 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {i}
                      </span>
                      <span>{t(`step${i}`)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 p-4">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2 bg-poker-gold hover:bg-yellow-500 text-gray-900 font-medium rounded-lg transition-colors"
              >
                {t('gotIt')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
