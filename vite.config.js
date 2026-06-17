import { defineConfig } from 'vite';
import { resolve } from 'path';

// Serve la pagina banco-prova audio sull'URL pulito /audios (file: audios.html).
const audiosRoute = () => ({
  name: 'audios-clean-url',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/audios' || req.url === '/audios/') req.url = '/audios.html';
      next();
    });
  },
});

export default defineConfig({
  plugins: [audiosRoute()],
  server: {
    port: 3210,       // porta dedicata: la 5173 è usata da un altro progetto
    strictPort: true, // fallisce chiaramente invece di cambiare porta in silenzio
  },
  preview: {
    port: 3211,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        audios: resolve(__dirname, 'audios.html'),
      },
    },
  },
});
