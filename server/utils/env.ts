/**
 * Lecture de variables d'environnement numériques
 */

/**
 * Lit une variable d'environnement entière.
 * Retourne defaultValue si la variable est absente, non numérique ou négative.
 * Lue à chaque appel (les tests modifient process.env après l'import).
 */
export function getEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultValue;
  return parsed;
}
