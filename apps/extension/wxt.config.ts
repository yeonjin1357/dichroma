import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'dichroma',
    description:
      'Scientifically accurate color-vision-deficiency simulator and contrast checker',
    permissions: ['activeTab', 'scripting', 'storage'],
  },
});
