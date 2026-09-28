import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Date de construction fixe pour les tests de la version publiée (src/data/__tests__/sync-artefact.test.ts).
  define: { __APP_BUILD__: JSON.stringify('2026-09-28T12:00:00.000Z') },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
