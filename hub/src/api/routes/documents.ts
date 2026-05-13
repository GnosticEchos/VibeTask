/**
 * Document Routes
 *
 * Project Knowledge Hub endpoints:
 * - GET    /api/projects/:projectId/docs              List documents
 * - POST   /api/projects/:projectId/docs              Create document (Maintainer+)
 * - GET    /api/projects/:projectId/docs/:docId       Get document
 * - PATCH  /api/projects/:projectId/docs/:docId       Update document (Maintainer+)
 * - DELETE /api/projects/:projectId/docs/:docId       Delete document (Maintainer+)
 * - GET    /api/projects/:projectId/docs/:docId/linked-tasks  Reverse index
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateParams, validateBody, getValidatedParams, getValidatedBody } from '../../infrastructure/http/validation.js';
import {
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../infrastructure/http/middleware/error-handler.js';
import { sanitize } from '../../infrastructure/http/middleware/sanitize.js';
import {
  createDocumentSchema,
  patchDocumentSchema,
} from '../../validation/schemas/document.schemas.js';
import { projectIdDocIdParamSchema, projectIdRouteParamSchema } from '../../validation/schemas/common.schemas.js';
import { checkProjectMembership } from '../../infrastructure/auth/project-role-check.js';
import type { CreateDocumentInput } from '../../validation/schemas/document.schemas.js';

const router = Router({ mergeParams: true });

// GET /api/projects/:projectId/docs - List all documents
router.get('/', requireAuth, validateParams(projectIdRouteParamSchema), asyncHandler(async (req, res) => {
  console.log('[documents] req.params:', req.params);
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number }>(req)!;
  console.log('[documents] params:', params);
  const projectId = params.projectId;

  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const type = req.query.type as string | undefined;

  const where: Record<string, unknown> = { projectId };
  if (type) {
    where.docType = type;
  }

  const [documents, total] = await Promise.all([
    prisma.projectDocument.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, surname: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.projectDocument.count({ where }),
  ]);

  res.json({
    data: documents,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));

// GET /api/projects/:projectId/docs/search - Full-text search documents
router.get('/search', requireAuth, validateParams(projectIdRouteParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number }>(req)!;
  const projectId = params.projectId;
  const q = req.query.q as string;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new BadRequestError('Search query (q) is required');
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;

  const searchQuery = q.trim();

  // Use raw query for full-text search with ts_headline
  const documents = await prisma.$queryRaw`
    SELECT
      id,
      title,
      "docType",
      "projectId",
      "createdAt",
      "updatedAt",
      "createdById",
      ts_rank_cd("searchVector", websearch_to_tsquery('english', ${searchQuery})) AS rank,
      ts_headline('english', content, websearch_to_tsquery('english', ${searchQuery}),
                  'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=15') AS snippet
    FROM "ProjectDocument"
    WHERE "projectId" = ${projectId}
      AND "searchVector" @@ websearch_to_tsquery('english', ${searchQuery})
    ORDER BY rank DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Get total count for pagination
  const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM "ProjectDocument"
    WHERE "projectId" = ${projectId}
      AND "searchVector" @@ websearch_to_tsquery('english', ${searchQuery})
  `;
  const total = Number(countResult[0]?.count || 0);

  // Fetch createdBy info separately since raw query doesn't include relations
  const docIds = (documents as any[]).map(d => d.id);
  const creators = await prisma.projectDocument.findMany({
    where: { id: { in: docIds } },
    include: {
      createdBy: { select: { id: true, name: true, surname: true } },
    },
  });
  const creatorMap = new Map(creators.map(c => [c.id, c.createdBy]));

  // Merge creator info into results
  const results = (documents as any[]).map(doc => ({
    ...doc,
    rank: Number(doc.rank),
    createdBy: creatorMap.get(doc.id) || null,
  }));

  res.json({
    data: results,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));

// POST /api/projects/:projectId/docs - Create document (Maintainer+)
router.post('/', requireAuth, validateParams(projectIdRouteParamSchema), validateBody(createDocumentSchema), sanitize(['title', 'content']), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number }>(req)!;
  const projectId = params.projectId;
  const body = getValidatedBody<CreateDocumentInput>(req)!;

  const { membership, hasRole } = await checkProjectMembership(user.id, projectId, 'Maintainer');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Maintainer or Owner role required');
  }

  const document = await prisma.projectDocument.create({
    data: {
      projectId,
      title: body.title,
      content: body.content,
      docType: body.docType as 'CONSTITUTION' | 'SPECIFICATION' | 'BRAINSTORM' | 'POST_MORTEM' | 'IMPLEMENTATION_PLAN' | 'OTHER',
      createdById: user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, surname: true } },
    },
  });

  res.status(201).json(document);
}));

// GET /api/projects/:projectId/docs/:docId - Get single document
router.get('/:docId', requireAuth, validateParams(projectIdDocIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; docId: number }>(req)!;
  const { projectId, docId } = params;

  const doc = await prisma.projectDocument.findUnique({
    where: { id: docId },
    include: {
      createdBy: { select: { id: true, name: true, surname: true } },
    },
  });

  if (!doc || doc.projectId !== projectId) {
    throw new NotFoundError('Document');
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId: doc.projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  res.json(doc);
}));

// PATCH /api/projects/:projectId/docs/:docId - Update document (Maintainer+)
router.patch('/:docId', requireAuth, validateParams(projectIdDocIdParamSchema), validateBody(patchDocumentSchema), sanitize(['title', 'content']), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; docId: number }>(req)!;
  const { projectId, docId } = params;
  const body = getValidatedBody<{ title?: string; content?: string; docType?: string }>(req)!;

  const existing = await prisma.projectDocument.findUnique({ where: { id: docId } });
  if (!existing || existing.projectId !== projectId) {
    throw new NotFoundError('Document');
  }

  const { membership, hasRole } = await checkProjectMembership(user.id, existing.projectId, 'Maintainer');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Maintainer or Owner role required');
  }

  const updated = await prisma.projectDocument.update({
    where: { id: docId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.docType !== undefined && { docType: body.docType as 'CONSTITUTION' | 'SPECIFICATION' | 'BRAINSTORM' | 'POST_MORTEM' | 'IMPLEMENTATION_PLAN' | 'OTHER' }),
      version: { increment: 1 },
    },
    include: {
      createdBy: { select: { id: true, name: true, surname: true } },
    },
  });

  res.json(updated);
}));

// DELETE /api/projects/:projectId/docs/:docId - Delete document (Maintainer+)
router.delete('/:docId', requireAuth, validateParams(projectIdDocIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; docId: number }>(req)!;
  const { projectId, docId } = params;

  const existing = await prisma.projectDocument.findUnique({ where: { id: docId } });
  if (!existing || existing.projectId !== projectId) {
    throw new NotFoundError('Document');
  }

  const { membership, hasRole } = await checkProjectMembership(user.id, existing.projectId, 'Maintainer');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Maintainer or Owner role required');
  }

  await prisma.projectDocument.delete({ where: { id: docId } });
  res.status(204).send();
}));

// GET /api/projects/:projectId/docs/:docId/linked-tasks - Reverse index
router.get('/:docId/linked-tasks', requireAuth, validateParams(projectIdDocIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; docId: number }>(req)!;
  const { projectId, docId } = params;

  const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.projectId !== projectId) {
    throw new NotFoundError('Document');
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId: doc.projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const links = await prisma.taskDocumentLink.findMany({
    where: { documentId: docId },
    include: {
      task: {
        select: {
          id: true,
          name: true,
          identifier: true,
          projectColumnId: true,
          assignee: { select: { id: true, name: true, surname: true } },
        },
      },
    },
  });

  res.json({ data: links });
}));

export default router;
