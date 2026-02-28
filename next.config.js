const createNextIntlPlugin = require('next-intl/plugin');
const packageJson = require('./package.json');

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
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
    NEXT_PUBLIC_CARDS_PATH: process.env.NEXT_PUBLIC_CARDS_PATH || '/images/cartes',
    NEXT_PUBLIC_APP_VERSION: process.env.APP_VERSION || packageJson.version,
    NEXT_PUBLIC_ALLOW_UPLOADS: process.env.ALLOW_UPLOADS || 'true',
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
    if (!ADMIN_SECRET_PATH) return [];
    return {
      beforeFiles: [
        {
          source: ADMIN_SECRET_PATH,
          destination: '/admin',
        },
        {
          source: `${ADMIN_SECRET_PATH}/:path*`,
          destination: '/admin/:path*',
        },
      ],
    };
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
