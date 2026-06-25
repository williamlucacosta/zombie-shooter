import { defineConfig } from 'vite';
import { resolve } from 'path';

// Serve le pagine di sviluppo su URL puliti: /audios -> audios.html, /models -> models.html.
const cleanUrls = () => ({
  name: 'clean-dev-urls',
  configureServer(server) {
    const map = { '/audios': '/audios.html', '/audios/': '/audios.html', '/models': '/models.html', '/models/': '/models.html' };
    server.middlewares.use((req, _res, next) => {
      if (map[req.url]) req.url = map[req.url];
      next();
    });
  },
});

export default defineConfig({
  plugins: [cleanUrls()],
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
        models: resolve(__dirname, 'models.html'),
      },
    },
  },
});
