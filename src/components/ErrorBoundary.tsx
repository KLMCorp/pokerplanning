'use client';

import React, { Component, type ReactNode } from 'react';
import { getInitialLocale, type Locale } from '@/i18n/config';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Hors i18n volontairement : rendu au-dessus de LocaleProvider
const FALLBACK_TEXTS = {
  fr: { title: 'Une erreur est survenue', body: 'Veuillez rafraîchir la page.', button: 'Rafraîchir' },
  en: { title: 'An error occurred', body: 'Please refresh the page.', button: 'Refresh' },
} as const;

function DefaultFallback() {
  let locale: Locale = 'fr';
  try { locale = getInitialLocale(); } catch { /* localStorage bloqué */ }
  const t = FALLBACK_TEXTS[locale];
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {t.title}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          {t.body}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t.button}
        </button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultFallback />;
    }

    return this.props.children;
  }
}
