/**
 * Agent draft project creation (platform session required).
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ForbiddenError, UnauthorizedError } from '../../../infrastructure/http/middleware/error-handler.js';
import { validateBody, getValidatedBody } from '../../../infrastructure/http/validation.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import { createProjectRecord } from '../../../services/project-create.js';
import { transformProject } from '../../../shared/transformers/project.transformer.js';

const router = Router();

const draftDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100_000).optional().default(''),
  docType: z.enum(['CONSTITUTION', 'SPECIFICATION', 'BRAINSTORM', 'POST_MORTEM', 'IMPLEMENTATION_PLAN', 'OTHER']),
});

const createDraftSchema = z.object({
  name: z.string().min(1).max(100),
  prefix: z.string().min(2).max(10).regex(/^[A-Z0-9]+$/),
  description: z.string().max(500).optional(),
  template: z.enum(['LIFECYCLE_EPIC', 'ADHOC_OPS']).optional().default('ADHOC_OPS'),
  documents: z.array(draftDocumentSchema).optional(),
  backlogTasks: z.array(z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(5000).optional().nullable(),
  })).optional(),
});

router.post('/draft', requirePlatformSession, validateBody(createDraftSchema), asyncHandler(async (req, res) => {
  const auth = (req as any).auth;
  if (!auth) {
    throw new UnauthorizedError('Authentication required');
  }

  let ownerId: number;
  if (auth.type === 'agent' && req.platformSession?.targetUserId) {
    ownerId = req.platformSession.targetUserId;
  } else if (auth.type === 'user') {
    ownerId = auth.user.id;
  } else {
    throw new ForbiddenError('Platform session with target user required to create draft projects');
  }

  const body = getValidatedBody<z.infer<typeof createDraftSchema>>(req)!;

  const project = await createProjectRecord({
    name: body.name.trim(),
    prefix: body.prefix.toUpperCase().trim(),
    description: body.description,
    template: body.template,
    columnsSpecified: false,
    lifecycleStatus: 'DRAFT',
    planningMeta: { source: 'platform', templateId: body.template },
    ownerId,
    documents: body.documents,
    backlogTasks: body.backlogTasks,
  });

  res.status(201).json({
    project: {
      ...transformProject(project),
      lifecycleStatus: project.lifecycleStatus,
      columns: project.columns,
    },
  });
}));

export default router;
