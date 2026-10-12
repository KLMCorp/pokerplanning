/**
 * Configuration runtime transmise par le serveur Next au client (props RSC du layout racine)
 * et résolution de l'URL du serveur Socket.IO.
 * Module pur : aucune lecture de l'environnement ici (voir serverRuntimeConfig.ts).
 */

export interface RuntimeConfig {
  /** URL Socket.IO configurée (SOCKET_URL au lancement > NEXT_PUBLIC_SOCKET_URL au build), normalisée en origine ; null = heuristique client */
  socketUrl: string | null;
  /** Uploads d'images autorisés (ALLOW_UPLOADS au lancement > NEXT_PUBLIC_ALLOW_UPLOADS au build > true) */
  allowUploads: boolean;
}

/** Config par défaut : heuristique client pour l'URL Socket.IO, uploads autorisés */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = { socketUrl: null, allowUploads: true };

/** Valeurs brutes lues par le serveur Next (undefined = non définie) */
export interface RuntimeConfigSources {
  runtimeSocketUrl?: string;
  buildSocketUrl?: string;
  runtimeAllowUploads?: string;
  buildAllowUploads?: string;
}

/** Sous-ensemble de window.location utilisé par l'heuristique (window.location et new URL() conviennent) */
export interface SocketLocation {
  protocol: string;
  hostname: string;
  port: string;
  origin: string;
}

/** Port du serveur Next dans l'image Docker et en dev */
export const NEXT_DEFAULT_PORT = '3000';
/** Port du serveur Socket.IO dans l'image Docker et en dev */
export const SOCKET_DEFAULT_PORT = '3001';
/** URL Socket.IO de développement (et de rendu serveur, sans window) */
export const DEV_SOCKET_URL = 'http://localhost:3001';

/**
 * Normalise une URL de serveur Socket.IO en origine (schéma + hôte + port non par défaut).
 * Retourne null si la valeur est vide ou n'est pas une URL http(s)/ws(s) absolue, sans identifiants,
 * chemin, query ni fragment.
 */
export function normalizeSocketUrl(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  let scheme: 'http:' | 'https:';
  // ws/wss acceptés : socket.io-client les traite comme http/https
  switch (url.protocol) {
    case 'http:':
    case 'ws:':
      scheme = 'http:';
      break;
    case 'https:':
    case 'wss:':
      scheme = 'https:';
      break;
    default:
      return null;
  }

  if (url.username !== '' || url.password !== '') return null;
  // Un chemin serait interprété comme namespace Socket.IO
  if (url.pathname !== '/') return null;
  if (url.search !== '' || url.hash !== '') return null;

  return `${scheme}//${url.host}`;
}

/**
 * Interprète une valeur ALLOW_UPLOADS : null si non définie, false seulement pour la chaîne exacte 'false'.
 */
export function parseAllowUploads(raw: string | null | undefined): boolean | null {
  if (raw === undefined || raw === null || raw === '') return null;
  // même règle que server/socket/handlers.ts (ALLOW_UPLOADS !== 'false') : UI et serveur cohérents
  return raw !== 'false';
}

/** Message d'avertissement pour une URL Socket.IO invalide (identifiants masqués) */
function invalidSocketUrlMessage(name: string, raw: string): string {
  // Identifiants éventuels (http://user:mdp@hote) masqués avant journalisation.
  // Tout ce qui précède le dernier @ est masqué (mot de passe avec /, espace ou @ compris)
  const masked = raw.replace(/\/\/[\s\S]*@/, '//***@');
  return `[config] ${name} ignorée : ${JSON.stringify(masked.slice(0, 200))} n'est pas une URL http(s) absolue sans chemin (ex. http://192.168.1.10:3001)`;
}

/**
 * Résout la config runtime à partir des valeurs brutes (lancement > build > défaut).
 * `warn` est appelé pour chaque valeur non vide mais invalide effectivement consultée.
 */
export function resolveRuntimeConfig(
  sources: RuntimeConfigSources,
  warn: (message: string) => void = () => {},
): RuntimeConfig {
  const runtime = normalizeSocketUrl(sources.runtimeSocketUrl);
  if (runtime === null && sources.runtimeSocketUrl?.trim()) {
    warn(invalidSocketUrlMessage('SOCKET_URL', sources.runtimeSocketUrl));
  }

  let build: string | null = null;
  if (runtime === null) {
    build = normalizeSocketUrl(sources.buildSocketUrl);
    if (build === null && sources.buildSocketUrl?.trim()) {
      warn(invalidSocketUrlMessage('NEXT_PUBLIC_SOCKET_URL', sources.buildSocketUrl));
    }
  }

  return {
    socketUrl: runtime ?? build ?? null,
    allowUploads:
      parseAllowUploads(sources.runtimeAllowUploads) ?? parseAllowUploads(sources.buildAllowUploads) ?? true,
  };
}

/**
 * Détermine l'URL du serveur Socket.IO côté client.
 * 1. URL configurée ; 2. page en http sur le port 3000 : même hôte, port 3001 ;
 * 3. production : origine de la page (reverse proxy) ; 4. sinon développement : localhost:3001.
 */
export function resolveSocketUrl(
  configuredUrl: string | null,
  location: SocketLocation | null,
  isProduction: boolean,
): string {
  if (configuredUrl !== null) return configuredUrl;
  // https sur :3000 = reverse proxy TLS (Express ne fait pas de TLS) : on garde l'origine
  if (location && location.protocol === 'http:' && location.port === NEXT_DEFAULT_PORT) {
    return `http://${location.hostname}:${SOCKET_DEFAULT_PORT}`;
  }
  if (location && isProduction) return location.origin;
  return DEV_SOCKET_URL;
}
