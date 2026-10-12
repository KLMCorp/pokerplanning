import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Les tests de handlers ouvrent la vraie base SQLite (server/store/userStore.ts lit DATA_DIR à l'import).
// Sans isolation, chaque exécution ajouterait des comptes et historiques factices dans data/pokerplanning.db,
// la base de développement. Un répertoire temporaire est donc créé une fois par exécution (évaluation de
// cette config dans le process principal) puis transmis aux workers via test.env.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokerplanning-vitest-'));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Initialise la base de test une seule fois avant les workers (évite les migrations concurrentes)
    globalSetup: ['./test/globalSetup.ts'],
    env: {
      DATA_DIR: testDataDir,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', 'server/utils/mailer.ts', 'src/lib/socket.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
