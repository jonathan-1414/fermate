import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the app at https://<user>.github.io/fermate/
  base: '/fermate/',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
