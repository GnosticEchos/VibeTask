/**
 * Agent Delegations API Routes
 *
 * Implements delegation management endpoints:
 * - POST /api/agents/:agentId/delegations - Delegate agent to project
 * - GET /api/agents/:agentId/delegations - List agent's delegations
 * - PATCH /api/agents/:agentId/delegations/:delegationId - Update delegation
 * - DELETE /api/agents/:agentId/delegations/:delegationId - Revoke delegation
 */

import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/index.js';
import {
  unifiedAuthMiddleware,
  requireUserRole,
  AuthenticatedRequest,
} from '../../../infrastructure/auth/unified-auth.js';
import { AgentPermissionLevel } from '../../../infrastructure/auth/prisma.js';
import {
  validateBody,
  validateParams,
  getValidatedParams,
  getValidatedBody,
} from '../../../infrastructure/http/validation.js';
import { z } from 'zod';
import { ensureAgentReviewColumn } from '../agent/index.js';
import {
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../../infrastructure/http/middleware/error-handler.js';
import { serializeDelegation, type DelegationWithProject } from './delegation-serialize.js';
import {
  assertRestrictedColumnInProject,
  delegationModeSchema,
  resolveLatticeForCreate,
  resolveLatticeForUpdate,
} from './delegation-lattice.js';

const router = Router({ mergeParams: true });

const projectInclude = {
  project: {
    select: {
      id: true,
      name: true,
      prefix: true,
    },
  },
} as const;

// Schemas
const createDelegationSchema = z
  .object({
    projectId: z.number().int().positive(),
    permissionLevel: z.enum(['VIEWER', 'USER']),
    delegationMode: delegationModeSchema.optional(),
    restrictedColumnId: z.number().int().positive().optional(),
    allowedMoveRange: z.number().int().min(0).max(2).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.delegationMode === 'COLUMN_BOUND' && data.restrictedColumnId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'restrictedColumnId is required when delegationMode is COLUMN_BOUND',
        path: ['restrictedColumnId'],
      });
    }
  });

const updateDelegationSchema = z
  .object({
    permissionLevel: z.enum(['VIEWER', 'USER']).optional(),
    delegationMode: delegationModeSchema.optional(),
    restrictedColumnId: z.number().int().positive().optional().nullable(),
    allowedMoveRange: z.number().int().min(0).max(2).optional(),
  })
  .superRefine((data, ctx) => {
  const hasField =
    data.permissionLevel != null ||
    data.delegationMode != null ||
    data.restrictedColumnId !== undefined ||
    data.allowedMoveRange != null;
  if (!hasField) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one delegation field must be provided',
    });
  }
  if (data.delegationMode === 'COLUMN_BOUND' && data.restrictedColumnId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'restrictedColumnId is required when delegationMode is COLUMN_BOUND',
      path: ['restrictedColumnId'],
    });
  }
});

const agentIdParamSchema = z.object({
  agentId: z.coerce.string(),
});

const delegationIdParamSchema = z.object({
  agentId: z.coerce.string(),
  delegationId: z.coerce.string(),
});

async function columnNamesById(delegations: DelegationWithProject[]): Promise<Map<number, string>> {
  const columnIds = [
    ...new Set(
      delegations
        .map((d) => d.restrictedColumnId)
        .filter((id): id is number => id != null),
    ),
  ];
  if (!columnIds.length) return new Map();
  const columns = await prisma.projectColumn.findMany({
    where: { id: { in: columnIds } },
    select: { id: true, name: true },
  });
  return new Map(columns.map((c) => [c.id, c.name]));
}

