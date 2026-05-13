/**
 * Agent Help Request Routes
 *
 * Endpoints for agents to request human assistance.
 */

import { Router } from 'express';
import { z } from 'zod';
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
import {
  projectIdRouteParamSchema,
} from '../../../validation/schemas/common.schemas.js';
import { asyncHandler, NotFoundError, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';

const router = Router({ mergeParams: true });

// POST /api/agent/projects/:projectId/help-requests - Create help request
router.post(
  '/',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.VIEW_DOCS),
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const projectId = params.projectId;
    const raw = req.body || {};
    const auth = (req as any).auth;

    // Accept both VibeTools (snake_case) and backend (camelCase) naming conventions
    const taskIdVal = raw.taskId ?? raw.task_id;
    const helpTypeVal = raw.helpType ?? raw.help_type;
    const descriptionVal = raw.helpDescription ?? raw.help_description ?? raw.description;
    const priorityVal = raw.priority;
    const contextVal = raw.context;

    if (!taskIdVal || !helpTypeVal || !descriptionVal) {
      throw new BadRequestError('taskId, helpType/help_type, and helpDescription/description are required');
    }

    const validTypes = ['TECHNICAL', 'CLARIFICATION', 'REVIEW', 'BLOCKED', 'COLLABORATION'];
    if (!validTypes.includes(helpTypeVal)) {
      throw new BadRequestError(`Invalid helpType '${helpTypeVal}'. Valid: ${validTypes.join(', ')}`);
    }

    // Parse task ID (supports compound "projectId-taskId" format or plain number)
    const taskId = typeof taskIdVal === 'string' && String(taskIdVal).includes('-')
      ? parseInt(String(taskIdVal).split('-').pop()!, 10)
      : typeof taskIdVal === 'number' ? taskIdVal : parseInt(String(taskIdVal), 10);

    if (isNaN(taskId)) {
      throw new BadRequestError('Invalid taskId');
    }

    // Verify task exists and belongs to project
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true, name: true, identifier: true },
    });
    if (!task) {
      throw new NotFoundError('Task');
    }

    // Create help request as a comment on the task for visibility
    const helpContent = [
      `🆘 **Help Request (${helpTypeVal})**`,
      priorityVal ? `**Priority:** ${priorityVal}` : '',
      '',
      descriptionVal,
      contextVal ? `\n**Context:**\n${contextVal}` : '',
      '',
      `---\n_Requested by agent at ${new Date().toISOString()}_`,
    ].filter(Boolean).join('\n');

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: auth.user.id,
        content: helpContent,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ helpRequest: comment });
  })
);

export default router;
