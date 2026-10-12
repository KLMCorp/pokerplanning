/**
 * Règles de réécriture Next.js (extraites de next.config.js pour être testables).
 *
 * - beforeFiles : chemin admin secret (ADMIN_SECRET_PATH) -> /admin.
 * - fallback : /uploads/* -> serveur Express interne. En production, Next scanne `public/` une seule fois
 *   au démarrage (publicFolderItems) : un fichier uploadé ensuite renverrait 404. Le `fallback` passe après
 *   `public/` et les pages, et relaie donc ces requêtes vers Express (qui sert /uploads), sans nginx.
 *
 * @param {{ adminSecretPath?: string, uploadsUpstreamUrl?: string }} options
 * @returns {{ beforeFiles: object[], afterFiles: object[], fallback: object[] }}
 */
function buildRewrites({ adminSecretPath, uploadsUpstreamUrl } = {}) {
  const base = (uploadsUpstreamUrl || 'http://127.0.0.1:3001').replace(/\/+$/, '');

  const beforeFiles = adminSecretPath
    ? [
        {
          source: adminSecretPath,
          destination: '/admin',
        },
        {
          source: `${adminSecretPath}/:path*`,
          destination: '/admin/:path*',
        },
      ]
    : [];

  return {
    beforeFiles,
    afterFiles: [],
    fallback: [
      {
        source: '/uploads/:path*',
        destination: `${base}/uploads/:path*`,
      },
    ],
  };
}

module.exports = { buildRewrites };
