'use client';

/**
 * Wrapper client pour les providers et composants globaux
 */

import { ThemeProvider } from '@/contexts/ThemeContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { RuntimeConfigProvider } from '@/contexts/RuntimeConfigContext';
import type { RuntimeConfig } from '@/lib/runtimeConfig';
import { ToastProvider } from './Toast';
import { ConfirmProvider } from './ConfirmDialog';
import KonamiEasterEgg from './KonamiEasterEgg';
import RoomClosedNotifier from './RoomClosedNotifier';
import ErrorBoundary from './ErrorBoundary';

export default function ClientProviders({ children, runtimeConfig }: { children: React.ReactNode; runtimeConfig: RuntimeConfig }) {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <RuntimeConfigProvider value={runtimeConfig}>
                <SocketProvider>
                  <AuthProvider>
                    {children}
                    <KonamiEasterEgg />
                    <RoomClosedNotifier />
                  </AuthProvider>
                </SocketProvider>
              </RuntimeConfigProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
