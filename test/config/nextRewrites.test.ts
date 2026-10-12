import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { buildRewrites } from '../../next.rewrites.js';

describe('buildRewrites', () => {
  it('sans admin : fallback /uploads vers http://127.0.0.1:3001', () => {
    const rewrites = buildRewrites({});
    expect(rewrites.beforeFiles).toEqual([]);
    expect(rewrites.afterFiles).toEqual([]);
    expect(rewrites.fallback).toEqual([
      { source: '/uploads/:path*', destination: 'http://127.0.0.1:3001/uploads/:path*' },
    ]);
  });

  it('utilise UPLOADS_UPSTREAM_URL et retire le slash final', () => {
    const rewrites = buildRewrites({ uploadsUpstreamUrl: 'http://poker-server:3001//' });
    expect(rewrites.fallback[0]).toEqual({
      source: '/uploads/:path*',
      destination: 'http://poker-server:3001/uploads/:path*',
    });
  });

  it('avec adminSecretPath : 2 règles beforeFiles, fallback toujours présent', () => {
    const rewrites = buildRewrites({ adminSecretPath: '/secret-42' });
    expect(rewrites.beforeFiles).toEqual([
      { source: '/secret-42', destination: '/admin' },
      { source: '/secret-42/:path*', destination: '/admin/:path*' },
    ]);
    expect(rewrites.fallback).toHaveLength(1);
  });
});

describe('next.config.js (branchement des rewrites)', () => {
  const ENV_KEYS = ['UPLOADS_UPSTREAM_URL', 'ADMIN_SECRET_PATH'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  /** Charge next.config.js avec un import frais (purge du cache CommonJS) */
  function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, env);
    const require = createRequire(import.meta.url);
    for (const id of Object.keys(require.cache)) {
      if (id.endsWith('next.config.js') || id.endsWith('next.rewrites.js')) delete require.cache[id];
    }
    return require('../../next.config.js') as {
      rewrites: () => Promise<{ beforeFiles: unknown[]; afterFiles: unknown[]; fallback: unknown[] }>;
      redirects: () => Promise<unknown[]>;
    };
  }

  it('sans variables : fallback /uploads par défaut, pas de règles admin', async () => {
    const config = loadConfig({});
    const rewrites = await config.rewrites();
    expect(Object.keys(rewrites).sort()).toEqual(['afterFiles', 'beforeFiles', 'fallback']);
    expect(rewrites.beforeFiles).toEqual([]);
    expect(rewrites.afterFiles).toEqual([]);
    expect(rewrites.fallback).toEqual([
      { source: '/uploads/:path*', destination: 'http://127.0.0.1:3001/uploads/:path*' },
    ]);
    expect(await config.redirects()).toEqual([]);
  });

  it('avec UPLOADS_UPSTREAM_URL et ADMIN_SECRET_PATH : fallback personnalisé et règles admin', async () => {
    const config = loadConfig({ UPLOADS_UPSTREAM_URL: 'http://poker-api:3001/', ADMIN_SECRET_PATH: '/secret-42' });
    const rewrites = await config.rewrites();
    expect(rewrites.fallback).toEqual([
      { source: '/uploads/:path*', destination: 'http://poker-api:3001/uploads/:path*' },
    ]);
    expect(rewrites.beforeFiles).toEqual([
      { source: '/secret-42', destination: '/admin' },
      { source: '/secret-42/:path*', destination: '/admin/:path*' },
    ]);
    expect(await config.redirects()).toEqual([{ source: '/admin/:path*', destination: '/', permanent: false }]);
  });
});
