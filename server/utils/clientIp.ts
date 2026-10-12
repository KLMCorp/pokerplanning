/**
 * Résolution de l'adresse IP réelle du client derrière un ou plusieurs proxys.
 *
 * TRUST_PROXY = nombre de proxys de confiance devant le serveur ('true' équivaut à 1).
 * L'en-tête X-Forwarded-For est lu depuis la droite : les entrées les plus à gauche
 * sont fournies par le client et ne sont donc jamais fiables.
 */

const MAX_TRUSTED_HOPS = 10;

let warnedInvalidTrustProxy = false;

/**
 * Convertit la valeur de TRUST_PROXY en nombre de proxys de confiance
 */
export function parseTrustProxy(value: string | undefined): number {
  if (value === undefined || value === '' || value === 'false' || value === '0') return 0;
  if (value === 'true') return 1;
  if (/^\d+$/.test(value)) return Math.min(parseInt(value, 10), MAX_TRUSTED_HOPS);
  if (!warnedInvalidTrustProxy) {
    warnedInvalidTrustProxy = true;
    console.warn(`TRUST_PROXY invalide ("${value}") : valeur ignorée, aucun proxy de confiance`);
  }
  return 0;
}

/**
 * Normalise une adresse IP (casse, préfixe IPv4-mappé ::ffff:)
 */
export function normalizeIp(ip: string): string {
  let normalized = ip.trim().toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const rest = normalized.slice('::ffff:'.length);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rest)) {
      normalized = rest;
    }
  }
  return normalized === '' ? 'unknown' : normalized;
}

/**
 * Découpe l'en-tête X-Forwarded-For en liste d'adresses (vides ignorées)
 */
export function parseForwardedFor(header: string | string[] | undefined): string[] {
  if (header === undefined) return [];
  const joined = Array.isArray(header) ? header.join(',') : header;
  return joined
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Détermine l'IP du client à partir de l'adresse TCP et de X-Forwarded-For
 */
export function resolveClientIp(
  remoteAddress: string | undefined,
  xForwardedFor: string | string[] | undefined,
  trustedHops: number
): string {
  if (trustedHops <= 0) {
    return normalizeIp(remoteAddress ?? '');
  }
  const chain = [...parseForwardedFor(xForwardedFor), remoteAddress ?? ''];
  const idx = chain.length - 1 - trustedHops;
  return normalizeIp(chain[Math.max(idx, 0)]);
}

/**
 * Nombre de proxys de confiance (lu à chaque appel : les tests modifient process.env après l'import)
 */
export function getTrustedHops(): number {
  return parseTrustProxy(process.env.TRUST_PROXY);
}

/**
 * IP du client d'une connexion Socket.IO
 */
export function getHandshakeIp(handshake: {
  address: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  return resolveClientIp(handshake.address, handshake.headers['x-forwarded-for'], getTrustedHops());
}
