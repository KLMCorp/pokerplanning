export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr';

export function getLocaleFromNavigator(): Locale {
  if (typeof navigator === 'undefined') return defaultLocale;

  const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
  return browserLang.startsWith('fr') ? 'fr' : 'en';
}

export function getStoredLocale(): Locale | null {
  if (typeof localStorage === 'undefined') return null;

  const stored = localStorage.getItem('locale');
  if (stored && locales.includes(stored as Locale)) {
    return stored as Locale;
  }
  return null;
}

export function setStoredLocale(locale: Locale): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('locale', locale);
  }
}

export function getInitialLocale(): Locale {
  return getStoredLocale() || getLocaleFromNavigator();
}
