import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://karthik-29.github.io/SnapSplit/ (a GitHub Pages project
  // site), so every asset URL needs the /SnapSplit/ prefix. import.meta.env.BASE_URL
  // reflects this value at runtime.
  base: '/SnapSplit/',
  plugins: [react()],
  server: {
    host: '0.0.0.0'
  }
});
