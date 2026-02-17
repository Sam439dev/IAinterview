import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

const jsxInJs = {
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!id.match(/src\/.*\.js$/)) {
      return null;
    }
    return transformWithEsbuild(code, id, {
      loader: 'jsx',
      jsx: 'automatic'
    });
  }
};

export default defineConfig({
  plugins: [jsxInJs, react({ include: '**/*.{jsx,js}' })],
  envPrefix: ['VITE_', 'REACT_APP_'],
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  server: {
    port: 3000,
    host: true
  },
  preview: {
    port: 3000,
    host: true
  }
});
