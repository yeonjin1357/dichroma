import { defineConfig } from 'vitest/config';

// Unit tests cover only the pure helpers in src/lib (no canvas/DOM), so the
// plain node environment is enough; the root config's `projects: ['apps/*']`
// glob picks this file up.
export default defineConfig({
  test: {
    environment: 'node',
  },
});
