/**
 * Agents API Routes
 *
 * Implements agent management endpoints:
 * - POST /api/agents - Create new agent
 * - GET /api/agents - List user's agents
 * - PATCH /api/agents/:id - Update agent
 * - DELETE /api/agents/:id - Delete agent
 * - POST /api/agents/:id/regenerate-key - Rotate API key
 *
 * All endpoints require USER role or higher.
 */

import { Router } from 'express';
import { prisma, auth } from '../../infrastructure/auth/index.js';
import {
  unifiedAuthMiddleware,
  requireUserRole,
  AuthenticatedRequest,
} from '../../infrastructure/auth/index.js';
import { isAgentKeyMetadata, isPlatformAgentMetadata } from '../../infrastructure/auth/agent-key-metadata.js';
import {
  validateBody,
  validateParams,
  getValidatedParams,
  getValidatedBody,
} from '../../infrastructure/http/validation.js';
import { z } from 'zod';
import { asyncHandler, NotFoundError, BadRequestError } from '../../infrastructure/http/middleware/error-handler.js';

const router = Router();

const avatarSlugPattern = /^[a-zA-Z0-9._-]+$/;
const avatarSlugField = z
  .string()
  .max(120)
  .regex(avatarSlugPattern, 'Invalid avatar id')
  .transform((s) => s.replace(/\.svg$/i, ''));

// Schemas
const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  expiresIn: z.number().int().min(60).optional(), // seconds, min 1 minute
  avatarSlug: avatarSlugField.optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  expiresIn: z.number().int().min(60).optional(),
  avatarSlug: z.union([avatarSlugField, z.literal('')]).optional(),
});

const agentIdParamSchema = z.object({
  id: z.coerce.string(),
});

// Apply unified auth middleware to all routes
router.use(unifiedAuthMiddleware);
router.use(requireUserRole); // USER or ADMIN only

// POST /api/agents - Create new agent
router.post('/', validateBody(createAgentSchema), asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.auth.user.id;

  const body = getValidatedBody<{
    name: string;
    description?: string;
    expiresIn?: number;
    avatarSlug?: string;
  }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { name, description, expiresIn, avatarSlug } = body;

  const baseMeta = {
    isAgent: true,
    description: description || null,
    createdBy: userId,
    ...(avatarSlug ? { avatarSlug } : {}),
  };

  // Create API key using Better Auth's apiKey plugin
  const result = await auth.api.createApiKey({
    body: {
      name,
      prefix: 'ag',
      expiresIn: expiresIn || 60 * 60 * 24 * 365, // Default 1 year
      metadata: baseMeta,
    },
    headers: req.headers,
  });

  const metadataToStore = { ...baseMeta };
  await prisma.apikey.update({
    where: { id: result.id },
    data: { metadata: metadataToStore },
  });

  // Create audit log entry for agent creation
  await prisma.agentLifecycleAuditLog.create({
    data: {
      apiKeyId: result.id,
      action: 'AGENT_CREATED',
      performedBy: userId,
      metadata: {
        name: result.name,
        description: description || null,
        avatarSlug: avatarSlug || null,
        expiresAt: result.expiresAt?.toISOString() || null,
      },
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    },
  });

  res.status(201).json({
    agent: {
      id: result.id,
      name: result.name,
      prefix: result.prefix,
      expiresAt: result.expiresAt?.toISOString() || null,
      metadata: metadataToStore,
      createdAt: result.createdAt?.toISOString(),
    },
    apiKey: result.key, // ONLY SHOWN ONCE
  });
}));

// GET /api/agents - List user's agents
router.get('/', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.auth.user.id;
  // DB stores referenceId as string; session id can be number — align to avoid empty list from auth.api.listApiKeys
  const referenceId = String(userId);

  const limitRaw = req.query.limit;
  const parsedLimit = Number(limitRaw);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(500, Math.max(1, Math.round(parsedLimit)))
    : 200;

  const keys = await prisma.apikey.findMany({
    where: { referenceId },
    orderBy: { createdAt: 'desc' },
  });

  const agentRows = keys.filter((key) => isAgentKeyMetadata(key.metadata) && !isPlatformAgentMetadata(key.metadata));
  const total = agentRows.length;
  const activeTotal = agentRows.filter((key) => key.enabled !== false).length;
  const pageRows = agentRows.slice(0, limit);

  const agents = pageRows.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    isActive: key.enabled !== false,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    metadata: key.metadata,
  }));

  res.json({ agents, total, activeTotal, limit });
}));

