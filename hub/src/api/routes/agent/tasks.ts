/**
 * Agent Tasks API Routes
 *
 * Task management endpoints for agents with review column support.
 * DELETE moves tasks to review column instead of hard delete.
 */

import { Router } from 'express';
import {
  requireAgentProjectAccess,
  ProjectAction,
} from '../../../infrastructure/auth/agent-permissions.js';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import { ensureAgentReviewColumn } from './index.js';
import { z } from 'zod';
import {
  getValidatedParams,
  getValidatedBody,
  validateParams,
  validateBody,
} from '../../../infrastructure/http/validation.js';
import {
  projectIdRouteParamSchema,
  projectIdTaskIdParamSchema,
} from '../../../validation/schemas/common.schemas.js';
import { asyncHandler, NotFoundError, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';

const router = Router({ mergeParams: true });

// GET /api/agent/projects/:projectId/tasks - List tasks
router.get(
  '/',
  requireAgentProjectAccess(ProjectAction.VIEW_TASKS),
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const projectId = params.projectId;

    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: { select: { id: true, name: true } },
        column: { select: { id: true, name: true, type: true } },
      },
      orderBy: { order: 'asc' },
    });

    res.json({ tasks });
  })
);

// GET /api/agent/projects/:projectId/tasks/:taskId - Get task
router.get(
  '/:taskId',
  requireAgentProjectAccess(ProjectAction.VIEW_TASKS),
  validateParams(projectIdTaskIdParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }

    const task = await prisma.task.findFirst({
      where: { id: params.taskId, projectId: params.projectId },
      include: {
        assignee: { select: { id: true, name: true } },
        column: { select: { id: true, name: true, type: true } },
        docLinks: {
          include: {
            document: {
              select: { id: true, title: true, docType: true, content: true, version: true }
            }
          }
        },
        children: {
          select: { id: true, name: true, identifier: true, order: true, isContainer: true, planAccepted: true }
        },
        _count: { select: { children: true } }
      },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    res.json({ task });
  })
);

// POST /api/agent/projects/:projectId/tasks - Create task
router.post(
  '/',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.CREATE_TASK),
  validateParams(projectIdRouteParamSchema),
  validateBody(z.object({
    name: z.string().min(1, 'Task name is required').max(200),
    description: z.string().max(5000).optional(),
    columnId: z.number().int().positive().optional(),
    assigneeId: z.number().int().positive().optional(),
    parentId: z.number().int().positive().optional(),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const projectId = params.projectId;
    const body = getValidatedBody<{ name: string; description?: string; columnId?: number; assigneeId?: number; parentId?: number }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { name, description, columnId, assigneeId, parentId } = body;
    const auth = (req as any).auth;

    // Validate parent task if provided
    if (parentId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: parentId },
        select: { id: true, projectId: true },
      });
      if (!parentTask) {
        throw new BadRequestError('Parent task not found');
      }
      if (parentTask.projectId !== projectId) {
        throw new BadRequestError('Parent task must belong to the same project');
      }
    }

    // Generate task identifier
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { prefix: true },
    });

    const taskCount = await prisma.task.count({ where: { projectId } });
    const identifier = `${project?.prefix}-${taskCount + 1}`;

    const task = await prisma.task.create({
      data: {
        name,
        description,
        projectId,
        projectColumnId: columnId,
        assigneeId,
        createdById: auth.user.id,
        identifier,
        order: taskCount,
        parentId: parentId || null,
      },
      include: {
        column: { select: { id: true, name: true, type: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ task });
  })
);

// PATCH /api/agent/projects/:projectId/tasks/:taskId - Update task
router.patch(
  '/:taskId',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.UPDATE_TASK),
  validateParams(projectIdTaskIdParamSchema),
  validateBody(z.object({
    name: z.string().min(1, 'Task name is required').max(200).optional(),
    description: z.string().max(5000).optional().nullable(),
    columnId: z.number().int().positive().optional().nullable(),
    assigneeId: z.number().int().positive().optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { projectId: routeProjectId, taskId } = params;
    const body = getValidatedBody<{ name?: string; description?: string; columnId?: number; assigneeId?: number }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { name, description, columnId, assigneeId } = body;

    const existing = await prisma.task.findFirst({
      where: { id: taskId, projectId: routeProjectId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError('Task');
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { name, description, projectColumnId: columnId, assigneeId },
      include: {
        column: { select: { id: true, name: true, type: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    res.json({ task });
  })
);

// DELETE /api/agent/projects/:projectId/tasks/:taskId - Move to review
router.delete(
  '/:taskId',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.DELETE_TASK),
  validateParams(projectIdTaskIdParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const taskId = params.taskId;
    const projectId = params.projectId;
    const auth = (req as any).auth;

    // Find or create review column
    let reviewColumn = await prisma.projectColumn.findFirst({
      where: { projectId, roleType: 'AGENT_REVIEW' },
    });

    if (!reviewColumn) {
      reviewColumn = await ensureAgentReviewColumn(projectId);
    }

    // Move task to review column
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { projectColumnId: reviewColumn.id },
      include: {
        column: { select: { id: true, name: true, type: true } },
      },
    });

    // Add comment noting agent flagged it
    await prisma.taskComment.create({
      data: {
        taskId,
        userId: auth.user.id,
        content:
          '🤖 Agent flagged this task for review. Reason: Requested deletion/review by agent.',
      },
    });

    res.json({
      success: true,
      message: 'Task moved to Agent Review column',
      task,
    });
  })
);

// POST /api/agent/projects/:projectId/tasks/:taskId/progress - Add progress log
router.post(
  '/:taskId/progress',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.ADD_PROGRESS),
  validateParams(projectIdTaskIdParamSchema),
  validateBody(z.object({
    text: z.string().min(1, 'Progress text is required').max(2000),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { projectId, taskId } = params;
    const body = getValidatedBody<{ text: string }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const auth = (req as any).auth;

    // Verify task exists and belongs to project
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundError('Task');
    }

    // Create progress log entry
    const taskLog = await prisma.taskLog.create({
      data: {
        taskId,
        userId: auth.user.id,
        text: body.text,
      },
    });

    res.status(201).json({ taskLog });
  })
);

export default router;
