import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Los extractos de código se importan con ?raw desde ../talent_acquisition
// (solo lectura), por eso Vite necesita permiso para leer la carpeta padre.
const parent = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  base: './',
  server: { fs: { allow: [parent] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
