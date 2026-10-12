/**
 * Setup global Vitest (process principal, avant le démarrage des workers).
 *
 * La base SQLite de test (répertoire temporaire défini dans vitest.config.ts) est vide au départ.
 * Plusieurs workers importeraient userStore en parallèle et exécuteraient ensemble la création du schéma
 * et les migrations (« database is locked », « duplicate column name »). On initialise donc la base
 * une seule fois ici, puis on supprime le répertoire temporaire à la fin de l'exécution.
 */
import * as fs from 'fs';

interface GlobalSetupProject {
  config: { env?: Record<string, string | undefined> };
}

export default async function setup(project: GlobalSetupProject): Promise<() => void> {
  const dataDir = project.config.env?.DATA_DIR;
  if (!dataDir) {
    throw new Error('DATA_DIR doit être défini dans test.env (vitest.config.ts) pour isoler la base de test');
  }

  process.env.DATA_DIR = dataDir;
  const userStore = await import('../server/store/userStore');

  return () => {
    userStore.stopCleanupInterval();
    // Sous Windows, supprimer une base encore ouverte lève EBUSY : le teardown ne doit pas faire échouer le run
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[globalSetup] suppression de ${dataDir} impossible :`, e);
    }
  };
}
