import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: 'dichroma',
    description:
      'Scientifically accurate color-vision-deficiency simulator and contrast checker',
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
