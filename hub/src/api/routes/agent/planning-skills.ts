/**
 * Agent planning skill load (platform session).
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { validateParams, getValidatedParams } from '../../../infrastructure/http/validation.js';
import { asyncHandler, ForbiddenError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import { checkProjectMembership } from '../../../infrastructure/auth/project-role-check.js';
import { getEffectiveSkillContent } from '../../../services/planning-skills.js';

const router = Router();

const slugParamSchema = z.object({
  slug: z.string().min(1).max(64),
});

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

router.get('/skills/:slug', requirePlatformSession, validateParams(slugParamSchema), asyncHandler(async (req, res) => {
  const { slug } = getValidatedParams<{ slug: string }>(req)!;
  const projectIdRaw = req.query.projectId;
  const projectId = projectIdRaw != null ? parseInt(String(projectIdRaw), 10) : undefined;

  if (projectId != null && !Number.isNaN(projectId)) {
    const userId = resolveTargetUserId(req);
    const { membership } = await checkProjectMembership(userId, projectId, 'Viewer');
    if (!membership) {
      throw new ForbiddenError('Access denied');
    }
  }

  const content = await getEffectiveSkillContent(
    slug,
    projectId != null && !Number.isNaN(projectId) ? projectId : undefined,
  );
  res.json({ slug, content });
}));

export default router;
