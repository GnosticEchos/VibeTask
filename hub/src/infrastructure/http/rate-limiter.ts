/**
 * Dynamic Rate Limiting Middleware
 * 
 * Uses express-rate-limit with dynamic configuration from database.
 * Supports Redis store for distributed rate limiting with memory fallback.
 */

import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import type { Request, Response } from 'express';
import { RateLimitService } from '../../domain/services/rate-limit.service.js';
import { getUserIdFromRequest } from '../auth/index.js';
import { prisma } from '../auth/prisma.js';
import {
  redisConfig,
  adminBypassConfig,
  frontendBypassConfig,
  agentRateLimitConfig,
  retryAfterConfig,
  loggingConfig,
} from '../../config/rate-limit.js';

// Redis client (only created if enabled)
let redisClient: Redis | null = null;

if (redisConfig.enabled) {
  redisClient = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
  });
}

// In-memory store for rate limiting (fallback when Redis is not available)
const memoryStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Clean up expired entries from memory store periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetTime <= now) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

/**
 * Check if request is from an agent by looking for the agent API key header
 * Returns the parent user ID if found, null otherwise
 */
async function getAgentParentUserId(req: Request): Promise<number | null> {
  const agentKey = req.headers[agentRateLimitConfig.apiKeyHeader];
  
  if (!agentKey || typeof agentKey !== 'string') {
    return null;
  }

  try {
    // Look up the agent delegation by API key
    const delegation = await prisma.agentDelegation.findFirst({
      where: {
        apiKeyId: agentKey,
        isActive: true,
      },
      select: {
        delegatedById: true,
      },
    });

    return delegation?.delegatedById || null;
  } catch (error) {
    console.error('Error looking up agent parent user:', error);
    return null;
  }
}

/**
 * Check if request is from frontend client (bypass placeholder)
 * TODO: Implement actual frontend API key validation
 */
function isFrontendClient(req: Request): boolean {
  if (!frontendBypassConfig.enabled) {
    return false;
  }

  const frontendClient = req.headers[frontendBypassConfig.headerName.toLowerCase()];
  // TODO: Add actual validation when implementing
  return !!frontendClient;
}

/**
 * Generate a unique key for rate limiting
 * Uses user ID when authenticated, agent parent user ID for agents, IP address otherwise
 */
async function generateKey(req: Request): Promise<string> {
  // First check if this is an agent request
  const agentParentUserId = await getAgentParentUserId(req);
  
  if (agentParentUserId) {
    // Agent requests use parent user's rate limit
    return `agent:${agentParentUserId}`;
  }
  
  // Check for authenticated user
  const userId = await getUserIdFromRequest(req);
  
  if (userId) {
    return `user:${userId}`;
  }
  
  // Use IP address for unauthenticated requests
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Get the effective rate limit config for a request
 * For agent requests, returns the parent user's rate limit if available
 */
async function getEffectiveRateLimitConfig(req: Request, defaultConfig: any) {
  // Check if this is an agent request
  const agentParentUserId = await getAgentParentUserId(req);
  
  if (agentParentUserId && agentRateLimitConfig.inheritFromParent) {
    // For agents, we use the default agent config which has high limits
    // The actual rate limiting is keyed off the parent user ID
    return defaultConfig;
  }
  
  return defaultConfig;
}

/**
 * Check if the request should bypass rate limiting (admin or frontend bypass)
 */
function shouldBypass(req: Request): boolean {
  // Check admin bypass first
  if (adminBypassConfig.enabled) {
    const bypassKey = req.headers[adminBypassConfig.headerName.toLowerCase()];
    if (bypassKey === adminBypassConfig.secretKey) {
      return true;
    }
  }
  
  // Check frontend bypass (placeholder - not yet implemented)
  if (isFrontendClient(req)) {
    return true;
  }
  
  return false;
}

/**
 * Custom rate limit handler that returns JSON error response
 */
function handleRateLimit(req: Request, res: Response, windowMs: number) {
  const retryAfter = Math.ceil(windowMs / 1000);
  
  if (retryAfterConfig.enabled) {
    res.setHeader('Retry-After', retryAfter.toString());
    
    if (retryAfterConfig.includeTimestamp) {
      const resetTime = new Date(Date.now() + windowMs);
      res.setHeader('X-RateLimit-Reset', resetTime.toISOString());
    }
  }
  
  if (loggingConfig.enabled) {
    console.warn(`[RateLimit] Exceeded for ${req.path} from ${req.ip}`);
  }
  
  res.status(429).json({
    error: 'Too many requests, please try again later.',
    retryAfter,
  });
}

/**
 * Create dynamic rate limiting middleware
 * Fetches configuration from database and applies appropriate limits
 */
export function createDynamicRateLimiter() {
  return async (req: Request, res: Response, next: Function) => {
    try {
      // Check for admin or frontend bypass
      if (shouldBypass(req)) {
        return next();
      }
      
      // Get configuration for this endpoint
      const config = await RateLimitService.getConfigForEndpoint(req.path);
      
      // If no config found or disabled, skip rate limiting
      if (!config || !config.enabled) {
        return next();
      }
      
      // Get effective config (may be modified for agents)
      const effectiveConfig = await getEffectiveRateLimitConfig(req, config);
      
      // Generate rate limit key
      const key = await generateKey(req);
      const storeKey = `${effectiveConfig.endpointPattern}:${key}`;
      const now = Date.now();
      
      // Use Redis if available
      if (redisClient) {
        const redisKey = `ratelimit:${storeKey}`;
        const current = await redisClient.incr(redisKey);
        
        if (current === 1) {
          // First request, set expiry
          await redisClient.pexpire(redisKey, effectiveConfig.windowMs);
        }
        
        if (current > effectiveConfig.maxRequests) {
          const ttl = await redisClient.pttl(redisKey);
          return handleRateLimit(req, res, ttl > 0 ? ttl : effectiveConfig.windowMs);
        }
      } else {
        // Use memory store
        let entry = memoryStore.get(storeKey);
        
        if (!entry || entry.resetTime <= now) {
          entry = { count: 0, resetTime: now + effectiveConfig.windowMs };
          memoryStore.set(storeKey, entry);
        }
        
        entry.count++;
        
        if (entry.count > effectiveConfig.maxRequests) {
          return handleRateLimit(req, res, entry.resetTime - now);
        }
      }
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', effectiveConfig.maxRequests.toString());
      res.setHeader('X-RateLimit-Window', `${effectiveConfig.windowMs}ms`);
      
      // Add info header for agent requests
      const agentParentUserId = await getAgentParentUserId(req);
      if (agentParentUserId) {
        res.setHeader('X-RateLimit-Type', 'agent');
        res.setHeader('X-RateLimit-Parent-User', agentParentUserId.toString());
      }
      
      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Fail closed - deny request when rate limiting fails
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Rate limiting service is currently unavailable. Please try again later.',
      });
    }
  };
}

/**
 * Create a standard rate limiter with fixed configuration
 * Used for specific endpoints that need consistent limits
 */
export function createFixedRateLimiter(
  windowMs: number,
  maxRequests: number,
  _message?: string
) {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: async (req) => {
      const key = await generateKey(req);
      return key;
    },
    handler: (req, res) => {
      handleRateLimit(req, res, windowMs);
    },
    skip: (req) => shouldBypass(req),
  });
}

/**
 * Get Redis client status
 */
export function getRedisStatus(): { connected: boolean; enabled: boolean } {
  return {
    connected: redisClient?.status === 'ready',
    enabled: redisConfig.enabled,
  };
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
