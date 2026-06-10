import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  format: 'esm',
  dts: true,
  // Emit .js/.d.ts (package is type:module) instead of the default .mjs/.d.mts,
  // matching the exports map in package.json.
  fixedExtension: false,
});
