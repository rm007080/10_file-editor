import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ['@app/shared', '@app/server'] }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
        output: { format: 'es' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts'),
        },
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    root: './client',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'client/index.html'),
      },
    },
  },
});
