import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RUNTIME_CONFIG,
  normalizeSocketUrl,
  parseAllowUploads,
  resolveRuntimeConfig,
  resolveSocketUrl,
} from '../../src/lib/runtimeConfig';

const loc = (u: string) => new URL(u);

describe('normalizeSocketUrl', () => {
  it.each([undefined, null, '', '   '])('retourne null pour %j', (raw) => {
    expect(normalizeSocketUrl(raw)).toBeNull();
  });

  it.each([
    ['http://example.test:3001', 'http://example.test:3001'],
    ['http://example.test:3001/', 'http://example.test:3001'],
    ['  https://poker.example.com  ', 'https://poker.example.com'],
    ['HTTP://Example.TEST:3001', 'http://example.test:3001'],
    ['http://example.test:80', 'http://example.test'],
    ['https://x.test:443/', 'https://x.test'],
    ['ws://example.test:3001', 'http://example.test:3001'],
    ['wss://example.test', 'https://example.test'],
    ['wss://example.test:443/', 'https://example.test'],
    ['http://192.168.1.10:3001', 'http://192.168.1.10:3001'],
    ['http://[::1]:3001', 'http://[::1]:3001'],
    ['http://[2001:db8::1]:3001/', 'http://[2001:db8::1]:3001'],
  ])('normalise %j en %j', (raw, expected) => {
    expect(normalizeSocketUrl(raw)).toBe(expected);
  });

  it.each([
    'example.test:3001',
    'localhost:3001',
    '//example.test:3001',
    '/socket.io',
    'ftp://example.test',
    'http://',
    'pas une url',
    'http://example.test:3001/socket',
    'http://example.test:3001/?a=1',
    'http://example.test:3001/#x',
    'http://user:pw@example.test:3001',
    'http://example.test:99999',
  ])('rejette %j', (raw) => {
    expect(normalizeSocketUrl(raw)).toBeNull();
  });
});

describe('parseAllowUploads', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['false', false],
    ['true', true],
    ['FALSE', true],
    ['0', true],
    [' false', true],
  ])('interprète %j comme %j', (raw, expected) => {
    expect(parseAllowUploads(raw)).toBe(expected);
  });
});

