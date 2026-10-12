'use client';

/**
 * Configuration runtime (URL Socket.IO, uploads) reçue du layout serveur via ClientProviders.
 * Valeur identique au rendu serveur et à l'hydratation (props RSC).
 */
import { createContext, useContext } from 'react';
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '@/lib/runtimeConfig';

const RuntimeConfigContext = createContext<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

export function RuntimeConfigProvider({ value, children }: { value: RuntimeConfig; children: React.ReactNode }) {
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

/** Config runtime ; hors provider : DEFAULT_RUNTIME_CONFIG (heuristique client, uploads autorisés) */
export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext);
}
