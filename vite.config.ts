import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    modulePreload: {
      resolveDependencies: () => [],
    },
    rollupOptions: {
      input: { player: 'index.html', popup: 'popup.html', background: 'src/background.ts' },
      output: {
        entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});