describe('resolveRuntimeConfig', () => {
  it('retourne la config par défaut sans source', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({}, warn)).toEqual(DEFAULT_RUNTIME_CONFIG);
    expect(warn).not.toHaveBeenCalled();
  });

  it('utilise la valeur runtime valide seule', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: 'http://r.test:3001/' }, warn).socketUrl).toBe('http://r.test:3001');
    expect(warn).not.toHaveBeenCalled();
  });

  it('préfère le runtime au build', () => {
    const warn = vi.fn();
    const cfg = resolveRuntimeConfig({ runtimeSocketUrl: 'http://r.test:3001', buildSocketUrl: 'http://b.test:3001' }, warn);
    expect(cfg.socketUrl).toBe('http://r.test:3001');
    expect(warn).not.toHaveBeenCalled();
  });

  it('retombe sur le build et avertit si le runtime est invalide', () => {
    const warn = vi.fn();
    const cfg = resolveRuntimeConfig({ runtimeSocketUrl: 'ftp://x', buildSocketUrl: 'http://b.test:3001' }, warn);
    expect(cfg.socketUrl).toBe('http://b.test:3001');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[config\] SOCKET_URL ignorée/);
  });

  it('retourne null et avertit si seul le runtime est invalide', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: 'ftp://x' }, warn).socketUrl).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ignore un runtime vide au profit du build, sans avertir', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: '', buildSocketUrl: 'http://b.test:3001' }, warn).socketUrl).toBe('http://b.test:3001');
    expect(warn).not.toHaveBeenCalled();
  });

  it('traite un runtime blanc comme absent', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: '   ', buildSocketUrl: 'http://b.test:3001' }, warn).socketUrl).toBe('http://b.test:3001');
    expect(warn).not.toHaveBeenCalled();
  });

  it('ne consulte pas (ni ne signale) un build invalide si le runtime est valide', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: 'http://r.test:3001', buildSocketUrl: 'nope' }, warn).socketUrl).toBe('http://r.test:3001');
    expect(warn).not.toHaveBeenCalled();
  });

  it('avertit pour un build invalide seul', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ buildSocketUrl: 'nope' }, warn).socketUrl).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[config\] NEXT_PUBLIC_SOCKET_URL ignorée/);
  });

  it('masque les identifiants dans le message', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: 'http://u:secret@h:3001' }, warn).socketUrl).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain('***@h:3001');
    expect(msg).not.toContain('secret');
  });

  it('masque un mot de passe contenant un arobase', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: 'http://u:p@ss@h:3001' }, warn).socketUrl).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).not.toContain('p@ss');
    expect(msg).not.toContain(':p');
  });

  it.each([
    ['false', 'true', false],
    ['true', 'false', true],
    [undefined, 'false', false],
    ['', 'false', false],
    [undefined, undefined, true],
  ])('allowUploads runtime %j / build %j donne %j', (runtimeAllowUploads, buildAllowUploads, expected) => {
    expect(resolveRuntimeConfig({ runtimeAllowUploads, buildAllowUploads }, vi.fn()).allowUploads).toBe(expected);
  });

  it.each(['http://u:a/b@h:3001', 'http://u:pa ss@h:3001', 'http://u:p@ss@h:3001'])(
    'masque les identifiants dans l’avertissement : %j',
    (raw) => {
      const warn = vi.fn();
      expect(resolveRuntimeConfig({ runtimeSocketUrl: raw }, warn).socketUrl).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = warn.mock.calls[0][0] as string;
      expect(msg).toContain('***@h:3001');
      for (const leak of ['a/b', 'pa ss', 'p@ss', 'u:']) expect(msg).not.toContain(leak);
    },
  );

  it('avertit pour chaque niveau invalide consulté', () => {
    const warn = vi.fn();
    expect(resolveRuntimeConfig({ runtimeSocketUrl: 'ftp://x', buildSocketUrl: 'nope' }, warn).socketUrl).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/^\[config\] SOCKET_URL/);
    expect(warn.mock.calls[1][0]).toMatch(/^\[config\] NEXT_PUBLIC_SOCKET_URL/);
  });

  it('tronque la valeur citée à 200 caractères', () => {
    const warn = vi.fn();
    resolveRuntimeConfig({ runtimeSocketUrl: 'ftp://' + 'a'.repeat(300) }, warn);
    const m = (warn.mock.calls[0][0] as string).match(/: (".*") n'est pas/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]).length).toBe(200);
  });

  it('ne lève pas d’exception sans fonction warn', () => {
    expect(() => resolveRuntimeConfig({ runtimeSocketUrl: 'ftp://x' })).not.toThrow();
  });
});

describe('resolveSocketUrl', () => {
  it.each([
    ['https://x.test', 'http://a:3000/', true, 'https://x.test'],
    [null, 'http://192.168.1.10:3000/room/ABC234', true, 'http://192.168.1.10:3001'],
    [null, 'http://192.168.1.10:3000/room/ABC234', false, 'http://192.168.1.10:3001'],
    [null, 'http://localhost:3000/', false, 'http://localhost:3001'],
    [null, 'https://poker.lan:3000/', true, 'https://poker.lan:3000'],
    [null, 'https://poker.lan:3000/', false, 'http://localhost:3001'],
    [null, 'http://[::1]:3000/', true, 'http://[::1]:3001'],
    [null, 'http://poker.lan/', true, 'http://poker.lan'],
    [null, 'https://poker.example.com/', true, 'https://poker.example.com'],
    [null, 'http://poker.lan:8080/', true, 'http://poker.lan:8080'],
    [null, 'http://poker.lan:8080/', false, 'http://localhost:3001'],
    [null, 'http://poker.lan/', false, 'http://localhost:3001'],
  ])('(%j, %j, %j) donne %j', (configured, url, isProd, expected) => {
    expect(resolveSocketUrl(configured, loc(url), isProd)).toBe(expected);
  });

  it('sans location ni config : URL de développement', () => {
    expect(resolveSocketUrl(null, null, true)).toBe('http://localhost:3001');
  });

  it('la config prime même sans location', () => {
    expect(resolveSocketUrl('http://c.test:3001', null, false)).toBe('http://c.test:3001');
  });
});
