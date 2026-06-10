import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// WxtVitest reads wxt.config.ts and provides WXT's aliases/auto-imports plus
// @webext-core/fake-browser as an in-memory `browser`/`chrome` global. The
// explicit root keeps the aliases correct when vitest runs from the monorepo
// root (workspace project) instead of from this directory.
export default defineConfig({
  plugins: [WxtVitest({ root: dirname(fileURLToPath(import.meta.url)) })],
});
