import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createCollectionHandler } from './dev/collection-api';

export default defineConfig({
  plugins: [react(), {
    name: 'local-collection-update',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createCollectionHandler(fileURLToPath(new URL('./public/collection.json', import.meta.url))));
    },
  }],
  base: './',
  server: { host: '127.0.0.1', strictPort: true },
});
