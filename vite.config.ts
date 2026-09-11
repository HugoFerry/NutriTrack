import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `vite build --mode artifact` : version web hébergée en artefact Claude (chemins relatifs).
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    plugins: [react()],
    base: artifact ? './' : '/',
    build: { outDir: artifact ? 'dist-artifact' : 'dist' },
    define: { __ARTIFACT_BUILD__: JSON.stringify(artifact) },
  };
});
