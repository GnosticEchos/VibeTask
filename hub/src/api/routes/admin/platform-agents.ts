import { Router } from 'express';
import { z } from 'zod';
import { auth, prisma } from '../../../infrastructure/auth/index.js';
import { requireAdmin } from '../../../infrastructure/http/middleware/auth.js';
import { validateBody, validateParams, getValidatedBody, getValidatedParams } from '../../../infrastructure/http/validation.js';
import { asyncHandler, BadRequestError, NotFoundError } from '../../../infrastructure/http/middleware/error-handler.js';
import { getAllowedReadEndpoints, isAgentKeyMetadata, isPlatformAgentMetadata, parseAgentKeyMetadata } from '../../../infrastructure/auth/agent-key-metadata.js';

const router = Router();

const PLATFORM_AGENT_ENDPOINT_CATALOG = [
  { path: '/api/agent/projects', label: 'List delegated projects' },
  { path: '/api/agent/projects/:projectId/tasks', label: 'List tasks in delegated project' },
  { path: '/api/agent/projects/:projectId/tasks/:taskId', label: 'Get task in delegated project' },
] as const;

const SESSION_EXPIRY_OPTIONS = [3600, 21600, 43200, 86400, 604800] as const;

const platformAgentIdSchema = z.object({
  id: z.string().min(1),
});

const upsertPlatformAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  expiresIn: z.number().int().min(60).optional(),
  allowedReadEndpoints: z.array(z.enum(PLATFORM_AGENT_ENDPOINT_CATALOG.map((e) => e.path) as [string, ...string[]])).optional(),
  targetUserId: z.number().int().positive().optional(),
  sessionExpirySeconds: z.number().int().refine((v) => (SESSION_EXPIRY_OPTIONS as readonly number[]).includes(v), { message: 'Must be 3600, 21600, 43200, 86400, or 604800' }).optional(),
});

const createPlatformAgentSchema = upsertPlatformAgentSchema.extend({
  name: z.string().min(1).max(100),
  targetUserId: z.number().int().positive(),
});

function toPlatformAgentResponse(key: {
  id: string;
  name: string | null;
  enabled: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  referenceId: string | null;
  metadata: unknown;
  targetUser?: { id: number; name: string | null; email: string } | null;
}) {
  const metadata = parseAgentKeyMetadata(key.metadata);
  return {
    id: key.id,
    name: key.name || 'Platform Agent',
    isActive: key.enabled !== false,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    targetUser: key.targetUser ?? null,
    sessionExpirySeconds: (metadata?.sessionExpirySeconds as number) ?? 86400,
    metadata: parseAgentKeyMetadata(key.metadata) ?? undefined,
  };
}

const PLATFORM_AGENT_SELECT = {
  id: true,
  name: true,
  enabled: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
  referenceId: true,
  metadata: true,
} as const;

router.use(requireAdmin);

router.get('/endpoint-catalog', (req, res) => {
  res.json({ endpoints: PLATFORM_AGENT_ENDPOINT_CATALOG });
});

router.get('/', asyncHandler(async (req, res) => {
  const keys = await prisma.apikey.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const platformKeys = keys.filter((key) => isAgentKeyMetadata(key.metadata) && isPlatformAgentMetadata(key.metadata));

  const userIds = platformKeys
    .map((k) => k.referenceId ? parseInt(k.referenceId, 10) : null)
    .filter((id): id is number => id !== null && !isNaN(id));

  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  res.json({
    agents: platformKeys.map((key) => toPlatformAgentResponse({
      ...key,
      referenceId: key.referenceId,
      targetUser: key.referenceId ? userMap.get(parseInt(key.referenceId, 10)) ?? null : null,
    })),
    total: platformKeys.length,
    activeTotal: platformKeys.filter((key) => key.enabled !== false).length,
  });
}));

