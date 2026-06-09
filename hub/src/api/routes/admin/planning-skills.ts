import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../../infrastructure/http/middleware/auth.js';
import { validateBody, validateParams, getValidatedBody, getValidatedParams } from '../../../infrastructure/http/validation.js';
import { asyncHandler } from '../../../infrastructure/http/middleware/error-handler.js';
import {
  getEffectiveSkillContent,
  listSkillRevisions,
  revertGlobalSkill,
  syncFilesystemDefaultsToDb,
  upsertGlobalSkill,
} from '../../../services/planning-skills.js';
import { prisma } from '../../../infrastructure/auth/prisma.js';

const router = Router();

const slugParamSchema = z.object({
  slug: z.string().min(1).max(64),
});

const upsertSkillSchema = z.object({
  content: z.string().min(1).max(32_000),
});

const revertSchema = z.object({
  revisionId: z.string().min(1),
});

router.use(requireAdmin);

router.get('/', asyncHandler(async (_req, res) => {
  const skills = await prisma.planningSkill.findMany({
    orderBy: { slug: 'asc' },
    select: { slug: true, contentHash: true, updatedAt: true },
  });
  res.json({ skills });
}));

router.post('/sync', asyncHandler(async (_req, res) => {
  const synced = await syncFilesystemDefaultsToDb();
  res.json({ synced });
}));

router.get('/:slug', validateParams(slugParamSchema), asyncHandler(async (req, res) => {
  const { slug } = getValidatedParams<{ slug: string }>(req)!;
  const content = await getEffectiveSkillContent(slug);
  res.json({ slug, content });
}));

router.put('/:slug', validateParams(slugParamSchema), validateBody(upsertSkillSchema), asyncHandler(async (req, res) => {
  const { slug } = getValidatedParams<{ slug: string }>(req)!;
  const body = getValidatedBody<{ content: string }>(req)!;
  const user = req.user!;
  const skill = await upsertGlobalSkill(slug, body.content, user.id);
  res.json({ skill });
}));

router.get('/:slug/revisions', validateParams(slugParamSchema), asyncHandler(async (req, res) => {
  const { slug } = getValidatedParams<{ slug: string }>(req)!;
  const revisions = await listSkillRevisions(slug);
  res.json({ revisions });
}));

router.post('/:slug/revert', validateParams(slugParamSchema), validateBody(revertSchema), asyncHandler(async (req, res) => {
  const { slug } = getValidatedParams<{ slug: string }>(req)!;
  const body = getValidatedBody<{ revisionId: string }>(req)!;
  const user = req.user!;
  const skill = await revertGlobalSkill(slug, body.revisionId, user.id);
  res.json({ skill });
}));

export default router;
