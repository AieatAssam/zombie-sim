import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/zombie-sim/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
