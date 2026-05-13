/**
 * Plan Acceptance Route
 *
 * POST /api/projects/:projectId/accept-plan/:taskId
 *
 * Accepts an implementation plan for a task, triggering sub-board expansion.
 * Requires Maintainer+ role and human gate (agents cannot call this silently).
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
import { checkProjectMembership } from '../../infrastructure/auth/project-role-check.js';
import { projectIdTaskIdParamSchema } from '../../validation/schemas/common.schemas.js';

const router = Router({ mergeParams: true });

/**
 * Parse markdown content to extract sub-task items.
 * Strategy: H2/H3 headings become sub-task names.
 */
function parseSubTasksFromMarkdown(content: string): string[] {
  const headingRegex = /^#{2,3}\s+(.+)$/gm;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1].trim();
    if (heading) {
      headings.push(heading);
    }
  }
  return headings;
}

// POST /api/projects/:projectId/accept-plan/:taskId
router.post('/', requireAuth, validateParams(projectIdTaskIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; taskId: number }>(req)!;
  const { projectId, taskId } = params;

  // Check Maintainer+ role
  const { membership, hasRole } = await checkProjectMembership(user.id, projectId, 'Maintainer');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Maintainer or Owner role required to accept a plan');
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      docLinks: {
        where: { role: 'IMPLEMENTATION_PLAN' },
        include: { document: true },
      },
    },
  });

  if (!task) {
    throw new NotFoundError('Task');
  }
  if (task.projectId !== projectId) {
    throw new ForbiddenError('Task does not belong to this project');
  }
  if (task.parentId != null) {
    throw new ForbiddenError('Cannot accept plan on a child task — nested sub-boards are not supported');
  }
  if (task.planAccepted) {
    throw new BadRequestError('Plan has already been accepted for this task');
  }

  // Must have an IMPLEMENTATION_PLAN doc link
  const planLink = task.docLinks[0];
  if (!planLink) {
    throw new BadRequestError('Task must have an IMPLEMENTATION_PLAN document linked before acceptance');
  }

  // Parse sub-tasks from the implementation plan
  const subTaskNames = parseSubTasksFromMarkdown(planLink.document.content);
  if (subTaskNames.length === 0) {
    throw new BadRequestError('Implementation plan must contain at least one heading (## or ###) to spawn sub-tasks');
  }

  // Get project columns to distribute sub-tasks
  const columns = await prisma.projectColumn.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
  });

  if (columns.length === 0) {
    throw new BadRequestError('Project must have at least one column');
  }

  // Default: put first sub-task in second column (or first if only one), rest in third (or last)
  const firstColumn = columns[0];
  const secondColumn = columns[Math.min(1, columns.length - 1)];
  const thirdColumn = columns[Math.min(2, columns.length - 1)];

  // Get project info for identifier generation
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { prefix: true },
  });

  // Get current max order for the target columns to compute new orders
  const maxOrderInFirst = await prisma.task.aggregate({
    where: { projectColumnId: firstColumn.id },
    _max: { order: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    // Mark the parent task as plan accepted
    const updatedTask = await tx.task.update({
      where: { id: taskId },
      data: {
        planAccepted: true,
        isContainer: true,
      },
    });

    // Get task count INSIDE transaction to avoid race conditions
    const taskCountResult = await tx.task.count({
      where: { projectId },
    });

    // Spawn child tasks
    const createdChildren: any[] = [];
    let baseOrder = (maxOrderInFirst._max.order ?? 0) + 1;

    for (let i = 0; i < subTaskNames.length; i++) {
      const name = subTaskNames[i];
      // First sub-task goes to second column, rest to third (or last)
      const targetColumn = i === 0 ? secondColumn : thirdColumn;

      const child = await tx.task.create({
        data: {
          name,
          projectId,
          projectColumnId: targetColumn.id,
          createdById: user.id,
          parentId: taskId,
          order: baseOrder + i,
          identifier: `${project?.prefix || 'TASK'}-${taskCountResult + i + 1}`,
        },
        include: {
          createdBy: { select: { id: true, name: true, surname: true } },
          assignee: { select: { id: true, name: true, surname: true } },
        },
      });

      createdChildren.push(child);
    }

    // Log the acceptance
    await tx.taskLog.create({
      data: {
        taskId,
        userId: user.id,
        text: `Implementation plan accepted. ${createdChildren.length} sub-tasks spawned.`,
      },
    });

    return { task: updatedTask, children: createdChildren };
  });

  res.status(201).json({
    task: result.task,
    children: result.children,
    childrenCount: result.children.length,
  });
}));

export default router;
