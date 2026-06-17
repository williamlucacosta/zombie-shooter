import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3210,       // porta dedicata: la 5173 è usata da un altro progetto
    strictPort: true, // fallisce chiaramente invece di cambiare porta in silenzio
  },
  preview: {
    port: 3211,
    strictPort: true,
  },
});
