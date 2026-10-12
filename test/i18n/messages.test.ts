import { describe, it, expect } from 'vitest';
import fr from '../../src/i18n/messages/fr.json';
import en from '../../src/i18n/messages/en.json';

/** Aplatit un objet de messages en { 'namespace.cle': valeur } */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      Object.assign(out, flatten(value as Record<string, unknown>, path));
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

const flatFr = flatten(fr);
const flatEn = flatten(en);

/** Ensemble trié des occurrences d'une regex (groupe 1) dans un message */
function tokens(message: string, regex: RegExp): string[] {
  return [...new Set([...message.matchAll(regex)].map((m) => m[1]))].sort();
}

/**
 * Noms des arguments ICU de premier niveau ({name}, {count, plural, …}).
 * Le texte des branches plural (`other {s}`) n'est pas un argument : on ignore les accolades imbriquées.
 */
function icuArguments(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (ch === '{') {
      if (depth === 0) {
        const name = /^\s*(\w+)/.exec(message.slice(i + 1))?.[1];
        if (name) names.add(name);
      }
      depth++;
    } else if (ch === '}') {
      depth--;
    }
  }
  return [...names].sort();
}

describe('messages i18n', () => {
  it('fr et en ont exactement les mêmes clés (aplaties)', () => {
    const missingInEn = Object.keys(flatFr).filter((k) => !(k in flatEn));
    const missingInFr = Object.keys(flatEn).filter((k) => !(k in flatFr));

    expect({ missingInEn, missingInFr }).toEqual({ missingInEn: [], missingInFr: [] });
  });

  it('aucune valeur vide', () => {
    const empty = [
      ...Object.entries(flatFr).filter(([, v]) => v.trim() === '').map(([k]) => `fr:${k}`),
      ...Object.entries(flatEn).filter(([, v]) => v.trim() === '').map(([k]) => `en:${k}`),
    ];

    expect(empty).toEqual([]);
  });

  it('mêmes placeholders ICU {x} et mêmes balises <tag> par clé', () => {
    const mismatches: string[] = [];
    for (const key of Object.keys(flatFr)) {
      if (!(key in flatEn)) continue;
      const placeholdersFr = icuArguments(flatFr[key]);
      const placeholdersEn = icuArguments(flatEn[key]);
      const tagsFr = tokens(flatFr[key], /<(\w+)>/g);
      const tagsEn = tokens(flatEn[key], /<(\w+)>/g);
      if (placeholdersFr.join() !== placeholdersEn.join()) {
        mismatches.push(`${key}: placeholders fr=[${placeholdersFr}] en=[${placeholdersEn}]`);
      }
      if (tagsFr.join() !== tagsEn.join()) {
        mismatches.push(`${key}: balises fr=[${tagsFr}] en=[${tagsEn}]`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
