import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(async ({ mode }) => {
  const plugins = [];
  if (mode === 'single') {
    const { viteSingleFile } = await import('vite-plugin-singlefile');
    plugins.push(viteSingleFile());
  }
  return {
    base: './',
    assetsInclude: ['**/*.glb'],
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1200,
    },
  };
});
