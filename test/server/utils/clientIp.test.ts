import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseTrustProxy,
  normalizeIp,
  parseForwardedFor,
  resolveClientIp,
  getTrustedHops,
  getHandshakeIp,
} from '../../../server/utils/clientIp';

describe('clientIp', () => {
  describe('resolveClientIp', () => {
    it('XFF "1.1.1.1, 2.2.2.2", remote 127.0.0.1, TRUST_PROXY=1 -> 2.2.2.2', () => {
      expect(resolveClientIp('127.0.0.1', '1.1.1.1, 2.2.2.2', 1)).toBe('2.2.2.2');
    });

    it('même XFF, TRUST_PROXY=2 -> 1.1.1.1', () => {
      expect(resolveClientIp('127.0.0.1', '1.1.1.1, 2.2.2.2', 2)).toBe('1.1.1.1');
    });

    it('XFF absent, TRUST_PROXY=1 -> IP distante', () => {
      expect(resolveClientIp('10.0.0.5', undefined, 1)).toBe('10.0.0.5');
    });

    it('TRUST_PROXY=5 avec une seule entrée XFF -> entrée la plus à gauche (index clampé à 0)', () => {
      expect(resolveClientIp('127.0.0.1', '9.9.9.9', 5)).toBe('9.9.9.9');
    });

    it('sans proxy de confiance, XFF est ignoré', () => {
      expect(resolveClientIp('127.0.0.1', '1.1.1.1', 0)).toBe('127.0.0.1');
    });

    it('remote ::ffff:10.0.0.1 -> 10.0.0.1 ; ::1 reste ::1', () => {
      expect(resolveClientIp('::ffff:10.0.0.1', undefined, 0)).toBe('10.0.0.1');
      expect(resolveClientIp('::1', undefined, 0)).toBe('::1');
    });

    it('adresse distante absente -> unknown', () => {
      expect(resolveClientIp(undefined, undefined, 0)).toBe('unknown');
    });

    it('XFF fourni sous forme de tableau', () => {
      expect(resolveClientIp('127.0.0.1', ['1.1.1.1', '2.2.2.2, 3.3.3.3'], 1)).toBe('3.3.3.3');
    });
  });

  describe('parseTrustProxy', () => {
    it.each([
      [undefined, 0],
      ['', 0],
      ['false', 0],
      ['0', 0],
      ['true', 1],
      ['2', 2],
      ['99', 10],
    ])('%j -> %d', (value, expected) => {
      expect(parseTrustProxy(value)).toBe(expected);
    });

    it('"abc" -> 0', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseTrustProxy('abc')).toBe(0);
      warn.mockRestore();
    });

    it('TRUST_PROXY="yes" -> 0 avec un seul warning (flag de module)', async () => {
      vi.resetModules();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fresh = await import('../../../server/utils/clientIp');

      expect(fresh.parseTrustProxy('yes')).toBe(0);
      expect(fresh.parseTrustProxy('yes')).toBe(0);
      expect(fresh.parseTrustProxy('nope')).toBe(0);

      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });

  describe('normalizeIp', () => {
    it('trim, minuscules et retrait du préfixe ::ffff: IPv4', () => {
      expect(normalizeIp(' ::FFFF:1.2.3.4 ')).toBe('1.2.3.4');
    });

    it('conserve ::ffff: suivi d\'une adresse non IPv4', () => {
      expect(normalizeIp('::ffff:abcd:1234')).toBe('::ffff:abcd:1234');
    });

    it('chaîne vide -> unknown', () => {
      expect(normalizeIp('   ')).toBe('unknown');
    });
  });

  describe('parseForwardedFor', () => {
    it('découpe, trim et retire les entrées vides', () => {
      expect(parseForwardedFor(' 1.1.1.1 , ,2.2.2.2,')).toEqual(['1.1.1.1', '2.2.2.2']);
    });

    it('joint un tableau d\'en-têtes', () => {
      expect(parseForwardedFor(['1.1.1.1', '2.2.2.2'])).toEqual(['1.1.1.1', '2.2.2.2']);
    });

    it('undefined -> liste vide', () => {
      expect(parseForwardedFor(undefined)).toEqual([]);
    });
  });

  describe('getTrustedHops / getHandshakeIp (lecture de process.env à chaque appel)', () => {
    const original = process.env.TRUST_PROXY;

    afterEach(() => {
      if (original === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = original;
    });

    it('suit la valeur courante de TRUST_PROXY', () => {
      process.env.TRUST_PROXY = '2';
      expect(getTrustedHops()).toBe(2);
      process.env.TRUST_PROXY = 'true';
      expect(getTrustedHops()).toBe(1);
      delete process.env.TRUST_PROXY;
      expect(getTrustedHops()).toBe(0);
    });

    it('getHandshakeIp utilise X-Forwarded-For selon TRUST_PROXY', () => {
      const handshake = { address: '127.0.0.1', headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } };
      process.env.TRUST_PROXY = '1';
      expect(getHandshakeIp(handshake)).toBe('2.2.2.2');
      process.env.TRUST_PROXY = '2';
      expect(getHandshakeIp(handshake)).toBe('1.1.1.1');
      delete process.env.TRUST_PROXY;
      expect(getHandshakeIp(handshake)).toBe('127.0.0.1');
    });
  });
});
