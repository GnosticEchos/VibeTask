/**
 * Agent planning skill load (platform session).
 */
import { Router } from 'express';
import { z } from 'zod';
import { validateParams, getValidatedParams } from '../../../infrastructure/http/validation.js';
import { asyncHandler } from '../../../infrastructure/http/middleware/error-handler.js';
import { requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import { getEffectiveSkillContent } from '../../../services/planning-skills.js';

const router = Router();

const slugParamSchema = z.object({
  slug: z.string().min(1).max(64),
});

router.get('/skills/:slug', requirePlatformSession, validateParams(slugParamSchema), asyncHandler(async (req, res) => {
  const { slug } = getValidatedParams<{ slug: string }>(req)!;
  const projectIdRaw = req.query.projectId;
  const projectId = projectIdRaw != null ? parseInt(String(projectIdRaw), 10) : undefined;
  const content = await getEffectiveSkillContent(
    slug,
    projectId != null && !Number.isNaN(projectId) ? projectId : undefined,
  );
  res.json({ slug, content });
}));

export default router;
