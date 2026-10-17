import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Ports are overridable so parallel worktrees can each run their own dev
// servers; the defaults match the documented dev loop.
const webPort = Number(process.env.SOTHSPELL_WEB_PORT ?? 5173);
const apiPort = Number(process.env.SOTHSPELL_API_PORT ?? 4319);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
