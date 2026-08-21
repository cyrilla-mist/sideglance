import { defineConfig } from 'vite';

export default defineConfig({
  preview: { host: '127.0.0.1', port: 4176 },
  server: { host: '127.0.0.1', port: 4176, proxy: { '/api': 'http://127.0.0.1:8787' } },
});
