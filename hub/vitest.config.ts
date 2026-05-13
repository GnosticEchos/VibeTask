import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    
    // Unit tests configuration
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**/*.ts'],
    
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'tests/**',
        'node_modules/**',
        'dist/**',
        'prisma/**',
        '**/*.config.ts',
        '**/*.d.ts',
      ],
    },
    
    // Unit test setup file
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Allow importing .js extensions for ESM compatibility
    deps: {
      interopDefault: true,
    },
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Ensure .ts files can be imported with .js extension
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
});

/**
 * Integration Tests Configuration
 * 
 * Run integration tests with: npx vitest run --config vitest.integration.config.ts
 * Or use the npm script: npm run test:integration
 * 
 * Integration tests use:
 * - Real database connections (no mocks)
 * - Transaction support for cleanup
 * - Test data factories with unique IDs (> 10000)
 */
export const integrationConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    
    // Integration tests only
    include: ['tests/**/*.integration.ts'],
    exclude: ['tests/**/*.test.ts'],
    
    // Integration test setup
    setupFiles: ['tests/integration/setup.ts'],
    
    // Longer timeouts for database operations
    testTimeout: 60000,
    hookTimeout: 60000,
    
    // Run tests sequentially to avoid database conflicts
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    
    // Coverage for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'tests/**',
        'node_modules/**',
        'dist/**',
        'prisma/**',
        '**/*.config.ts',
        '**/*.d.ts',
      ],
    },
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
