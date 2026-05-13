import { defineConfig } from 'vitest/config';
import path from 'path';

// Load environment variables before any test files are evaluated
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local'), override: true, quiet: true });

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
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    
    // Integration tests only (files ending in .integration.test.ts)
    include: ['tests/integration/**/*.test.ts'],
    
    // Integration test setup
    setupFiles: ['tests/integration/setup.ts'],
    
    // Longer timeouts for database operations
    testTimeout: 60000,
    hookTimeout: 60000,
    
    // Run tests sequentially to avoid database conflicts
    // Vitest 4: Use top-level options instead of deprecated poolOptions
    pool: 'forks',
    singleFork: true,
    // Run test files one at a time (no parallelism)
    fileParallelism: false,
    
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
    
    // Allow importing .js extensions for ESM compatibility
    deps: {
      interopDefault: true,
      // Inline the source files so vitest can resolve .js to .ts
      inline: [path.resolve(__dirname, './src')],
    },
    
    // Server configuration for ESM resolution
    server: {
      deps: {
        inline: [path.resolve(__dirname, './src')],
      },
    },
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Ensure .ts files can be imported with .js extension
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  
  // ESM configuration
  esbuild: {
    // This helps with .js -> .ts resolution
    loader: 'ts',
  },
});
