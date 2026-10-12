/**
 * Lecture de la configuration runtime côté serveur Next. Seul appelant : src/app/layout.tsx.
 * - SOCKET_URL / ALLOW_UPLOADS : non préfixées, jamais inlinées, lues à chaque requête
 *   (rendu dynamique via connection()) : réglables au lancement du container.
 * - NEXT_PUBLIC_SOCKET_URL / NEXT_PUBLIC_ALLOW_UPLOADS : accès LITTÉRAUX obligatoires, inlinés par
 *   `next build` (valeurs de build : compat des installations qui buildent sur place, ex. Proxmox).
 * Ne jamais importer ce module depuis un composant 'use client' (les variables non préfixées y valent '').
 */
import { resolveRuntimeConfig, type RuntimeConfig } from './runtimeConfig';

/** Journalise chaque message une seule fois par process */
function warnOnce(message: string): void {
  // globalThis et non une variable de module : un module peut être instancié par route dans les bundles serveur
  const store = globalThis as typeof globalThis & { __pokerPlanningConfigWarnings?: Set<string> };
  const seen = (store.__pokerPlanningConfigWarnings ??= new Set<string>());
  if (seen.has(message)) return;
  seen.add(message);
  console.warn(message);
}

/**
 * Config runtime (URL Socket.IO, uploads) lue depuis l'environnement du serveur Next, à chaque appel.
 */
export function getServerRuntimeConfig(): RuntimeConfig {
  return resolveRuntimeConfig(
    {
      runtimeSocketUrl: process.env.SOCKET_URL,
      buildSocketUrl: process.env.NEXT_PUBLIC_SOCKET_URL,
      runtimeAllowUploads: process.env.ALLOW_UPLOADS,
      buildAllowUploads: process.env.NEXT_PUBLIC_ALLOW_UPLOADS,
    },
    warnOnce,
  );
}
