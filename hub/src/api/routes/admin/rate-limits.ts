/**
 * Admin Rate Limit Management API
 * 
 * Provides endpoints for administrators to manage rate limit configurations.
 * All endpoints require admin role authentication.
 */

import { Router } from 'express';
import { RateLimitService } from '../../../domain/services/rate-limit.service.js';
import { requireAdmin } from '../../../infrastructure/http/middleware/auth.js';
import { validateBody, validateParams, getValidatedParams, getValidatedBody } from '../../../infrastructure/http/validation.js';
import { z } from 'zod';
import { asyncHandler, NotFoundError, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';

const router = Router();

router.use(requireAdmin);

// Validation schemas
const createRateLimitConfigSchema = z.object({
  name: z.string().min(1).max(100),
  endpointPattern: z.string().min(1).max(200),
  windowMs: z.number().int().positive(),
  maxRequests: z.number().int().positive(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

const updateRateLimitConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  endpointPattern: z.string().min(1).max(200).optional(),
  windowMs: z.number().int().positive().optional(),
  maxRequests: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

const rateLimitIdParamSchema = z.object({
  id: z.coerce.number().positive(),
});

/**
 * GET /admin/rate-limits
 * List all rate limit configurations
 */
router.get('/', asyncHandler(async (req, res) => {
  const configs = await RateLimitService.getAllConfigs();
  
  res.json({
    configs: configs.map(config => ({
      id: config.id,
      name: config.name,
      endpointPattern: config.endpointPattern,
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      enabled: config.enabled,
      description: config.description,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    })),
  });
}));

/**
 * POST /admin/rate-limits
 * Create new rate limit configuration
 */
router.post('/', validateBody(createRateLimitConfigSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<z.infer<typeof createRateLimitConfigSchema>>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { name, endpointPattern, windowMs, maxRequests, enabled, description } = body;
  
  const config = await RateLimitService.createConfig({
    name,
    endpointPattern,
    windowMs,
    maxRequests,
    enabled: enabled ?? true,
    description,
  });
  
  res.status(201).json({
    config: {
      id: config.id,
      name: config.name,
      endpointPattern: config.endpointPattern,
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      enabled: config.enabled,
      description: config.description,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    },
  });
}));

/**
 * PUT /admin/rate-limits/:id
 * Update existing rate limit configuration
 */
router.put('/:id', validateParams(rateLimitIdParamSchema), validateBody(updateRateLimitConfigSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const id = params.id;
  const body = getValidatedBody<z.infer<typeof updateRateLimitConfigSchema>>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  
  try {
    const config = await RateLimitService.updateConfig(id, body);
    res.json({
      config: {
        id: config.id,
        name: config.name,
        endpointPattern: config.endpointPattern,
        windowMs: config.windowMs,
        maxRequests: config.maxRequests,
        enabled: config.enabled,
        description: config.description,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error.message === 'Rate limit configuration not found') {
      throw new NotFoundError('Rate limit configuration');
    }
    throw error;
  }
}));

/**
 * DELETE /admin/rate-limits/:id
 * Delete rate limit configuration
 */
router.delete('/:id', validateParams(rateLimitIdParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const id = params.id;
  
  try {
    await RateLimitService.deleteConfig(id);
    res.json({ message: 'Rate limit configuration deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Rate limit configuration not found') {
      throw new NotFoundError('Rate limit configuration');
    }
    throw error;
  }
}));

/**
 * POST /admin/rate-limits/:id/toggle
 * Enable or disable rate limit configuration
 */
router.post('/:id/toggle', validateParams(rateLimitIdParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const id = params.id;
  
  try {
    const config = await RateLimitService.toggleConfig(id);
    res.json({
      config: {
        id: config.id,
        name: config.name,
        endpointPattern: config.endpointPattern,
        windowMs: config.windowMs,
        maxRequests: config.maxRequests,
        enabled: config.enabled,
        description: config.description,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
      message: `Rate limit configuration ${config.enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error: any) {
    if (error.message === 'Rate limit configuration not found') {
      throw new NotFoundError('Rate limit configuration');
    }
    throw error;
  }
}));

export default router;
