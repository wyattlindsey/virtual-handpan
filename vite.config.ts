import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /virtual-handpan/; local dev and other hosts use /.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { globals: true, environment: 'node' },
});
