'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { Locale, getInitialLocale, setStoredLocale } from '@/i18n/config';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>('fr');
  const [messages, setMessages] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cache des messages chargés pour éviter les re-fetches
  const messagesCacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  const loadMessages = useCallback(async (loc: Locale) => {
    // Utiliser le cache si disponible
    const cached = messagesCacheRef.current.get(loc);
    if (cached) {
      setMessages(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const loadedMessages = (await import(`@/i18n/messages/${loc}.json`)).default;
      messagesCacheRef.current.set(loc, loadedMessages);
      setMessages(loadedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
      // Fallback to French
      const fallbackMessages = (await import('@/i18n/messages/fr.json')).default;
      messagesCacheRef.current.set('fr', fallbackMessages);
      setMessages(fallbackMessages);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial locale on mount
  useEffect(() => {
    const initialLocale = getInitialLocale();
    setLocaleState(initialLocale);
    loadMessages(initialLocale);
  }, [loadMessages]);

  const setLocale = useCallback((newLocale: Locale) => {
    setStoredLocale(newLocale);
    setLocaleState(newLocale);
    loadMessages(newLocale);
  }, [loadMessages]);

  const contextValue = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  // Show loading state while messages are loading
  if (isLoading || !messages) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-900 dark:text-white">Loading...</div>
      </div>
    );
  }

  return (
    <LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