// POST /api/agents/:agentId/delegations - Delegate agent to project
router.post(
  '/',
  unifiedAuthMiddleware,
  requireUserRole,
  validateParams(agentIdParamSchema),
  validateBody(createDelegationSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const user = auth.user;

    const params = getValidatedParams<{ agentId: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const agentId = params.agentId;
    const body = getValidatedBody<z.infer<typeof createDelegationSchema>>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { projectId, permissionLevel } = body;

    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied to project');
    }

    const existingDelegation = await prisma.agentDelegation.findUnique({
      where: {
        apiKeyId_projectId: {
          apiKeyId: agentId,
          projectId,
        },
      },
    });

    if (existingDelegation) {
      throw new ConflictError('Delegation already exists for this agent and project');
    }

    const firstDelegation = await prisma.agentDelegation.findFirst({
      where: { projectId },
    });

    if (!firstDelegation) {
      await ensureAgentReviewColumn(projectId);
    }

    const lattice = resolveLatticeForCreate(body);
    if (lattice.restrictedColumnId != null) {
      await assertRestrictedColumnInProject(projectId, lattice.restrictedColumnId);
    }

    const delegation = await prisma.agentDelegation.create({
      data: {
        apiKeyId: agentId,
        projectId,
        permissionLevel: permissionLevel as AgentPermissionLevel,
        delegatedById: user.id,
        delegationMode: lattice.delegationMode,
        restrictedColumnId: lattice.restrictedColumnId,
        allowedMoveRange: lattice.allowedMoveRange,
      },
      include: projectInclude,
    });

    res.status(201).json({
      delegation: serializeDelegation(delegation),
    });
  }),
);

// GET /api/agents/:agentId/delegations - List agent's delegations
router.get(
  '/',
  unifiedAuthMiddleware,
  requireUserRole,
  validateParams(agentIdParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ agentId: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const agentId = params.agentId;

    const delegations = await prisma.agentDelegation.findMany({
      where: {
        apiKeyId: agentId,
      },
      include: projectInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const columnNames = await columnNamesById(delegations);
    res.json({
      delegations: delegations.map((d) =>
        serializeDelegation(d, d.restrictedColumnId != null ? columnNames.get(d.restrictedColumnId) : undefined),
      ),
    });
  }),
);

// PATCH /api/agents/:agentId/delegations/:delegationId - Update delegation
router.patch(
  '/:delegationId',
  unifiedAuthMiddleware,
  requireUserRole,
  validateParams(delegationIdParamSchema),
  validateBody(updateDelegationSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const user = auth.user;

    const params = getValidatedParams<{ agentId: string; delegationId: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const agentId = params.agentId;
    const delegationId = params.delegationId;
    const body = getValidatedBody<z.infer<typeof updateDelegationSchema>>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }

    const delegation = await prisma.agentDelegation.findFirst({
      where: {
        id: delegationId,
        apiKeyId: agentId,
      },
      include: projectInclude,
    });

    if (!delegation) {
      throw new NotFoundError('Delegation');
    }

    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId: delegation.projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied');
    }

    const lattice = await resolveLatticeForUpdate(delegation, body, delegation.projectId);

    const updatedDelegation = await prisma.agentDelegation.update({
      where: {
        id: delegationId,
      },
      data: {
        ...(body.permissionLevel != null
          ? { permissionLevel: body.permissionLevel as AgentPermissionLevel }
          : {}),
        delegationMode: lattice.delegationMode,
        restrictedColumnId: lattice.restrictedColumnId,
        allowedMoveRange: lattice.allowedMoveRange,
      },
      include: projectInclude,
    });

    res.json({
      delegation: serializeDelegation(updatedDelegation),
    });
  }),
);

// DELETE /api/agents/:agentId/delegations/:delegationId - Revoke delegation
router.delete(
  '/:delegationId',
  unifiedAuthMiddleware,
  requireUserRole,
  validateParams(delegationIdParamSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const user = auth.user;

    const params = getValidatedParams<{ agentId: string; delegationId: string }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const agentId = params.agentId;
    const delegationId = params.delegationId;

    const delegation = await prisma.agentDelegation.findFirst({
      where: {
        id: delegationId,
        apiKeyId: agentId,
      },
    });

    if (!delegation) {
      throw new NotFoundError('Delegation');
    }

    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId: delegation.projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied');
    }

    const updatedDelegation = await prisma.agentDelegation.update({
      where: {
        id: delegationId,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
      include: projectInclude,
    });

    res.json({
      delegation: serializeDelegation(updatedDelegation),
    });
  }),
);

export default router;