router.post('/', validateBody(createPlatformAgentSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<{ name: string; description?: string; expiresIn?: number; allowedReadEndpoints?: string[]; targetUserId: number; sessionExpirySeconds?: number }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }

  const referenceId = String(body.targetUserId);

  const metadata = {
    isAgent: true,
    isPlatformAgent: true,
    description: body.description || null,
    allowedReadEndpoints: body.allowedReadEndpoints || [],
    sessionExpirySeconds: body.sessionExpirySeconds ?? 86400,
  };

  const result = await auth.api.createApiKey({
    body: {
      name: body.name,
      prefix: 'ag',
      expiresIn: body.expiresIn || 60 * 60 * 24 * 365,
      metadata,
    },
    headers: req.headers,
  });

  await prisma.apikey.update({
    where: { id: result.id },
    data: { metadata: metadata as any, referenceId },
  });

  const updated = await prisma.apikey.findUnique({
    where: { id: result.id },
    select: PLATFORM_AGENT_SELECT,
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: body.targetUserId },
    select: { id: true, name: true, email: true },
  });

  res.status(201).json({
    agent: toPlatformAgentResponse({ ...updated!, targetUser } as any),
    apiKey: result.key,
  });

  res.status(201).json({
    agent: toPlatformAgentResponse({ ...updated!, targetUser }),
    apiKey: result.key,
  });

  res.status(201).json({
    agent: toPlatformAgentResponse({ ...updated!, targetUser }),
    apiKey: result.key,
  });
}));

router.patch('/:id', validateParams(platformAgentIdSchema), validateBody(upsertPlatformAgentSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: string }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const body = getValidatedBody<{ name?: string; description?: string; isActive?: boolean; expiresIn?: number; allowedReadEndpoints?: string[]; targetUserId?: number; sessionExpirySeconds?: number }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }

  const existing = await prisma.apikey.findUnique({ where: { id: params.id } });
  if (!existing || !isAgentKeyMetadata(existing.metadata) || !isPlatformAgentMetadata(existing.metadata)) {
    throw new NotFoundError('Platform agent');
  }

  const nextMetadata = { ...(parseAgentKeyMetadata(existing.metadata) || {}) };
  if (body.description !== undefined) nextMetadata.description = body.description || null;
  if (body.allowedReadEndpoints !== undefined) nextMetadata.allowedReadEndpoints = body.allowedReadEndpoints;
  if (body.sessionExpirySeconds !== undefined) nextMetadata.sessionExpirySeconds = body.sessionExpirySeconds;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isActive !== undefined) updateData.enabled = body.isActive;
  if (body.expiresIn !== undefined) updateData.expiresAt = new Date(Date.now() + body.expiresIn * 1000);
  if (body.targetUserId !== undefined) updateData.referenceId = String(body.targetUserId);
  updateData.metadata = nextMetadata;

  const updated = await prisma.apikey.update({
    where: { id: params.id },
    data: updateData,
    select: PLATFORM_AGENT_SELECT,
  });

  const targetUserId = body.targetUserId ?? (updated.referenceId ? parseInt(updated.referenceId, 10) : null);
  const targetUser = targetUserId
    ? await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, email: true },
      })
    : null;

  res.json({ agent: toPlatformAgentResponse({ ...updated, targetUser }) });
}));

router.post('/:id/regenerate-key', validateParams(platformAgentIdSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: string }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }

  const existing = await prisma.apikey.findUnique({ where: { id: params.id } });
  if (!existing || !isAgentKeyMetadata(existing.metadata) || !isPlatformAgentMetadata(existing.metadata)) {
    throw new NotFoundError('Platform agent');
  }

  const metadata = parseAgentKeyMetadata(existing.metadata) || {
    isAgent: true,
    isPlatformAgent: true,
    allowedReadEndpoints: getAllowedReadEndpoints(existing.metadata),
    sessionExpirySeconds: 86400,
  };

  const result = await auth.api.createApiKey({
    body: {
      name: existing.name || undefined,
      prefix: 'ag',
      expiresIn: existing.expiresAt ? Math.max(60, Math.floor((existing.expiresAt.getTime() - Date.now()) / 1000)) : 60 * 60 * 24 * 365,
      metadata,
    },
    headers: req.headers,
  });

  await prisma.apikey.delete({ where: { id: existing.id } });

  await prisma.apikey.update({
    where: { id: result.id },
    data: { metadata: metadata as any, referenceId: existing.referenceId },
  });

  const updated = await prisma.apikey.findUnique({
    where: { id: result.id },
    select: PLATFORM_AGENT_SELECT,
  });

  res.json({
    agent: toPlatformAgentResponse(updated as any),
    apiKey: result.key,
  });
}));

router.delete('/:id', validateParams(platformAgentIdSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: string }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }

  const existing = await prisma.apikey.findUnique({ where: { id: params.id } });
  if (!existing || !isAgentKeyMetadata(existing.metadata) || !isPlatformAgentMetadata(existing.metadata)) {
    throw new NotFoundError('Platform agent');
  }

  await prisma.apikey.delete({ where: { id: params.id } });
  res.status(204).send();
}));

export default router;
