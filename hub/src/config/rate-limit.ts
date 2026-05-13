/**
 * Rate Limiting Configuration
 * 
 * Centralized configuration for rate limiting with admin override capability.
 * Supports Redis for distributed rate limiting with memory fallback.
 */

// Redis connection configuration
export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  enabled: process.env.REDIS_ENABLED === 'true',
};

// Cache TTL for rate limit configurations (5 minutes in milliseconds)
export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

// Default rate limit configurations
export const defaultRateLimits = [
  {
    name: 'Authentication',
    endpointPattern: '/api/auth/*',
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    enabled: true,
    description: 'Limit authentication attempts to prevent brute force attacks',
  },
  {
    name: 'General API',
    endpointPattern: '/api/*',
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    enabled: true,
    description: 'General API rate limit for all endpoints',
  },
  {
    name: 'Kanban Board - Tasks',
    endpointPattern: '/api/tasks/*',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    enabled: true,
    description: 'Rate limit for task operations - raised to 1000/min for API-heavy Kanban operations',
  },
  {
    name: 'Kanban Board - Columns',
    endpointPattern: '/api/columns/*',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    enabled: true,
    description: 'Rate limit for column operations - raised to 1000/min for API-heavy Kanban operations',
  },
  {
    name: 'Kanban Board - Projects',
    endpointPattern: '/api/projects/*',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    enabled: true,
    description: 'Rate limit for project operations - raised to 1000/min for API-heavy Kanban operations',
  },
  {
    name: 'Kanban Board - Members',
    endpointPattern: '/api/members/*',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    enabled: true,
    description: 'Rate limit for member operations - raised to 1000/min for API-heavy Kanban operations',
  },
  {
    name: 'Agent Endpoints',
    endpointPattern: '/api/agent/*',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000, // Agents get high limits, inherited from parent user
    enabled: true,
    description: 'Rate limit for agent endpoints - limited by parent user rate limit',
  },
  {
    name: 'Member Invitations',
    endpointPattern: '/api/members/*/invite',
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    enabled: true,
    description: 'Limit member invitations to prevent spam',
  },
  {
    name: 'Admin Endpoints',
    endpointPattern: '/api/admin/*',
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 50,
    enabled: true,
    description: 'Rate limit for admin endpoints',
  },
  {
    name: 'Health Checks',
    endpointPattern: '/health',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000, // Effectively no limit
    enabled: false,
    description: 'Health check endpoint - disabled by default',
  },
];

// Admin bypass configuration
export const adminBypassConfig = {
  enabled: process.env.RATE_LIMIT_ADMIN_BYPASS === 'true' && !!process.env.RATE_LIMIT_ADMIN_BYPASS_KEY,
  headerName: 'X-Admin-Bypass-Key',
  secretKey: process.env.RATE_LIMIT_ADMIN_BYPASS_KEY || '',
};

/**
 * Frontend API Key Bypass Configuration
 * 
 * PLACEHOLDER FOR FUTURE IMPLEMENTATION
 * 
 * This configuration allows the frontend client to bypass rate limiting.
 * Currently not implemented - requires:
 * - Adding an API key model to track frontend clients
 * - Implementing key validation middleware
 * - Setting FRONTEND_API_KEY environment variable
 * 
 * When implemented, the frontend will include a special header
 * that allows it to bypass standard rate limits while still
 * being tracked for analytics purposes.
 */
export const frontendBypassConfig = {
  // TODO: Enable when implementing frontend API key bypass
  enabled: false, // process.env.FRONTEND_API_KEY && process.env.FRONTEND_API_KEY === 'true'
  headerName: 'X-Frontend-Client',
  // TODO: Add actual API key validation
  // apiKey: process.env.FRONTEND_API_KEY || '',
  description: 'Placeholder for frontend client bypass - not yet implemented',
};

// Agent rate limiting configuration
export const agentRateLimitConfig = {
  // When true, agents inherit rate limit from their parent user
  inheritFromParent: true,
  // Fallback max requests if parent user rate limit cannot be determined
  fallbackMaxRequests: 500,
  // Header used to identify agent API key
  apiKeyHeader: 'x-agent-api-key',
  description: 'Agents inherit rate limits from their parent/creating user',
};

// Retry-After header configuration
export const retryAfterConfig = {
  enabled: true,
  includeTimestamp: true,
};

// Logging configuration
export const loggingConfig = {
  enabled: process.env.RATE_LIMIT_LOGGING !== 'false',
  logLevel: process.env.RATE_LIMIT_LOG_LEVEL || 'warn',
};
