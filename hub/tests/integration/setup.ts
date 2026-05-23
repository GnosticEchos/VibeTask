/**
 * Integration Test Setup
 * 
 * Global setup and teardown for integration tests.
 * - Loads test environment variables
 * - Connects to database
 * - Provides cleanup after all tests
 * 
 * This file is referenced in vitest.config.ts as a setupFile for integration tests.
 */

import { beforeAll, afterAll, afterEach } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  cleanupTrackedEntities,
} from './setup/test-db.js';
import { ensureCiBootstrapExistingUser } from '../helpers/integration-helpers.js';

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), quiet: true });

// Override with .env.test.local if it exists (for local overrides)
dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local'), override: true, quiet: true });

// Ensure NODE_ENV is set to test
process.env.NODE_ENV = 'test';

// Disable rate limiting in tests by default
if (process.env.TEST_RATE_LIMIT === undefined) {
  process.env.TEST_RATE_LIMIT = 'false';
}

const isIntegrationVerbose = process.env.TEST_VERBOSE === 'true';
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const message = args.map((arg) => String(arg)).join(' ');
  if (!isIntegrationVerbose && message.includes('ERROR [Better Auth]')) {
    return;
  }
  originalConsoleError(...args);
};

// Suppress console output during tests (optional - comment out for debugging)
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});
// vi.spyOn(console, 'error').mockImplementation(() => {});

/**
 * Setup: Connect to database before all tests
 */
beforeAll(async () => {
  if (isIntegrationVerbose) {
    console.log('[Integration Tests] Connecting to test database...');
  }
  await connectTestDatabase();
  await ensureCiBootstrapExistingUser();
  if (isIntegrationVerbose) {
    console.log('[Integration Tests] Database connected');
  }
}, 30000);

/**
 * Teardown: Clean up after each test
 * This ensures test isolation - each test starts with a clean slate
 */
afterEach(async () => {
  await cleanupTrackedEntities();
});

/**
 * Teardown: Disconnect from database after all tests
 */
afterAll(async () => {
  if (isIntegrationVerbose) {
    console.log('[Integration Tests] Disconnecting from test database...');
  }
  await disconnectTestDatabase();
  if (isIntegrationVerbose) {
    console.log('[Integration Tests] Database disconnected');
  }
}, 30000);

/**
 * Export setup functions for manual use in test files
 */
export {
  connectTestDatabase,
  disconnectTestDatabase,
  cleanupTrackedEntities,
};
