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
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);

  // Cache des messages chargés pour éviter les re-fetches
  const messagesCacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  // Identifiant de la dernière requête : les réponses obsolètes sont ignorées
  const requestIdRef = useRef(0);

  const applyLocale = useCallback(async (loc: Locale) => {
    const id = ++requestIdRef.current;

    // Utiliser le cache si disponible
    const cached = messagesCacheRef.current.get(loc);
    if (cached) {
      setLocaleState(loc);
      setMessages(cached);
      return;
    }

    let loaded: Record<string, unknown>;
    let effective: Locale = loc;
    try {
      loaded = (await import(`@/i18n/messages/${loc}.json`)).default;
    } catch (error) {
      console.error('Failed to load messages:', error);
      // Fallback to French
      loaded = (await import('@/i18n/messages/fr.json')).default;
      effective = 'fr';
    }
    if (id !== requestIdRef.current) return; // réponse obsolète
    messagesCacheRef.current.set(effective, loaded);
    // locale et messages sont mis à jour ensemble
    setLocaleState(effective);
    setMessages(loaded);
  }, []);

  // Load initial locale on mount
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    void applyLocale(getInitialLocale());
  }, [applyLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setStoredLocale(newLocale);
    void applyLocale(newLocale);
  }, [applyLocale]);

  const contextValue = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  // Le loader n'apparaît qu'au chargement initial (l'arbre reste monté ensuite)
  if (!messages) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900" aria-busy="true">
        <div className="w-10 h-10 border-4 border-poker-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
