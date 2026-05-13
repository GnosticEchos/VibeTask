/**
 * Agent Documents API Routes
 *
 * Read-only document access for agents.
 * POST endpoint for document creation with markdown security validation.
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
import { sanitize } from '../../../infrastructure/http/middleware/sanitize.js';
import {
  projectIdRouteParamSchema,
  projectIdDocIdParamSchema,
} from '../../../validation/schemas/common.schemas.js';
import { createDocumentSchema } from '../../../validation/schemas/document.schemas.js';
import { asyncHandler, NotFoundError, BadRequestError, ForbiddenError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import { parseMarkdown, isDocTypeAllowedForAgent } from '../../../infrastructure/security/markdown-parser.js';
import type { CreateDocumentInput } from '../../../validation/schemas/document.schemas.js';

const router = Router({ mergeParams: true });

// GET /api/agent/projects/:projectId/docs - List documents
router.get(
  '/',
  requireAgentProjectAccess(ProjectAction.VIEW_DOCS),
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number }>(req);
    if (!params) {
      throw new Error('Missing or invalid parameters');
    }
    const projectId = params.projectId;

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
  })
);

// POST /api/agent/projects/:projectId/docs - Create document (with markdown security)
router.post(
  '/',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.CREATE_DOC),
  validateParams(projectIdRouteParamSchema),
  validateBody(createDocumentSchema),
  sanitize(['title', 'content']),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number }>(req);
    if (!params) {
      throw new Error('Missing or invalid parameters');
    }
    const projectId = params.projectId;
    const body = getValidatedBody<CreateDocumentInput>(req)!;

    // Determine if this is a platform agent (based on API key metadata)
    // For now, we check if it's a platform agent by checking delegation metadata
    const auth = (req as any).auth;
    const isPlatformAgent = auth?.agent?.isPlatformAgent || false;

    // Check doc type permissions based on agent type
    if (!isDocTypeAllowedForAgent(body.docType, isPlatformAgent)) {
      throw new ForbiddenError(
        `Document type '${body.docType}' is not allowed for project agents. Allowed types: SPECIFICATION, BRAINSTORM, OTHER.`
      );
    }

    // Security: Parse and validate markdown content before storing
    if (body.content && body.content.trim().length > 0) {
      const parseResult = await parseMarkdown(body.content);
      
      if (!parseResult.valid) {
        throw new BadRequestError(
          `Content validation failed: ${parseResult.errors.join('; ')}`
        );
      }
    }

    // Get the agent's owner user ID (use the API key's user)
    const createdById = auth?.user?.id || auth?.agent?.createdById || 1;

    // Create the document
    const document = await prisma.projectDocument.create({
      data: {
        projectId,
        title: body.title,
        content: body.content || '',
        docType: body.docType as 'CONSTITUTION' | 'SPECIFICATION' | 'BRAINSTORM' | 'POST_MORTEM' | 'IMPLEMENTATION_PLAN' | 'OTHER',
        createdById,
      },
      include: {
        createdBy: { select: { id: true, name: true, surname: true } },
      },
    });

    res.status(201).json(document);
  })
);

// GET /api/agent/projects/:projectId/docs/search - Full-text search documents
router.get(
  '/search',
  requireAgentProjectAccess(ProjectAction.VIEW_DOCS),
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number }>(req);
    if (!params) {
      throw new Error('Missing or invalid parameters');
    }
    const projectId = params.projectId;
    const q = req.query.q as string;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      throw new BadRequestError('Search query (q) is required');
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
  })
);

// GET /api/agent/projects/:projectId/docs/:docId - Get single document
router.get(
  '/:docId',
  requireAgentProjectAccess(ProjectAction.VIEW_DOCS),
  validateParams(projectIdDocIdParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; docId: number }>(req);
    if (!params) {
      throw new Error('Missing or invalid parameters');
    }
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

    res.json(doc);
  })
);

// PATCH /api/agent/projects/:projectId/docs/:docId - Update document (for commit_artifact)
router.patch(
  '/:docId',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.CREATE_DOC),
  validateParams(projectIdDocIdParamSchema),
  validateBody(z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().max(100000).optional(),
    docType: z.enum(['CONSTITUTION', 'SPECIFICATION', 'BRAINSTORM', 'POST_MORTEM', 'IMPLEMENTATION_PLAN', 'OTHER']).optional(),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; docId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { projectId, docId } = params;
    const body = getValidatedBody<{ title?: string; content?: string; docType?: string }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }

    const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.projectId !== projectId) {
      throw new NotFoundError('Document');
    }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.docType !== undefined) data.docType = body.docType;

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data,
      include: { createdBy: { select: { id: true, name: true, surname: true } } },
    });

    res.json(updated);
  })
);

// POST /api/agent/projects/:projectId/docs/:docId/annotations - Add document annotation
router.post(
  '/:docId/annotations',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.CREATE_DOC),
  validateParams(projectIdDocIdParamSchema),
  validateBody(z.object({
    content: z.string().min(1).max(10000),
    annotationType: z.string().max(50),
    tags: z.array(z.string()).optional(),
    relatedTaskIds: z.array(z.number()).optional(),
    technologyStack: z.array(z.string()).optional(),
    complexityLevel: z.number().int().min(1).max(10).optional(),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; docId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { docId } = params;
    const body = getValidatedBody<{
      content: string; annotationType: string; tags?: string[];
      relatedTaskIds?: number[]; technologyStack?: string[]; complexityLevel?: number;
    }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }

    const doc = await prisma.projectDocument.findUnique({
      where: { id: docId },
      select: { id: true, content: true, projectId: true },
    });
    if (!doc) {
      throw new NotFoundError('Document');
    }

    const annotation = {
      id: Date.now(),
      content: body.content,
      annotationType: body.annotationType,
      tags: body.tags || [],
      relatedTaskIds: body.relatedTaskIds || [],
      technologyStack: body.technologyStack || [],
      complexityLevel: body.complexityLevel,
      createdAt: new Date().toISOString(),
    };

    // Store annotation as an appended JSON block in the content
    const annotationBlock = `\n\n---\n*Annotation [${body.annotationType}] at ${new Date().toISOString()}*\n${JSON.stringify(annotation, null, 2)}\n---`;
    await prisma.projectDocument.update({
      where: { id: docId },
      data: { content: doc.content + annotationBlock },
    });

    res.status(201).json({ annotation });
  })
);

// POST /api/agent/projects/:projectId/docs/:docId/pin-version - Pin document version
router.post(
  '/:docId/pin-version',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.CREATE_DOC),
  validateParams(projectIdDocIdParamSchema),
  validateBody(z.object({
    version: z.string().min(1).max(20),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; docId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { docId } = params;
    const body = getValidatedBody<{ version: string }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }

    const doc = await prisma.projectDocument.findUnique({
      where: { id: docId },
      select: { id: true, version: true },
    });
    if (!doc) {
      throw new NotFoundError('Document');
    }

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: { version: { increment: 1 } },
      select: { id: true, version: true },
    });

    res.json({ pinnedVersion: updated.version, document: updated });
  })
);

export default router;
