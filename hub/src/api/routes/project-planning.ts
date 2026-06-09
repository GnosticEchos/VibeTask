/**
 * Human planning routes: preview, accept, device-code flow.
 */
import { Router } from 'express';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateParams, getValidatedParams } from '../../infrastructure/http/validation.js';
import { asyncHandler, ForbiddenError } from '../../infrastructure/http/middleware/error-handler.js';
import { projectIdRouteParamSchema } from '../../validation/schemas/common.schemas.js';
import { checkProjectMembership } from '../../infrastructure/auth/project-role-check.js';
import {
  buildPlanningPreview,
  confirmProjectAcceptByCode,
  confirmProjectAcceptFromBrowser,
  initProjectAcceptSession,
} from '../../services/project-planning.js';
import { z } from 'zod';

const router = Router({ mergeParams: true });

async function assertOwner(userId: number, projectId: number) {
  const { membership, hasRole } = await checkProjectMembership(userId, projectId, 'Owner');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Owner role required');
  }
}

router.get('/preview', requireAuth, validateParams(projectIdRouteParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ projectId: number }>(req)!;
  const user = req.user!;
  const { membership } = await checkProjectMembership(user.id, params.projectId, 'Viewer');
  if (!membership) {
    throw new ForbiddenError('Access denied');
  }
  const preview = await buildPlanningPreview(params.projectId);
  res.json(preview);
}));

router.post('/accept', requireAuth, validateParams(projectIdRouteParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ projectId: number }>(req)!;
  const user = req.user!;
  await assertOwner(user.id, params.projectId);
  const result = await confirmProjectAcceptFromBrowser(params.projectId, user.id);
  res.json(result);
}));

router.post('/accept/init', requireAuth, validateParams(projectIdRouteParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ projectId: number }>(req)!;
  const user = req.user!;
  await assertOwner(user.id, params.projectId);
  const session = await initProjectAcceptSession(params.projectId, user.id);
  res.json(session);
}));

const confirmBodySchema = z.object({
  userCode: z.string().min(4).max(16),
});

router.post('/accept/confirm', requireAuth, validateParams(projectIdRouteParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ projectId: number }>(req)!;
  const user = req.user!;
  await assertOwner(user.id, params.projectId);
  const body = confirmBodySchema.parse(req.body);
  const result = await confirmProjectAcceptByCode(params.projectId, user.id, body.userCode);
  res.json(result);
}));

export default router;
