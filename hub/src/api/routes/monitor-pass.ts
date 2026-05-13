/**
 * Monitor Pass Routes
 *
 * Endpoints for column monitors to pass/reject tasks:
 * - POST /api/tasks/:id/monitor-pass/:columnId     Record pass
 * - POST /api/tasks/:id/monitor-reject/:columnId   Reject back to previous column
 * - DELETE /api/tasks/:id/monitor-pass/:columnId   Clear pass (human request re-review)
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateParams, getValidatedParams } from '../../infrastructure/http/validation.js';
import {
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../infrastructure/http/middleware/error-handler.js';
import { taskIdColumnIdParamSchema } from '../../validation/schemas/common.schemas.js';

const router = Router();

// POST /api/tasks/:id/monitor-pass/:columnId
router.post('/monitor-pass/:columnId', requireAuth, validateParams(taskIdColumnIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ id: number; columnId: number }>(req)!;
  const taskId = params.id;
  const columnId = params.columnId;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }
  if (task.projectColumnId !== columnId) {
    throw new BadRequestError('Task is not in the specified column');
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const pass = await prisma.taskMonitorPass.upsert({
    where: { taskId_columnId: { taskId, columnId } },
    create: { taskId, columnId, passed: true, passedAt: new Date() },
    update: { passed: true, passedAt: new Date() },
  });

  res.json(pass);
}));

// POST /api/tasks/:id/monitor-reject/:columnId
router.post('/monitor-reject/:columnId', requireAuth, validateParams(taskIdColumnIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ id: number; columnId: number }>(req)!;
  const taskId = params.id;
  const columnId = params.columnId;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }
  if (task.projectColumnId !== columnId) {
    throw new BadRequestError('Task is not in the specified column');
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  // Find the previous column (by order)
  const columns = await prisma.projectColumn.findMany({
    where: { projectId: task.projectId },
    orderBy: { order: 'asc' },
  });

  const currentColIndex = columns.findIndex(c => c.id === columnId);
  if (currentColIndex <= 0) {
    throw new BadRequestError('Cannot reject from the first column');
  }

  const previousColumn = columns[currentColIndex - 1];

  await prisma.$transaction(async (tx) => {
    // Move task back to previous column
    await tx.task.update({
      where: { id: taskId },
      data: { projectColumnId: previousColumn.id },
    });

    // Delete the pass record for current column
    await tx.taskMonitorPass.deleteMany({
      where: { taskId, columnId },
    });

    // Log the rejection
    await tx.taskLog.create({
      data: {
        taskId,
        userId: user.id,
        text: `Monitor rejected task from column ${columnId}, moved back to ${previousColumn.name}`,
      },
    });
  });

  res.json({ message: 'Task rejected to previous column', previousColumnId: previousColumn.id });
}));

// DELETE /api/tasks/:id/monitor-pass/:columnId — human "request re-review"
router.delete('/monitor-pass/:columnId', requireAuth, validateParams(taskIdColumnIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ id: number; columnId: number }>(req)!;
  const taskId = params.id;
  const columnId = params.columnId;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new NotFoundError('Task');
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId: task.projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  await prisma.taskMonitorPass.deleteMany({
    where: { taskId, columnId },
  });

  res.status(204).send();
}));

export default router;
