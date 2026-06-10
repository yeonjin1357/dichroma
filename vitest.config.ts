import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The extension app gets its own test project in M2.
    projects: ['packages/*'],
  },
});
