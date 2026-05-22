/**
 * Task Search API Route
 * 
 * Mounted at /api/tasks/search - separate from main tasks router to avoid validation conflicts.
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { asyncHandler, ForbiddenError, BadRequestError } from '../../infrastructure/http/middleware/error-handler.js';
import { transformTasks } from '../../shared/transformers/index.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const { q, projectId, page = '1', limit = '50' } = req.query;

  if (!q || typeof q !== 'string') {
    throw new BadRequestError('Search query (q) is required');
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 50));
  const skip = (pageNum - 1) * limitNum;

  const searchFilters = parseSearchQuery(q);

  const memberships = await prisma.projectUser.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });

  if (memberships.length === 0) {
    return res.json({ tasks: [], total: 0 });
  }

  const projectIds = memberships.map(m => m.projectId);

  const where: any = {
    projectId: { in: projectIds },
  };

  if (projectId && !isNaN(parseInt(projectId as string))) {
    const pid = parseInt(projectId as string);
    const membership = await prisma.projectUser.findFirst({
      where: { projectId: pid, userId: user.id },
    });
    if (!membership) {
      throw new ForbiddenError('Access denied');
    }
    where.projectId = pid;
  }

  const searchWhere = await buildSearchWhereClause(searchFilters, user.id);
  Object.assign(where, searchWhere.where);

  if (searchWhere.includeComments) {
    const matchingCommentTasks = await prisma.taskComment.findMany({
      where: {
        content: { contains: searchFilters.comments, mode: 'insensitive' },
        task: { projectId: where.projectId },
      },
      select: { taskId: true },
    });
    const commentTaskIds = matchingCommentTasks.map(c => c.taskId);
    if (where.id) {
      where.id = { in: [...(Array.isArray(where.id.in) ? where.id.in : [where.id]), ...commentTaskIds] };
    } else {
      where.id = commentTaskIds.length > 0 ? { in: commentTaskIds } : 0;
    }
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
      take: limitNum,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({
    tasks: transformTasks(tasks),
    total,
    page: pageNum,
    limit: limitNum,
  });
}));

function parseSearchQuery(q: string): Record<string, string> {
  const filters: Record<string, string> = {};
  const fieldValueRegex = /(\w+):\s*("[^"]+"|\S+)/g;
  let match;

  while ((match = fieldValueRegex.exec(q)) !== null) {
    const field = match[1].toLowerCase();
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    filters[field] = value;
  }

  const remaining = q.replace(fieldValueRegex, '').trim();
  if (remaining) {
    filters._general = remaining;
  }

  return filters;
}

async function buildSearchWhereClause(filters: Record<string, string>, _userId: number): Promise<{ where: any; includeComments: boolean }> {
  const where: any = {};
  let includeComments = false;

  const fieldMappings: Record<string, string> = {
    title: 'name',
    description: 'description',
    identifier: 'identifier',
    assignee: 'assignee',
    creator: 'createdBy',
    status: 'status',
    priority: 'priority',
    tags: 'tags',
    column: 'projectColumnId',
    due: 'dueDate',
  };

  for (const [field, value] of Object.entries(filters)) {
    if (field === '_general') {
      where.OR = [
        { name: { contains: value, mode: 'insensitive' } },
        { description: { contains: value, mode: 'insensitive' } },
        { identifier: { contains: value, mode: 'insensitive' } },
      ];
      continue;
    }

    if (field === 'comments') {
      includeComments = true;
      continue;
    }

    const prismaField = fieldMappings[field];
    if (!prismaField) continue;

    if (field === 'due') {
      const dateRange = parseDateRange(value);
      if (dateRange) {
        if (dateRange.after) where[prismaField] = { ...where[prismaField], gte: dateRange.after };
        if (dateRange.before) where[prismaField] = { ...where[prismaField], lte: dateRange.before };
      } else {
        where[prismaField] = { contains: value, mode: 'insensitive' };
      }
      continue;
    }

    if (field === 'assignee' || field === 'creator') {
      if (isNaN(parseInt(value))) {
        const users = await prisma.user.findMany({
          where: { OR: [{ name: { contains: value, mode: 'insensitive' } }, { surname: { contains: value, mode: 'insensitive' } }] },
          take: 10,
        });
        if (users.length > 0) {
          const userIds = users.map(u => u.id);
          where[field === 'assignee' ? 'assigneeId' : 'createdById'] = { in: userIds };
        }
      } else {
        where[field === 'assignee' ? 'assigneeId' : 'createdById'] = parseInt(value);
      }
      continue;
    }

    if (prismaField === 'name' || prismaField === 'description' || prismaField === 'identifier' || prismaField === 'status' || prismaField === 'priority' || prismaField === 'tags') {
      where[prismaField] = { contains: value, mode: 'insensitive' };
    } else if (prismaField === 'projectColumnId') {
      const columns = await prisma.projectColumn.findMany({ where: { name: { contains: value, mode: 'insensitive' } }, take: 10 });
      if (columns.length > 0) where.projectColumnId = { in: columns.map(c => c.id) };
    }
  }

  return { where, includeComments };
}

function parseDateRange(value: string): { after?: Date; before?: Date } | null {
  if (value.includes('..')) {
    const [after, before] = value.split('..');
    return { after: new Date(after.trim()), before: new Date(before.trim()) };
  }
  if (value.startsWith('>')) return { after: new Date(value.slice(1).trim()) };
  if (value.startsWith('<')) return { before: new Date(value.slice(1).trim()) };
  return null;
}

export default router;
