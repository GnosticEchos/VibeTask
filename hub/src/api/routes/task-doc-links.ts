/**
 * Task-Document Link Routes
 *
 * Endpoints for managing task-document associations:
 * - GET    /api/projects/:projectId/tasks/:taskId/doc-links       List links
 * - POST   /api/projects/:projectId/tasks/:taskId/doc-links       Create link
 * - PATCH  /api/projects/:projectId/tasks/:taskId/doc-links/:linkId  Update link
 * - DELETE /api/projects/:projectId/tasks/:taskId/doc-links/:linkId  Delete link
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateParams, validateBody, getValidatedParams, getValidatedBody } from '../../infrastructure/http/validation.js';
import {
  asyncHandler,
  NotFoundError,
  ForbiddenError,
} from '../../infrastructure/http/middleware/error-handler.js';
import {
  createTaskDocumentLinkSchema,
  patchTaskDocumentLinkSchema,
} from '../../validation/schemas/taskDocumentLink.schemas.js';
import { projectIdTaskIdParamSchema, projectIdTaskIdLinkIdParamSchema } from '../../validation/schemas/common.schemas.js';
import { checkProjectMembership } from '../../infrastructure/auth/project-role-check.js';

const router = Router({ mergeParams: true });

// GET /api/projects/:projectId/tasks/:taskId/doc-links
router.get('/', requireAuth, validateParams(projectIdTaskIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; taskId: number }>(req)!;
  const { projectId, taskId } = params;

  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const links = await prisma.taskDocumentLink.findMany({
    where: { taskId, projectId },
    include: {
      document: {
        select: { id: true, title: true, docType: true, version: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ data: links });
}));

// POST /api/projects/:projectId/tasks/:taskId/doc-links
router.post('/', requireAuth, validateParams(projectIdTaskIdParamSchema), validateBody(createTaskDocumentLinkSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; taskId: number }>(req)!;
  const { projectId, taskId } = params;
  const body = getValidatedBody<{ documentId: number; role?: string; pinnedVersion?: number }>(req)!;

  // Verify task and document belong to the same project
  const [task, doc] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.projectDocument.findUnique({ where: { id: body.documentId } }),
  ]);

  if (!task) throw new NotFoundError('Task');
  if (!doc) throw new NotFoundError('Document');
  if (task.projectId !== projectId || doc.projectId !== projectId) {
    throw new ForbiddenError('Task and document must belong to the same project');
  }

  // IMPLEMENTATION_PLAN and SPECIFICATION links require Maintainer+
  const minRole = (body.role === 'IMPLEMENTATION_PLAN' || body.role === 'SPECIFICATION') ? 'Maintainer' : 'Editor';
  const { membership, hasRole } = await checkProjectMembership(user.id, projectId, minRole);
  if (!membership || !hasRole) {
    throw new ForbiddenError(`${minRole} role required for this link type`);
  }

  const link = await prisma.taskDocumentLink.create({
    data: {
      projectId,
      taskId,
      documentId: body.documentId,
      role: (body.role as 'SPECIFICATION' | 'IMPLEMENTATION_PLAN' | 'REFERENCE' | 'ATTACHMENT' | null) || null,
      pinnedVersion: body.pinnedVersion || null,
      createdBy: user.id,
    },
    include: {
      document: {
        select: { id: true, title: true, docType: true, version: true },
      },
    },
  });

  res.status(201).json(link);
}));

// PATCH /api/projects/:projectId/tasks/:taskId/doc-links/:linkId
router.patch('/:linkId', requireAuth, validateParams(projectIdTaskIdLinkIdParamSchema), validateBody(patchTaskDocumentLinkSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; taskId: number; linkId: number }>(req)!;
  const { projectId, linkId } = params;
  const body = getValidatedBody<{ role?: string | null; pinnedVersion?: number | null }>(req)!;

  const existing = await prisma.taskDocumentLink.findUnique({
    where: { id: linkId },
  });
  if (!existing) throw new NotFoundError('Link');
  if (existing.projectId !== projectId) {
    throw new ForbiddenError('Link does not belong to this project');
  }

  const minRole = (body.role === 'IMPLEMENTATION_PLAN' || body.role === 'SPECIFICATION') ? 'Maintainer' : 'Editor';
  const { membership, hasRole } = await checkProjectMembership(user.id, projectId, minRole);
  if (!membership || !hasRole) {
    throw new ForbiddenError(`${minRole} role required`);
  }

  const updated = await prisma.taskDocumentLink.update({
    where: { id: linkId },
    data: {
      ...(body.role !== undefined && { role: body.role as 'SPECIFICATION' | 'IMPLEMENTATION_PLAN' | 'REFERENCE' | 'ATTACHMENT' | null }),
      ...(body.pinnedVersion !== undefined && { pinnedVersion: body.pinnedVersion }),
    },
    include: {
      document: {
        select: { id: true, title: true, docType: true, version: true },
      },
    },
  });

  res.json(updated);
}));

// DELETE /api/projects/:projectId/tasks/:taskId/doc-links/:linkId
router.delete('/:linkId', requireAuth, validateParams(projectIdTaskIdLinkIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ projectId: number; taskId: number; linkId: number }>(req)!;
  const { projectId, linkId } = params;

  const existing = await prisma.taskDocumentLink.findUnique({ where: { id: linkId } });
  if (!existing) throw new NotFoundError('Link');
  if (existing.projectId !== projectId) {
    throw new ForbiddenError('Link does not belong to this project');
  }

  const { membership, hasRole } = await checkProjectMembership(user.id, projectId, 'Editor');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Editor role required');
  }

  await prisma.taskDocumentLink.delete({ where: { id: linkId } });
  res.status(204).send();
}));

export default router;
