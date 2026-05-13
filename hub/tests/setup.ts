/**
 * Test Setup File
 * 
 * Global setup and teardown for all tests.
 * Mocks and utilities that are available to all tests.
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Mock console to reduce noise during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

beforeAll(() => {
  // Set up any global test state
  vi.useFakeTimers();
});

afterAll(() => {
  // Clean up global test state
  vi.useRealTimers();
  vi.clearAllMocks();
});

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
});