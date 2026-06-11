import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'wxt';

const require = createRequire(import.meta.url);

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // Keep the vendored paths typed (ScriptPublicPath) even before the first
    // build has populated public/vendor/.
    'prepare:publicPaths': (_wxt, paths) => {
      paths.push('vendor/axe.min.js', 'vendor/LICENSE');
    },
    // Vendor axe-core into public/vendor/ (→ output vendor/) on every build,
    // so a fresh `pnpm install && pnpm build` works with nothing committed.
    // MPL-2.0 compliance: ship axe.min.js BYTE-IDENTICAL with its LICENSE
    // alongside (see the attribution note in the root README).
    'build:before': async (wxt) => {
      const axeMin = require.resolve('axe-core/axe.min.js');
      const license = path.join(path.dirname(axeMin), 'LICENSE');
      const dest = path.join(wxt.config.publicDir, 'vendor');
      await mkdir(dest, { recursive: true });
      await copyFile(axeMin, path.join(dest, 'axe.min.js'));
      await copyFile(license, path.join(dest, 'LICENSE'));
    },
  },
  manifest: ({ mode }) => ({
    // 'dichroma' is a proper noun — never localized; the description resolves
    // from public/_locales/{en,ko}/messages.json (en is the default).
    name: 'dichroma',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // The sidepanel entrypoint makes WXT add the sidePanel permission and
    // side_panel.default_path on its own.
    permissions: ['activeTab', 'scripting', 'storage'],
    optional_host_permissions: ['<all_urls>'],
    commands: {
      'toggle-simulation': {
        // No suggested_key on purpose: defaults conflict with other
        // extensions; users assign one at chrome://extensions/shortcuts.
        description: 'Toggle color-vision simulation',
      },
    },
    // `wxt build --mode e2e` (outputs .output/chrome-mv3-e2e) ships
    // host_permissions so the Playwright suite can script pages without a
    // user gesture granting activeTab. Production builds must never have it —
    // e2e/extension.spec.mjs asserts both directions.
    ...(mode === 'e2e' ? { host_permissions: ['<all_urls>'] } : {}),
  }),
});
