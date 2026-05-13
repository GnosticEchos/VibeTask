/**
 * Agent Task-Document Link Routes
 *
 * Read-only doc-link access for agents.
 */

import { Router } from 'express';
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
  projectIdTaskIdParamSchema,
} from '../../../validation/schemas/common.schemas.js';
import { asyncHandler, NotFoundError, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import { z } from 'zod';

const router = Router({ mergeParams: true });

// GET /api/agent/projects/:projectId/tasks/:taskId/doc-links
router.get(
  '/',
  requireAgentProjectAccess(ProjectAction.VIEW_DOCS),
  validateParams(projectIdTaskIdParamSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new Error('Missing or invalid parameters');
    }
    const { projectId, taskId } = params;

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
  })
);

// POST /api/agent/projects/:projectId/tasks/:taskId/doc-links - Create doc link
router.post(
  '/',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.LINK_DOC),
  validateParams(projectIdTaskIdParamSchema),
  validateBody(z.object({
    documentId: z.number().int().positive('Document ID is required'),
    role: z.enum(['SPECIFICATION', 'IMPLEMENTATION_PLAN', 'REFERENCE', 'ATTACHMENT']).optional(),
    pinnedVersion: z.number().int().positive().optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ projectId: number; taskId: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const { projectId, taskId } = params;
    const body = getValidatedBody<{ documentId: number; role?: string; pinnedVersion?: number | null }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }

    // Verify task exists and belongs to project
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundError('Task');
    }

    // Verify document exists and belongs to project
    const document = await prisma.projectDocument.findFirst({
      where: { id: body.documentId, projectId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundError('Document');
    }

    // Create the doc link (upsert to handle unique constraint)
    const docLink = await prisma.taskDocumentLink.upsert({
      where: {
        taskId_documentId: {
          taskId,
          documentId: body.documentId,
        },
      },
      create: {
        projectId,
        taskId,
        documentId: body.documentId,
        role: body.role as 'SPECIFICATION' | 'IMPLEMENTATION_PLAN' | 'REFERENCE' | 'ATTACHMENT' || 'REFERENCE',
        pinnedVersion: body.pinnedVersion,
      },
      update: {
        role: body.role as 'SPECIFICATION' | 'IMPLEMENTATION_PLAN' | 'REFERENCE' | 'ATTACHMENT' || 'REFERENCE',
        pinnedVersion: body.pinnedVersion,
      },
      include: {
        document: {
          select: { id: true, title: true, docType: true, version: true },
        },
      },
    });

    res.status(201).json({ data: docLink });
  })
);

export default router;
