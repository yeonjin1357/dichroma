import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project site: https://yeonjin1357.github.io/dichroma/
  base: '/dichroma/',
  plugins: [react()],
});
