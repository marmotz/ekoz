import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: { port: 4010 },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ router: { routeFileIgnorePattern: '\\.test\\.' } }),
    viteReact(),
  ],
});
