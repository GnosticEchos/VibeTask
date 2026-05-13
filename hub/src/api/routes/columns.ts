/**
 * Columns API Routes
 * 
 * Implements the columns endpoints from the API contract:
 * - GET /api/columns?projectId - Get all columns for a project
 * - POST /api/columns?projectId - Create a new column
 * - PATCH /api/columns - Batch update/create/delete columns
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateBody, validateQuery, validateParams, getValidatedQuery, getValidatedParams, getValidatedBody } from '../../infrastructure/http/validation.js';
import { 
  createColumnSchema, 
  batchUpdateColumnsSchema,
  projectIdQuerySchema,
  columnIdParamSchema
} from '../../validation/schemas/index.js';
import { 
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  BadRequestError
} from '../../infrastructure/http/middleware/error-handler.js';
import { sanitize } from '../../infrastructure/http/middleware/sanitize.js';
import { transformColumn, transformColumns } from '../../shared/transformers/index.js';
import { paginatedResponse } from '../../validation/schemas/common.schemas.js';

const router = Router();

// GET /api/columns?projectId - Get all columns for a project
router.get('/', requireAuth, validateQuery(projectIdQuerySchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const validatedQuery = getValidatedQuery<{ projectId: number }>(req);
  if (!validatedQuery) {
    throw new BadRequestError('Missing or invalid query parameters');
  }
  const { projectId } = validatedQuery;

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

  // Parse pagination params from query (always use pagination)
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  // Get total count first
  const total = await prisma.projectColumn.count({
    where: { projectId },
  });

  // Get paginated columns
  const columns = await prisma.projectColumn.findMany({
    where: { projectId },
    include: {
      tasks: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
    skip,
    take: limit,
  });

  res.json(paginatedResponse(transformColumns(columns), page, limit, total));
}));

// POST /api/columns?projectId - Create a new column
router.post('/', requireAuth, validateBody(createColumnSchema), sanitize(['name', 'description']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const body = getValidatedBody<{ name: string; projectId: number; order?: number; color?: string; type?: string; description?: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { name, projectId, order, color, type, description } = body;

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Get max order if not provided
  let columnOrder = order;
  if (columnOrder === undefined) {
    const maxOrder = await prisma.projectColumn.aggregate({
      where: { projectId },
      _max: { order: true },
    });
    columnOrder = (maxOrder._max.order || 0) + 1;
  }

  const column = await prisma.projectColumn.create({
    data: {
      name,
      projectId,
      order: columnOrder,
      color: color || '#6366f1',
      type: type || null,
      description: description || null,
    },
  });

  res.status(201).json(transformColumn(column));
}));

// PATCH /api/columns - Batch update/create/delete columns
router.patch('/', requireAuth, validateBody(batchUpdateColumnsSchema), sanitize(['name', 'description']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const body = getValidatedBody<{ projectId: number; columns: Array<{ id?: number; name?: string; order?: number; color?: string; type?: string; description?: string; toDelete?: boolean }> }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { projectId, columns } = body;

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Process each column
  for (const col of columns) {
    if (col.toDelete && col.id) {
      // Delete column
      await prisma.projectColumn.delete({
        where: { id: col.id },
      });
    } else if (col.id) {
      // Update column
      await prisma.projectColumn.update({
        where: { id: col.id },
        data: {
          ...(col.name !== undefined && { name: col.name }),
          ...(col.order !== undefined && { order: col.order }),
          ...(col.color !== undefined && { color: col.color }),
          ...(col.type !== undefined && { type: col.type }),
          ...(col.description !== undefined && { description: col.description }),
        },
      });
    } else {
      // Create column
      await prisma.projectColumn.create({
        data: {
          name: col.name || 'New Column',
          projectId,
          order: col.order || 0,
          color: col.color || '#6366f1',
          type: col.type || null,
          description: col.description || null,
        },
      });
    }
  }

  res.status(200).json({});
}));

// PATCH /api/columns/:id - Update a single column
router.patch('/:id', requireAuth, validateParams(columnIdParamSchema), validateBody(z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().int().optional(),
  color: z.string().max(20).optional(),
  type: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
})), sanitize(['name', 'description']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const { id: columnId } = params;
  const body = getValidatedBody<{ name?: string; order?: number; color?: string; type?: string; description?: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { name, order, color, type, description } = body;

  // Get column to find projectId
  const column = await prisma.projectColumn.findUnique({
    where: { id: columnId },
  });

  if (!column) {
    throw new NotFoundError('Column');
  }

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: column.projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Update column - use selective fields to prevent over-posting
  const updatedColumn = await prisma.projectColumn.update({
    where: { id: columnId },
    data: {
      ...(name !== undefined && { name }),
      ...(order !== undefined && { order }),
      ...(color !== undefined && { color }),
      ...(type !== undefined && { type }),
      ...(description !== undefined && { description }),
    },
  });

  res.json(transformColumn(updatedColumn));
}));

// DELETE /api/columns/:id - Delete a single column
router.delete('/:id', requireAuth, validateParams(columnIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const { id: columnId } = params;

  // Get column to find projectId
  const column = await prisma.projectColumn.findUnique({
    where: { id: columnId },
  });

  if (!column) {
    throw new NotFoundError('Column');
  }

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: { projectId: column.projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Delete column
  await prisma.projectColumn.delete({
    where: { id: columnId },
  });

  res.status(204).send();
}));

export default router;