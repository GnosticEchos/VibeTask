/**
 * Tasks API Routes
 * 
 * Implements the tasks endpoints from the API contract:
 * - GET /api/tasks?projectId - Get tasks for a project
 * - GET /api/tasks (no params) - Get all tasks user has access to (My Tasks)
 * - GET /api/tasks/:id - Get single task details
 * - POST /api/tasks - Create a new task
 * - PATCH /api/tasks/:id - Update a task
 * - POST /api/tasks/:id/move - Move task to different column/position
 * - POST /api/tasks/:id/comments - Add comment to task
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { readDefaultWorkspaceOutlineColor } from '../../services/workspace-outline-color.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { 
  validateBody, 
  validateParams, 
  validateQuery, 
  validateParamsAndBody,
  getValidatedParams,
  getValidatedBody,
  getValidatedQuery
} from '../../infrastructure/http/validation.js';
import {
  createTaskSchema,
  patchTaskSchema,
  moveTaskSchema,
  createCommentSchema,
  taskIdParamSchema,
  taskQuerySchema
} from '../../validation/schemas/index.js';
import {
  asyncHandler,
  ForbiddenError,
  NotFoundError,
  BadRequestError
} from '../../infrastructure/http/middleware/error-handler.js';
import { sanitize } from '../../infrastructure/http/middleware/sanitize.js';
import { transformTask, transformTasks } from '../../shared/transformers/index.js';
import { paginatedResponse } from '../../validation/schemas/common.schemas.js';
import { assertMoveAllowedWhenBlocked } from '../../services/task-relation-policy.js';

const router = Router();

// Helper to generate task identifier
async function generateTaskIdentifier(projectId: number): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return 'TASK-1';
  
  const taskCount = await prisma.task.count({ where: { projectId } });
  return `${project.prefix}-${taskCount + 1}`;
}

// GET /api/tasks?projectId - Get tasks for a project
// GET /api/tasks (no params) - Get all tasks user has access to (My Tasks)
router.get('/', requireAuth, validateQuery(taskQuerySchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const query = getValidatedQuery<{ projectId?: number; unassigned?: string; assigneeIds?: string; query?: string; archived?: string; noColumn?: string; page: number; limit: number }>(req);
  
  const projectId = query?.projectId;
  const unassigned = query?.unassigned;
  const assigneeIdsStr = query?.assigneeIds;
  const searchQuery = query?.query;
  const archived = query?.archived;
  const noColumn = query?.noColumn;
  
  // Parse pagination params from query (always use pagination)
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  // Parse assigneeIds to numbers if provided
  const assigneeIds = assigneeIdsStr 
    ? assigneeIdsStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
    : undefined;

  // If projectId is provided, get tasks for that project
  if (projectId && !isNaN(projectId)) {
    // Check membership
    const membership = await prisma.projectUser.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied');
    }

    const where: any = { projectId };

    if (archived === 'true') {
      where.archivedAt = { not: null };
    } else if (archived === 'false') {
      where.archivedAt = null;
    }

    if (noColumn === 'true') {
      where.projectColumnId = null;
    }

    if (unassigned === 'true') {
      where.assigneeId = null;
    }

    if (assigneeIds) {
      where.assigneeId = { in: assigneeIds };
    }

    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true, surname: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, surname: true, avatarUrl: true } },
          project: { select: { id: true, name: true, prefix: true } },
          _count: { select: { children: true } },
        },
        orderBy: { order: 'asc' },
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    return res.json(paginatedResponse(transformTasks(tasks), page, limit, total));
  }

  // No projectId - get all tasks the user has access to (My Tasks)
  // Get all projects the user is a member of
  const memberships = await prisma.projectUser.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });

  if (memberships.length === 0) {
    return res.json(paginatedResponse([], page, limit, 0));
  }

  const projectIds = memberships.map(m => m.projectId);

  const where: any = {
    projectId: { in: projectIds },
  };

  // Filter for tasks assigned to this user or created by this user
  if (unassigned === 'true') {
    where.assigneeId = null;
  } else {
    // Default: show tasks assigned to or created by the user
    where.OR = [
      { assigneeId: user.id },
      { createdById: user.id },
    ];
  }

  if (assigneeIds) {
    where.assigneeId = { in: assigneeIds };
  }

  if (searchQuery) {
    where.OR = [
      ...(where.OR || []),
      { name: { contains: searchQuery, mode: 'insensitive' } },
      { description: { contains: searchQuery, mode: 'insensitive' } },
    ];
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
        include: {
          createdBy: { select: { id: true, name: true, surname: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, surname: true, avatarUrl: true } },
          project: { select: { id: true, name: true, prefix: true } },
          _count: { select: { children: true } },
        },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  res.json(paginatedResponse(transformTasks(tasks), page, limit, total));
}));

// GET /api/tasks/:id - Get single task details
router.get('/:id', requireAuth, validateParams(taskIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const taskId = params.id;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      createdBy: { select: { id: true, name: true, surname: true, avatarUrl: true } },
      assignee: { select: { id: true, name: true, surname: true, avatarUrl: true } },
      comments: {
        include: { user: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
      },
      taskLogs: {
        orderBy: { createdAt: 'desc' },
      },
      docLinks: {
        include: {
          document: {
            select: { id: true, title: true, docType: true, version: true },
          },
        },
      },
      children: {
        select: {
          id: true,
          name: true,
          identifier: true,
          order: true,
          isContainer: true,
          planAccepted: true,
          parentId: true,
          projectColumnId: true,
        },
        orderBy: { order: 'asc' },
      },
      _count: { select: { children: true } },
    },
  });

  if (!task) {
    throw new NotFoundError('Task');
  }

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: {
      projectId: task.projectId,
      userId: user.id,
    },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  // Use transformer for base task data, then add comments/history manually
  const transformedTask = transformTask(task);

  res.json({
    ...transformedTask,
    comments: task.comments.map(c => ({
      id: c.id,
      content: c.content,
      userId: c.userId,
      createdAt: c.createdAt.toISOString(),
    })),
    history: task.taskLogs.map(l => ({
      id: l.id,
      text: l.text,
      userId: l.userId,
      createdAt: l.createdAt.toISOString(),
    })),
    docLinks: task.docLinks.map(link => ({
      id: link.id,
      taskId: link.taskId,
      documentId: link.documentId,
      role: link.role,
      pinnedVersion: link.pinnedVersion,
      createdAt: link.createdAt.toISOString(),
      document: link.document,
    })),
    children: task.children.map(c => ({
      id: c.id,
      name: c.name,
      identifier: c.identifier,
      order: c.order,
      isContainer: c.isContainer,
      planAccepted: c.planAccepted,
      parentId: c.parentId,
      projectColumnId: c.projectColumnId,
    })),
  });
}));

// POST /api/tasks - Create a new task
router.post('/', requireAuth, validateBody(createTaskSchema), sanitize(['name', 'description']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const body = getValidatedBody<{ projectId: number; name: string; description?: string; assigneeId?: number; projectColumnId?: number; relationMode?: string; relationId?: number; parentId?: number; isContainer?: boolean; subBoardOutlineColor?: string | null }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { projectId, name, description, assigneeId, projectColumnId, relationMode, relationId, parentId, isContainer, subBoardOutlineColor } = body;

  if (parentId != null && isContainer === true) {
    throw new BadRequestError('Child tasks cannot be marked as workspace containers');
  }

  const { assertDraftAllowsTaskCreate } = await import('../../services/project-lifecycle.js');
  await assertDraftAllowsTaskCreate(projectId, projectColumnId);
  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

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

  // Get max order for the column
  const maxOrder = await prisma.task.aggregate({
    where: { projectColumnId: projectColumnId || undefined },
    _max: { order: true },
  });

  const identifier = await generateTaskIdentifier(projectId);

  let resolvedOutlineColor = subBoardOutlineColor ?? null;
  if (resolvedOutlineColor == null && isContainer === true) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    resolvedOutlineColor = readDefaultWorkspaceOutlineColor(project?.settings) ?? null;
  }

  const task = await prisma.task.create({
    data: {
      name,
      description,
      projectId,
      projectColumnId: projectColumnId || null,
      assigneeId: assigneeId || null,
      createdById: user.id,
      order: (maxOrder._max.order || 0) + 1,
      identifier,
      relationMode: relationMode || null,
      relationId: relationId || null,
      parentId: parentId || null,
      isContainer: isContainer === true,
      subBoardOutlineColor: resolvedOutlineColor,
    },
        include: {
          createdBy: { select: { id: true, name: true, surname: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, surname: true, avatarUrl: true } },
          project: { select: { id: true, name: true, prefix: true } },
          _count: { select: { children: true } },
        },
  });

  res.status(201).json(transformTask(task));
}));

// PATCH /api/tasks/:id - Update a task
router.patch('/:id', requireAuth, validateParamsAndBody(taskIdParamSchema, patchTaskSchema), sanitize(['name', 'description']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const taskId = params.id;
  const body = getValidatedBody<{ name?: string; description?: string; assigneeId?: number; assigneeApiKeyId?: string; projectColumnId?: number; relationMode?: string; relationId?: number; isContainer?: boolean; planAccepted?: boolean; subBoardOutlineColor?: string; parentId?: number; archived?: boolean }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { name, description, assigneeId, assigneeApiKeyId, projectColumnId, relationMode, relationId, isContainer, planAccepted, subBoardOutlineColor, parentId, archived } = body;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }

  // Check membership — Editor+ required for task updates
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Enforce one-tier sub-board constraint: child tasks cannot become containers
  if (parentId != null && isContainer === true) {
    throw new ForbiddenError('Child tasks cannot be expanded into sub-boards');
  }

  // Convert 0/null/undefined to null for projectColumnId (no column)
  const normalizedProjectColumnId = projectColumnId === 0 || projectColumnId === null || projectColumnId === undefined ? null : projectColumnId;

  // Determine if this is a material edit that should clear monitor pass
  const isMaterialEdit =
    name !== undefined ||
    description !== undefined;

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (assigneeId !== undefined) {
      updateData.assignee = assigneeId ? { connect: { id: assigneeId } } : { disconnect: true };
    }
    if (assigneeApiKeyId !== undefined) updateData.assigneeApiKeyId = assigneeApiKeyId || null;
    if (projectColumnId !== undefined) {
      updateData.column = normalizedProjectColumnId ? { connect: { id: normalizedProjectColumnId } } : { disconnect: true };
    }
    if (relationMode !== undefined) updateData.relationMode = relationMode;
    if (relationId !== undefined) {
      updateData.relatedTo = relationId ? { connect: { id: relationId } } : { disconnect: true };
    }
    if (isContainer !== undefined) updateData.isContainer = isContainer;
    if (planAccepted !== undefined) updateData.planAccepted = planAccepted;
    if (subBoardOutlineColor !== undefined) updateData.subBoardOutlineColor = subBoardOutlineColor;
    if (parentId !== undefined) {
      updateData.parent = parentId ? { connect: { id: parentId } } : { disconnect: true };
    }
    if (archived === true) {
      updateData.archivedAt = new Date();
    } else if (archived === false) {
      updateData.archivedAt = null;
    }
    if (projectColumnId !== undefined && normalizedProjectColumnId !== null && archived === undefined) {
      updateData.archivedAt = null;
    }

    const updated = await (tx.task.update as any)({
      where: { id: taskId },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, surname: true, avatarUrl: true } },
        assignee: { select: { id: true, name: true, surname: true, avatarUrl: true } },
        _count: { select: { children: true } },
      },
    });

    // Clear monitor pass for current column on material edits
    if (isMaterialEdit && task.projectColumnId) {
      await tx.taskMonitorPass.deleteMany({
        where: { taskId, columnId: task.projectColumnId },
      });
    }

    return updated;
  });

  res.json(transformTask(updatedTask));
}));

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', requireAuth, validateParams(taskIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const taskId = params.id;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }

  // Check membership — Editor+ required for task deletion
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Delete task and related data (cascading deletes handle children, comments, etc.)
  await prisma.task.delete({ where: { id: taskId } });

  res.status(204).send();
}));

// POST /api/tasks/:id/move - Move task to different column/position
router.post('/:id/move', requireAuth, validateParamsAndBody(taskIdParamSchema, moveTaskSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const taskId = params.id;
  const body = getValidatedBody<{ targetColumnId: number; targetIndex: number }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { targetColumnId, targetIndex } = body;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }

  // Check membership — Editor+ required for task updates
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Column protection enforcement
  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
    select: { settings: true },
  });

  const settings = (project?.settings as Record<string, unknown> | null) || {};
  const columnProtection = (settings.columnProtection as Record<string, { enter?: string; exit?: string }> | undefined) || {};

  // Check exit policy on source column
  const sourceColumnKey = String(task.projectColumnId);
  const sourcePolicy = columnProtection[sourceColumnKey];
  if (sourcePolicy?.exit) {
    const roleHierarchy: Record<string, number> = { Owner: 4, Maintainer: 3, Editor: 2, Viewer: 1 };
    const userLevel = roleHierarchy[membership.role] ?? 0;
    const requiredLevel = roleHierarchy[sourcePolicy.exit] ?? 0;
    if (userLevel < requiredLevel) {
      throw new ForbiddenError(`Cannot move task out of this column — ${sourcePolicy.exit} role or higher required`);
    }
  }

  // Check enter policy on target column
  const targetPolicy = columnProtection[String(targetColumnId)];
  if (targetPolicy?.enter) {
    const roleHierarchy: Record<string, number> = { Owner: 4, Maintainer: 3, Editor: 2, Viewer: 1 };
    const userLevel = roleHierarchy[membership.role] ?? 0;
    const requiredLevel = roleHierarchy[targetPolicy.enter] ?? 0;
    if (userLevel < requiredLevel) {
      throw new ForbiddenError(`Cannot move task into this column — ${targetPolicy.enter} role or higher required`);
    }
  }

  await assertMoveAllowedWhenBlocked(task, targetColumnId);

  // Wrap all database operations in a transaction
  await prisma.$transaction(async (tx) => {
    // Clear monitor pass for source column (re-entry rule: leaving clears pass)
    if (task.projectColumnId) {
      await tx.taskMonitorPass.deleteMany({
        where: { taskId, columnId: task.projectColumnId },
      });
    }

    // Update task's column
    await tx.task.update({
      where: { id: taskId },
      data: {
        projectColumnId: targetColumnId,
        order: targetIndex,
      },
    });

    // Reorder other tasks in the target column
    const tasksInColumn = await tx.task.findMany({
      where: {
        projectColumnId: targetColumnId,
        id: { not: taskId },
      },
      orderBy: { order: 'asc' },
    });

    for (let i = 0; i < tasksInColumn.length; i++) {
      const t = tasksInColumn[i];
      const newOrder = i >= targetIndex ? i + 1 : i;
      if (t.order !== newOrder) {
        await tx.task.update({
          where: { id: t.id },
          data: { order: newOrder },
        });
      }
    }
  });

  res.status(200).json({});
}));

// POST /api/tasks/:id/comments - Add comment to task
router.post('/:id/comments', requireAuth, validateParamsAndBody(taskIdParamSchema, createCommentSchema), sanitize(['content']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const taskId = params.id;
  const body = getValidatedBody<{ content: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { content } = body;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      userId: user.id,
      content,
    },
  });

  res.status(200).json(comment);
}));

// PATCH /api/tasks/comment/:id - Add comment to task (frontend uses this path)
router.patch('/comment/:id', requireAuth, validateParamsAndBody(taskIdParamSchema, createCommentSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const taskId = params.id;
  const body = getValidatedBody<{ content: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { content } = body;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      userId: user.id,
      content,
    },
  });

  res.status(200).json(comment);
}));

export default router;