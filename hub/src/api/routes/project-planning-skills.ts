/**
 * Project-level planning skill overrides.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateBody, validateParams, getValidatedBody, getValidatedParams } from '../../infrastructure/http/validation.js';
import { asyncHandler, ForbiddenError } from '../../infrastructure/http/middleware/error-handler.js';
import { projectIdRouteParamSchema } from '../../validation/schemas/common.schemas.js';
import { checkProjectMembership } from '../../infrastructure/auth/project-role-check.js';
import { getEffectiveSkillContent, upsertProjectSkillOverride } from '../../services/planning-skills.js';

const router = Router({ mergeParams: true });

const skillParamsSchema = projectIdRouteParamSchema.extend({
  slug: z.string().min(1).max(64),
});

const upsertSchema = z.object({
  content: z.string().min(1).max(32_000),
});

router.get('/:slug', requireAuth, validateParams(skillParamsSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ projectId: number; slug: string }>(req)!;
  const user = req.user!;
  const { membership } = await checkProjectMembership(user.id, params.projectId, 'Viewer');
  if (!membership) {
    throw new ForbiddenError('Access denied');
  }
  const content = await getEffectiveSkillContent(params.slug, params.projectId);
  res.json({ slug: params.slug, content });
}));

router.put('/:slug', requireAuth, validateParams(skillParamsSchema), validateBody(upsertSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ projectId: number; slug: string }>(req)!;
  const user = req.user!;
  const { membership, hasRole } = await checkProjectMembership(user.id, params.projectId, 'Maintainer');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Maintainer role required');
  }
  const body = getValidatedBody<{ content: string }>(req)!;
  const override = await upsertProjectSkillOverride(params.projectId, params.slug, body.content);
  res.json({ override });
}));

export default router;
