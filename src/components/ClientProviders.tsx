'use client';

/**
 * Wrapper client pour les providers et composants globaux
 */

import { ThemeProvider } from '@/contexts/ThemeContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { ToastProvider } from './Toast';
import { ConfirmProvider } from './ConfirmDialog';
import KonamiEasterEgg from './KonamiEasterEgg';
import ErrorBoundary from './ErrorBoundary';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <ThemeProvider>
          <SocketProvider>
            <AuthProvider>
              <ToastProvider>
                <ConfirmProvider>
                  {children}
                  <KonamiEasterEgg />
                </ConfirmProvider>
              </ToastProvider>
            </AuthProvider>
          </SocketProvider>
        </ThemeProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
