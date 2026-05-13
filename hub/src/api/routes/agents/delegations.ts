/**
 * Agent Delegations API Routes
 * 
 * Implements delegation management endpoints:
 * - POST /api/agents/:agentId/delegations - Delegate agent to project
 * - GET /api/agents/:agentId/delegations - List agent's delegations
 * - PATCH /api/agents/:agentId/delegations/:delegationId - Update permission level
 * - DELETE /api/agents/:agentId/delegations/:delegationId - Revoke delegation
 */

import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/index.js';
import { 
  unifiedAuthMiddleware, 
  requireUserRole,
  AuthenticatedRequest 
} from '../../../infrastructure/auth/unified-auth.js';
import { AgentPermissionLevel } from '../../../infrastructure/auth/prisma.js';
import { 
  validateBody, 
  validateParams,
  getValidatedParams,
  getValidatedBody
} from '../../../infrastructure/http/validation.js';
import { z } from 'zod';
import { ensureAgentReviewColumn } from '../agent/index.js';
import { asyncHandler, NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../../infrastructure/http/middleware/error-handler.js';

const router = Router({ mergeParams: true });

// Schemas
const createDelegationSchema = z.object({
  projectId: z.number().int().positive(),
  permissionLevel: z.enum(['VIEWER', 'USER']),
});

const updateDelegationSchema = z.object({
  permissionLevel: z.enum(['VIEWER', 'USER']),
});

const agentIdParamSchema = z.object({
  agentId: z.coerce.string(),
});

const delegationIdParamSchema = z.object({
  agentId: z.coerce.string(),
  delegationId: z.coerce.string(),
});

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
    const body = getValidatedBody<{ projectId: number; permissionLevel: 'VIEWER' | 'USER' }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { projectId, permissionLevel } = body;

    // Verify user has access to the project
    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied to project');
    }

    // Check if delegation already exists
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

    // Check if this is first agent delegation for this project
    const firstDelegation = await prisma.agentDelegation.findFirst({
      where: { projectId },
    });

    if (!firstDelegation) {
      // First agent - ensure review column exists
      await ensureAgentReviewColumn(projectId);
    }

    // Create delegation
    const delegation = await prisma.agentDelegation.create({
      data: {
        apiKeyId: agentId,
        projectId,
        permissionLevel: permissionLevel as AgentPermissionLevel,
        delegatedById: user.id,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            prefix: true,
          },
        },
      },
    });

    res.status(201).json({
      delegation: {
        id: delegation.id,
        apiKeyId: delegation.apiKeyId,
        projectId: delegation.projectId,
        projectName: delegation.project.name,
        permissionLevel: delegation.permissionLevel,
        isActive: delegation.isActive,
        delegatedById: delegation.delegatedById,
        createdAt: delegation.createdAt.toISOString(),
        updatedAt: delegation.updatedAt.toISOString(),
      },
    });
  })
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

    // Get delegations for this agent with project details
    const delegations = await prisma.agentDelegation.findMany({
      where: {
        apiKeyId: agentId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            prefix: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      delegations: delegations.map((d) => ({
        id: d.id,
        apiKeyId: d.apiKeyId,
        projectId: d.projectId,
        projectName: d.project.name,
        projectPrefix: d.project.prefix,
        permissionLevel: d.permissionLevel,
        isActive: d.isActive,
        revokedAt: d.revokedAt?.toISOString() || null,
        delegatedById: d.delegatedById,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    });
  })
);

// PATCH /api/agents/:agentId/delegations/:delegationId - Update permission level
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
    const body = getValidatedBody<{ permissionLevel: 'VIEWER' | 'USER' }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { permissionLevel } = body;

    // Find the delegation
    const delegation = await prisma.agentDelegation.findFirst({
      where: {
        id: delegationId,
        apiKeyId: agentId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            prefix: true,
          },
        },
      },
    });

    if (!delegation) {
      throw new NotFoundError('Delegation');
    }

    // Check if user has access to the project (must be a member)
    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId: delegation.projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied');
    }

    // Update delegation
    const updatedDelegation = await prisma.agentDelegation.update({
      where: {
        id: delegationId,
      },
      data: {
        permissionLevel: permissionLevel as AgentPermissionLevel,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            prefix: true,
          },
        },
      },
    });

    res.json({
      delegation: {
        id: updatedDelegation.id,
        apiKeyId: updatedDelegation.apiKeyId,
        projectId: updatedDelegation.projectId,
        projectName: updatedDelegation.project.name,
        permissionLevel: updatedDelegation.permissionLevel,
        isActive: updatedDelegation.isActive,
        delegatedById: updatedDelegation.delegatedById,
        createdAt: updatedDelegation.createdAt.toISOString(),
        updatedAt: updatedDelegation.updatedAt.toISOString(),
      },
    });
  })
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

    // Find the delegation
    const delegation = await prisma.agentDelegation.findFirst({
      where: {
        id: delegationId,
        apiKeyId: agentId,
      },
    });

    if (!delegation) {
      throw new NotFoundError('Delegation');
    }

    // Check if user has access to the project (must be a member)
    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId: delegation.projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied');
    }

    // Soft delete - set isActive=false and revokedAt=now
    const updatedDelegation = await prisma.agentDelegation.update({
      where: {
        id: delegationId,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    res.json({
      delegation: {
        id: updatedDelegation.id,
        apiKeyId: updatedDelegation.apiKeyId,
        projectId: updatedDelegation.projectId,
        permissionLevel: updatedDelegation.permissionLevel,
        isActive: updatedDelegation.isActive,
        revokedAt: updatedDelegation.revokedAt?.toISOString(),
        delegatedById: updatedDelegation.delegatedById,
        createdAt: updatedDelegation.createdAt.toISOString(),
        updatedAt: updatedDelegation.updatedAt.toISOString(),
      },
    });
  })
);

export default router;
