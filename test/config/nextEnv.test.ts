import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

describe('next.config.js (bloc env)', () => {
  const ENV_KEYS = ['APP_VERSION', 'ALLOW_UPLOADS', 'NEXT_PUBLIC_ALLOW_UPLOADS', 'NEXT_PUBLIC_SOCKET_URL', 'SOCKET_URL'] as const;
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
    return require('../../next.config.js') as { env: Record<string, string> };
  }

  const packageVersion = () => createRequire(import.meta.url)('../../package.json').version as string;

  it('retire le préfixe v d’un tag de release', () => {
    expect(loadConfig({ APP_VERSION: 'v1.2.0' }).env.NEXT_PUBLIC_APP_VERSION).toBe('1.2.0');
  });

  it('conserve une version sans préfixe', () => {
    expect(loadConfig({ APP_VERSION: '1.2.0' }).env.NEXT_PUBLIC_APP_VERSION).toBe('1.2.0');
  });

  it('utilise la version de package.json par défaut', () => {
    expect(loadConfig({}).env.NEXT_PUBLIC_APP_VERSION).toBe(packageVersion());
  });

  it('reprend ALLOW_UPLOADS du build', () => {
    expect(loadConfig({ ALLOW_UPLOADS: 'false' }).env.NEXT_PUBLIC_ALLOW_UPLOADS).toBe('false');
  });

  it('NEXT_PUBLIC_ALLOW_UPLOADS prime sur ALLOW_UPLOADS', () => {
    expect(loadConfig({ NEXT_PUBLIC_ALLOW_UPLOADS: 'true', ALLOW_UPLOADS: 'false' }).env.NEXT_PUBLIC_ALLOW_UPLOADS).toBe('true');
  });

  it('NEXT_PUBLIC_ALLOW_UPLOADS vaut chaîne vide sans variable', () => {
    expect(loadConfig({}).env.NEXT_PUBLIC_ALLOW_UPLOADS).toBe('');
  });

  it('NEXT_PUBLIC_SOCKET_URL : vide si absente, sinon sa valeur', () => {
    expect(loadConfig({}).env.NEXT_PUBLIC_SOCKET_URL).toBe('');
    expect(loadConfig({ NEXT_PUBLIC_SOCKET_URL: 'http://b.test:3001' }).env.NEXT_PUBLIC_SOCKET_URL).toBe('http://b.test:3001');
  });

  it('n’inline jamais SOCKET_URL (valeur de lancement)', () => {
    const config = loadConfig({ SOCKET_URL: 'http://must-not-inline.test:3001' });
    expect(config.env.NEXT_PUBLIC_SOCKET_URL).toBe('');
    expect(Object.values(config.env)).not.toContain('http://must-not-inline.test:3001');
    expect(Object.keys(config.env).sort()).toEqual([
      'NEXT_PUBLIC_ALLOW_UPLOADS',
      'NEXT_PUBLIC_APP_VERSION',
      'NEXT_PUBLIC_CARDS_PATH',
      'NEXT_PUBLIC_SOCKET_URL',
    ]);
  });
});
