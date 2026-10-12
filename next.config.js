const createNextIntlPlugin = require('next-intl/plugin');
const packageJson = require('./package.json');
const { buildRewrites } = require('./next.rewrites');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const ADMIN_SECRET_PATH = process.env.ADMIN_SECRET_PATH;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: process.env.NODE_ENV !== 'production' ? [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ] : [],
  },
  // Valeurs de BUILD, inlinées partout (bundles client ET serveur). Les valeurs réglables au lancement
  // (SOCKET_URL, ALLOW_UPLOADS) sont lues par src/lib/serverRuntimeConfig.ts : ne jamais les ajouter ici.
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || '',
    NEXT_PUBLIC_CARDS_PATH: process.env.NEXT_PUBLIC_CARDS_PATH || '/images/cartes',
    // Un tag de release (v1.2.0) est accepté : le pied de page ajoute déjà le préfixe « v »
    NEXT_PUBLIC_APP_VERSION: String(process.env.APP_VERSION || packageJson.version).replace(/^v/, ''),
    // Compat des installations qui buildent sur place (Proxmox) : ALLOW_UPLOADS du .env figée au build,
    // utilisée seulement si ALLOW_UPLOADS n'est pas définie au lancement du serveur Next
    NEXT_PUBLIC_ALLOW_UPLOADS: process.env.NEXT_PUBLIC_ALLOW_UPLOADS || process.env.ALLOW_UPLOADS || '',
  },
  async redirects() {
    if (!ADMIN_SECRET_PATH) return [];
    return [
      {
        source: '/admin/:path*',
        destination: '/',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // UPLOADS_UPSTREAM_URL est figée au `next build` (inscrite dans routes-manifest.json).
    // Le `fallback` /uploads passe après public/ : sans effet en dev et derrière nginx (qui route /uploads/ vers 3001).
    return buildRewrites({
      adminSecretPath: ADMIN_SECRET_PATH,
      uploadsUpstreamUrl: process.env.UPLOADS_UPSTREAM_URL,
    });
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval' 'unsafe-inline'" : " 'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; frame-ancestors 'none'` },
        ],
      },
    ];
  },
}

module.exports = withNextIntl(nextConfig)
