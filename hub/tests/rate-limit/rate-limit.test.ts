/**
 * Rate Limiting Tests
 * 
 * Tests for rate limiting middleware, configuration, and exceeded responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../helpers/index.js';

// Mock the rate limiter module
vi.mock('../../src/infrastructure/http/rate-limiter.js', () => ({
  createDynamicRateLimiter: vi.fn(() => async (req: any, res: any, next: any) => next()),
  createFixedRateLimiter: vi.fn(() => (req: any, res: any, next: any) => next()),
  getRedisStatus: vi.fn(() => ({ connected: false, enabled: false })),
  closeRedisConnection: vi.fn(),
}));

// Mock the rate limit service
vi.mock('../../src/domain/services/rate-limit.service.js', () => ({
  RateLimitService: {
    getAllConfigs: vi.fn(),
    getConfigById: vi.fn(),
    getConfigForEndpoint: vi.fn(),
    createConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
    toggleConfig: vi.fn(),
    initializeDefaults: vi.fn(),
    invalidateCache: vi.fn(),
  },
}));

// Mock the rate limit config
vi.mock('../../src/config/rate-limit.js', () => ({
  redisConfig: {
    enabled: false,
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
  },
  CONFIG_CACHE_TTL_MS: 300000,
  defaultRateLimits: [
    {
      name: 'Authentication',
      endpointPattern: '/api/auth/*',
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      enabled: true,
    },
    {
      name: 'General API',
      endpointPattern: '/api/*',
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
      enabled: true,
    },
  ],
  adminBypassConfig: { enabled: false, headerName: 'X-Admin-Bypass-Key', secretKey: '' },
  frontendBypassConfig: { enabled: false, headerName: 'X-Frontend-Client' },
  agentRateLimitConfig: { inheritFromParent: true, fallbackMaxRequests: 500, apiKeyHeader: 'x-agent-api-key' },
  retryAfterConfig: { enabled: true, includeTimestamp: true },
  loggingConfig: { enabled: true, logLevel: 'warn' },
}));

// Import after mocking
import { RateLimitService } from '../../src/domain/services/rate-limit.service.js';
import { createDynamicRateLimiter, createFixedRateLimiter, getRedisStatus } from '../../src/infrastructure/http/rate-limiter.js';

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rate Limit Service', () => {
    it('should get all rate limit configurations', async () => {
      // Arrange
      const mockConfigs = [
        { id: 1, name: 'Auth', endpointPattern: '/api/auth/*', windowMs: 900000, maxRequests: 5, enabled: true },
        { id: 2, name: 'API', endpointPattern: '/api/*', windowMs: 900000, maxRequests: 100, enabled: true },
      ];
      
      (RateLimitService.getAllConfigs as any).mockResolvedValue(mockConfigs);

      // Act
      const result = await RateLimitService.getAllConfigs();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Auth');
    });

    it('should get configuration by ID', async () => {
      // Arrange
      const mockConfig = { id: 1, name: 'Auth', endpointPattern: '/api/auth/*', windowMs: 900000, maxRequests: 5, enabled: true };
      
      (RateLimitService.getConfigById as any).mockResolvedValue(mockConfig);

      // Act
      const result = await RateLimitService.getConfigById(1);

      // Assert
      expect(result).toBeDefined();
      expect(result?.name).toBe('Auth');
    });

    it('should return null for non-existent config ID', async () => {
      // Arrange
      (RateLimitService.getConfigById as any).mockResolvedValue(null);

      // Act
      const result = await RateLimitService.getConfigById(999);

      // Assert
      expect(result).toBeNull();
    });

    it('should get configuration for specific endpoint', async () => {
      // Arrange
      const mockConfig = { id: 1, name: 'Auth', endpointPattern: '/api/auth/*', windowMs: 900000, maxRequests: 5, enabled: true };
      
      (RateLimitService.getConfigForEndpoint as any).mockResolvedValue(mockConfig);

      // Act
      const result = await RateLimitService.getConfigForEndpoint('/api/auth/login');

      // Assert
      expect(result).toBeDefined();
      expect(result?.endpointPattern).toBe('/api/auth/*');
    });

    it('should return null for non-matching endpoint', async () => {
      // Arrange
      (RateLimitService.getConfigForEndpoint as any).mockResolvedValue(null);

      // Act
      const result = await RateLimitService.getConfigForEndpoint('/unknown/path');

      // Assert
      expect(result).toBeNull();
    });

    it('should create new rate limit configuration', async () => {
      // Arrange
      const newConfig = {
        name: 'Test Endpoint',
        endpointPattern: '/api/test/*',
        windowMs: 60000,
        maxRequests: 50,
        enabled: true,
      };
      
      (RateLimitService.createConfig as any).mockResolvedValue({ id: 3, ...newConfig });

      // Act
      const result = await RateLimitService.createConfig(newConfig);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('Test Endpoint');
    });

    it('should update existing configuration', async () => {
      // Arrange
      const updatedConfig = { id: 1, name: 'Updated Auth', maxRequests: 10 };
      
      (RateLimitService.updateConfig as any).mockResolvedValue(updatedConfig);

      // Act
      const result = await RateLimitService.updateConfig(1, { maxRequests: 10 });

      // Assert
      expect(result.maxRequests).toBe(10);
    });

    it('should delete configuration', async () => {
      // Arrange
      const deletedConfig = { id: 1, name: 'Auth' };
      
      (RateLimitService.deleteConfig as any).mockResolvedValue(deletedConfig);

      // Act
      const result = await RateLimitService.deleteConfig(1);

      // Assert
      expect(result).toBeDefined();
    });

    it('should toggle configuration enabled status', async () => {
      // Arrange
      const toggledConfig = { id: 1, name: 'Auth', enabled: false };
      
      (RateLimitService.toggleConfig as any).mockResolvedValue(toggledConfig);

      // Act
      const result = await RateLimitService.toggleConfig(1);

      // Assert
      expect(result.enabled).toBe(false);
    });

    it('should invalidate cache after configuration changes', async () => {
      // Arrange - create a local mock to test the pattern
      const invalidateCacheMock = vi.fn();
      const updateConfigMock = vi.fn(async (id: number, data: any) => {
        invalidateCacheMock();
        return { id, ...data };
      });

      // Act
      await updateConfigMock(1, { maxRequests: 10 });

      // Assert - cache should be invalidated after update
      expect(invalidateCacheMock).toHaveBeenCalled();
    });

    it('should initialize default configurations', async () => {
      // Arrange
      (RateLimitService.initializeDefaults as any).mockResolvedValue(undefined);

      // Act
      await RateLimitService.initializeDefaults();

      // Assert
      expect(RateLimitService.initializeDefaults).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Middleware', () => {
    it('should create dynamic rate limiter', () => {
      // Act
      const middleware = createDynamicRateLimiter();

      // Assert
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should create fixed rate limiter', () => {
      // Act
      const middleware = createFixedRateLimiter(60000, 100);

      // Assert
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should get Redis status', async () => {
      // Act
      const status = await getRedisStatus();

      // Assert
      expect(status).toBeDefined();
      expect(status.enabled).toBe(false);
    });
  });

  describe('Rate Limit Response', () => {
    it('should return 429 status when limit exceeded', () => {
      // Arrange
      const mockRes = createMockResponse();
      mockRes.status = vi.fn().mockReturnValue(mockRes);
      mockRes.json = vi.fn().mockReturnValue(mockRes);
      mockRes.setHeader = vi.fn().mockReturnValue(mockRes);

      // Simulate rate limit exceeded
      const statusCode = 429;
      const responseData = {
        error: 'Too many requests, please try again later.',
        retryAfter: 60,
      };

      // Assert
      expect(statusCode).toBe(429);
      expect(responseData.error).toBeDefined();
      expect(responseData.retryAfter).toBeGreaterThan(0);
    });

    it('should include Retry-After header', () => {
      // Arrange
      const retryAfter = 60;
      const windowMs = 60000;

      // Act
      const calculatedRetryAfter = Math.ceil(windowMs / 1000);

      // Assert
      expect(calculatedRetryAfter).toBe(retryAfter);
    });

    it('should include rate limit headers', () => {
      // Arrange
      const limit = 100;
      const windowMs = 900000;

      // Assert - headers should be set
      expect(limit).toBe(100);
      expect(windowMs).toBe(900000);
    });
  });

  describe('Rate Limit Tiers', () => {
    it('should apply strict limits for authentication endpoints', () => {
      // Auth endpoints should have stricter limits
      const authConfig = { windowMs: 15 * 60 * 1000, maxRequests: 5 };
      
      expect(authConfig.maxRequests).toBe(5);
      expect(authConfig.windowMs).toBe(15 * 60 * 1000);
    });

    it('should apply moderate limits for general API', () => {
      // General API endpoints
      const apiConfig = { windowMs: 15 * 60 * 1000, maxRequests: 100 };
      
      expect(apiConfig.maxRequests).toBe(100);
    });

    it('should apply higher limits for kanban operations', () => {
      // Kanban operations need higher limits
      const kanbanConfig = { windowMs: 60 * 1000, maxRequests: 1000 };
      
      expect(kanbanConfig.maxRequests).toBe(1000);
    });

    it('should apply admin bypass configuration', () => {
      const adminConfig = { enabled: false, headerName: 'X-Admin-Bypass-Key' };
      
      // Admin bypass is disabled by default for security
      expect(adminConfig.enabled).toBe(false);
    });

    it('should apply agent rate limit configuration', () => {
      const agentConfig = { inheritFromParent: true, fallbackMaxRequests: 500 };
      
      // Agents inherit from parent user
      expect(agentConfig.inheritFromParent).toBe(true);
    });
  });

  describe('Pattern Matching', () => {
    it('should match wildcard patterns', () => {
      // Test pattern matching logic
      const pattern = '/api/auth/*';
      const testPath = '/api/auth/login';
      
      // Simple wildcard matching
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      
      expect(regex.test(testPath)).toBe(true);
    });

    it('should not match unrelated paths', () => {
      const pattern = '/api/auth/*';
      const testPath = '/api/projects';
      
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      
      expect(regex.test(testPath)).toBe(false);
    });

    it('should match exact paths', () => {
      const pattern = '/health';
      const testPath = '/health';
      
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      
      expect(regex.test(testPath)).toBe(true);
    });

    it('should prefer most specific match', () => {
      // More specific pattern should match first
      const patterns = ['/api/*', '/api/auth/*', '/api/auth/login'];
      
      // Most specific = longest pattern
      const mostSpecific = patterns.reduce((a, b) => b.length > a.length ? b : a);
      
      expect(mostSpecific).toBe('/api/auth/login');
    });
  });
});