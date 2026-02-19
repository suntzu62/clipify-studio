import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/test/**',
        'src/**/*.test.ts',
        'src/types/**',
        'src/scripts/**',
        'dist/**',
      ],
      thresholds: {
        lines: 10,
        functions: 50,
        branches: 50,
        statements: 10,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: ['verbose'],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@': '/home/usuario/Documentos/cortai/clipify-studio/backend-v2/src',
    },
  },
});
