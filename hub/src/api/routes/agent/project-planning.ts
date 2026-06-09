/**
 * Agent planning preview + device-code accept (platform session).
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { validateParams, getValidatedParams } from '../../../infrastructure/http/validation.js';
import { asyncHandler, ForbiddenError, UnauthorizedError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import { projectIdRouteParamSchema } from '../../../validation/schemas/common.schemas.js';
import { checkProjectMembership } from '../../../infrastructure/auth/project-role-check.js';
import {
  buildPlanningPreview,
  confirmProjectAcceptByCode,
  initProjectAcceptSession,
} from '../../../services/project-planning.js';

const router = Router();

function resolveTargetUserId(req: Request): number {
  const auth = (req as any).auth;
  if (auth?.type === 'agent' && req.platformSession?.targetUserId) {
    return req.platformSession.targetUserId;
  }
  if (auth?.type === 'user') {
    return auth.user.id;
  }
  throw new ForbiddenError('Platform session with target user required');
}

router.get(
  '/projects/:projectId/preview',
  requirePlatformSession,
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as any).auth;
    if (!auth) {
      throw new UnauthorizedError('Authentication required');
    }
    const params = getValidatedParams<{ projectId: number }>(req)!;
    const userId = resolveTargetUserId(req);
    const { membership } = await checkProjectMembership(userId, params.projectId, 'Viewer');
    if (!membership) {
      throw new ForbiddenError('Access denied');
    }
    const preview = await buildPlanningPreview(params.projectId);
    res.json(preview);
  }),
);

router.post(
  '/projects/:projectId/accept/init',
  requirePlatformSession,
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as any).auth;
    if (!auth) {
      throw new UnauthorizedError('Authentication required');
    }
    const params = getValidatedParams<{ projectId: number }>(req)!;
    const userId = resolveTargetUserId(req);
    const { membership, hasRole } = await checkProjectMembership(userId, params.projectId, 'Owner');
    if (!membership || !hasRole) {
      throw new ForbiddenError('Owner role required');
    }
    const session = await initProjectAcceptSession(params.projectId, userId);
    res.json(session);
  }),
);

const confirmBodySchema = z.object({
  userCode: z.string().min(4).max(16),
});

router.post(
  '/projects/:projectId/accept/confirm',
  requirePlatformSession,
  validateParams(projectIdRouteParamSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as any).auth;
    if (!auth) {
      throw new UnauthorizedError('Authentication required');
    }
    const params = getValidatedParams<{ projectId: number }>(req)!;
    const userId = resolveTargetUserId(req);
    const { membership, hasRole } = await checkProjectMembership(userId, params.projectId, 'Owner');
    if (!membership || !hasRole) {
      throw new ForbiddenError('Owner role required');
    }
    const body = confirmBodySchema.parse(req.body);
    const result = await confirmProjectAcceptByCode(params.projectId, userId, body.userCode);
    res.json(result);
  }),
);

export default router;
