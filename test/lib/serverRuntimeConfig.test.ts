import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getServerRuntimeConfig } from '../../src/lib/serverRuntimeConfig';

const ENV_KEYS = ['SOCKET_URL', 'NEXT_PUBLIC_SOCKET_URL', 'ALLOW_UPLOADS', 'NEXT_PUBLIC_ALLOW_UPLOADS'] as const;

describe('getServerRuntimeConfig', () => {
  const saved: Record<string, string | undefined> = {};
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('retourne la config par défaut sans variable', () => {
    expect(getServerRuntimeConfig()).toEqual({ socketUrl: null, allowUploads: true });
  });

  it('normalise SOCKET_URL', () => {
    process.env.SOCKET_URL = 'http://example.test:3001/';
    expect(getServerRuntimeConfig().socketUrl).toBe('http://example.test:3001');
  });

  it('SOCKET_URL prime sur NEXT_PUBLIC_SOCKET_URL', () => {
    process.env.SOCKET_URL = 'http://runtime.test:3001';
    process.env.NEXT_PUBLIC_SOCKET_URL = 'http://build.test:3001';
    expect(getServerRuntimeConfig().socketUrl).toBe('http://runtime.test:3001');
  });

  it('NEXT_PUBLIC_SOCKET_URL seule est utilisée', () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = 'http://build.test:3001';
    expect(getServerRuntimeConfig().socketUrl).toBe('http://build.test:3001');
  });

  it('ALLOW_UPLOADS=false désactive les uploads', () => {
    process.env.ALLOW_UPLOADS = 'false';
    expect(getServerRuntimeConfig().allowUploads).toBe(false);
  });

  it('NEXT_PUBLIC_ALLOW_UPLOADS=false seule désactive les uploads', () => {
    process.env.NEXT_PUBLIC_ALLOW_UPLOADS = 'false';
    expect(getServerRuntimeConfig().allowUploads).toBe(false);
  });

  it('relit les variables à chaque appel', () => {
    process.env.SOCKET_URL = 'http://a.test:3001';
    expect(getServerRuntimeConfig().socketUrl).toBe('http://a.test:3001');
    process.env.SOCKET_URL = 'http://b.test:3001';
    expect(getServerRuntimeConfig().socketUrl).toBe('http://b.test:3001');
  });

  it('n’avertit qu’une fois par valeur invalide', () => {
    process.env.SOCKET_URL = 'ftp://unique-1.test';
    getServerRuntimeConfig();
    getServerRuntimeConfig();
    getServerRuntimeConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    process.env.SOCKET_URL = 'ftp://unique-2.test';
    getServerRuntimeConfig();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
