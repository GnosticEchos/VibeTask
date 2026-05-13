/**
 * Agent Comments API Routes
 *
 * Comment management endpoints for agents.
 */

import { Router } from 'express';
import {
  requireAgentProjectAccess,
  ProjectAction,
} from '../../../infrastructure/auth/agent-permissions.js';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import {
  getValidatedParams,
  getValidatedBody,
  validateParams,
  validateBody,
} from '../../../infrastructure/http/validation.js';
import { projectIdTaskIdParamSchema } from '../../../validation/schemas/common.schemas.js';
import { createCommentSchema } from '../../../validation/schemas/index.js';
import { asyncHandler, NotFoundError, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';

const router = Router({ mergeParams: true });

// POST /api/agent/projects/:projectId/tasks/:taskId/comments
router.post(
  '/',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.ADD_COMMENT),
  validateParams(projectIdTaskIdParamSchema),
  validateBody(createCommentSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { projectId: routeProjectId, taskId } = params;
    const body = getValidatedBody<{ content: string }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { content } = body;
    const auth = (req as any).auth;

    const taskInProject = await prisma.task.findFirst({
      where: { id: taskId, projectId: routeProjectId },
      select: { id: true },
    });
    if (!taskInProject) {
      throw new NotFoundError('Task');
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: auth.user.id,
        content,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ comment });
  })
);

export default router;