// PATCH /api/agents/:id - Update agent
router.patch(
  '/:id',
  validateParams(agentIdParamSchema),
  validateBody(updateAgentSchema),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.auth.user.id);
    const params = getValidatedParams<{ id: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const id = params.id;
    const body = getValidatedBody<{
      name?: string;
      description?: string;
      isActive?: boolean;
      expiresIn?: number;
      avatarSlug?: string | '';
    }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { name, description, isActive, expiresIn, avatarSlug } = body;

    // Check if agent exists and belongs to user
    const existingKey = await prisma.apikey.findFirst({
      where: {
        id,
        referenceId: userId,
      },
    });

    if (!existingKey) {
      throw new NotFoundError('Agent');
    }
    if (isPlatformAgentMetadata(existingKey.metadata)) {
      throw new BadRequestError('Platform agents must be managed via admin routes');
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.enabled = isActive;
    if (expiresIn !== undefined) {
      updateData.expiresAt = new Date(Date.now() + expiresIn * 1000);
    }
    if (description !== undefined || avatarSlug !== undefined) {
      const prev = ((existingKey.metadata as Record<string, unknown>) || {}) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...prev };
      if (description !== undefined) {
        next.description = description || null;
      }
      if (avatarSlug !== undefined) {
        if (avatarSlug === '') {
          delete next.avatarSlug;
        } else {
          next.avatarSlug = avatarSlug;
        }
      }
      updateData.metadata = next;
    }

    // Update directly in database
    const updatedKey = await prisma.apikey.update({
      where: { id },
      data: updateData,
    });

    res.json({
      agent: {
        id: updatedKey.id,
        name: updatedKey.name,
        prefix: updatedKey.prefix,
        isActive: updatedKey.enabled,
        expiresAt: updatedKey.expiresAt?.toISOString() || null,
        metadata: updatedKey.metadata,
        updatedAt: updatedKey.updatedAt.toISOString(),
      },
    });
  })
);

// DELETE /api/agents/:id - Delete agent
router.delete(
  '/:id',
  validateParams(agentIdParamSchema),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.auth.user.id);
    const params = getValidatedParams<{ id: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const id = params.id;

    // Check if agent exists and belongs to user
    const existingKey = await prisma.apikey.findFirst({
      where: {
        id,
        referenceId: userId,
      },
    });

    if (!existingKey) {
      throw new NotFoundError('Agent');
    }
    if (isPlatformAgentMetadata(existingKey.metadata)) {
      throw new BadRequestError('Platform agents must be managed via admin routes');
    }

    // Delete all related delegations first
    await prisma.agentDelegation.deleteMany({
      where: { apiKeyId: id },
    });

    // Delete all related lifecycle audit logs
    await prisma.agentLifecycleAuditLog.deleteMany({
      where: { apiKeyId: id },
    });

    // Delete the API key directly from database
    await prisma.apikey.delete({
      where: { id },
    });

    res.status(204).send();
  })
);

// POST /api/agents/:id/regenerate-key - Rotate API key
router.post(
  '/:id/regenerate-key',
  validateParams(agentIdParamSchema),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = String(authReq.auth.user.id); // Convert to string for referenceId comparison
    const params = getValidatedParams<{ id: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const id = params.id;

    // Get existing key directly from database to avoid caching issues
    const existingKey = await prisma.apikey.findFirst({
      where: {
        id,
        referenceId: userId,
      },
    });

    if (!existingKey) {
      throw new NotFoundError('Agent');
    }
    if (isPlatformAgentMetadata(existingKey.metadata)) {
      throw new BadRequestError('Platform agents must be managed via admin routes');
    }

    // Preserve the existing metadata
    const existingMetadata = existingKey.metadata && typeof existingKey.metadata === 'object' 
      ? existingKey.metadata as any 
      : { isAgent: true };

    // Create new key with same settings using Better Auth FIRST (atomicity: don't delete old key until new one exists)
    const newKeyResult = await auth.api.createApiKey({
      body: {
        name: existingKey.name || undefined,
        prefix: 'ag',
        expiresIn: existingKey.expiresAt
          ? Math.floor(
              (new Date(existingKey.expiresAt).getTime() - Date.now()) / 1000
            )
          : 60 * 60 * 24 * 365,
        metadata: existingMetadata,
      },
      headers: req.headers,
    });

    // Update delegations to point to new key
    await prisma.agentDelegation.updateMany({
      where: { apiKeyId: id },
      data: { apiKeyId: newKeyResult.id },
    });

    // Delete old key (safe now because new key exists)
    await prisma.apikey.delete({
      where: { id },
    });

    // Better Auth may not store metadata correctly, so update it directly
    await prisma.apikey.update({
      where: { id: newKeyResult.id },
      data: { metadata: existingMetadata },
    });

    // Query the new key from database to get the actual stored metadata
    const newKeyFromDb = await prisma.apikey.findUnique({
      where: { id: newKeyResult.id },
    });

    res.json({
      agent: {
        id: newKeyResult.id,
        name: newKeyResult.name,
        prefix: newKeyResult.prefix,
        expiresAt: newKeyResult.expiresAt?.toISOString() || null,
        metadata: newKeyFromDb?.metadata || existingMetadata,
        createdAt: newKeyResult.createdAt?.toISOString(),
      },
      apiKey: newKeyResult.key, // ONLY SHOWN ONCE
    });
  })
);

export default router;
