/**
 * Planning skills: filesystem defaults + hub DB overrides.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../infrastructure/auth/prisma.js';
import { BadRequestError, NotFoundError } from '../infrastructure/http/middleware/error-handler.js';

const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_SKILL_BYTES = 32_000;

const repoRoot = path.resolve(process.cwd(), '..');
const defaultSkillsDir = path.join(repoRoot, 'app', 'skills');

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function validateSkillSlug(slug: string): void {
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    throw new BadRequestError('Invalid skill slug');
  }
}

export function scanSkillContent(content: string): string[] {
  const issues: string[] = [];
  if (content.length > MAX_SKILL_BYTES) {
    issues.push(`Content exceeds ${MAX_SKILL_BYTES} bytes`);
  }
  if (!content.includes('---') && !content.trim()) {
    issues.push('Skill content is empty');
  }
  return issues;
}

export async function readFilesystemSkill(slug: string): Promise<string | null> {
  validateSkillSlug(slug);
  const skillPath = path.join(defaultSkillsDir, slug, 'SKILL.md');
  try {
    return await fs.readFile(skillPath, 'utf8');
  } catch {
    return null;
  }
}

export async function getEffectiveSkillContent(slug: string, projectId?: number): Promise<string> {
  validateSkillSlug(slug);

  if (projectId != null) {
    const override = await prisma.projectPlanningSkillOverride.findUnique({
      where: { projectId_slug: { projectId, slug } },
    });
    if (override) {
      return override.content;
    }
  }

  const dbSkill = await prisma.planningSkill.findUnique({ where: { slug } });
  if (dbSkill) {
    return dbSkill.content;
  }

  const fsContent = await readFilesystemSkill(slug);
  if (fsContent) {
    return fsContent;
  }

  throw new NotFoundError(`Skill not found: ${slug}`);
}

export async function upsertGlobalSkill(slug: string, content: string, authorId?: number) {
  validateSkillSlug(slug);
  const issues = scanSkillContent(content);
  if (issues.length > 0) {
    throw new BadRequestError(`Skill validation failed: ${issues.join('; ')}`);
  }

  const contentHash = hashContent(content);
  const existing = await prisma.planningSkill.findUnique({ where: { slug } });

  const skill = await prisma.planningSkill.upsert({
    where: { slug },
    create: { slug, content, contentHash },
    update: { content, contentHash },
  });

  await prisma.planningSkillRevision.create({
    data: {
      skillId: skill.id,
      content,
      authorId: authorId ?? null,
      parentRevisionId: existing ? String(existing.id) : null,
    },
  });

  return skill;
}

export async function upsertProjectSkillOverride(
  projectId: number,
  slug: string,
  content: string,
) {
  validateSkillSlug(slug);
  const issues = scanSkillContent(content);
  if (issues.length > 0) {
    throw new BadRequestError(`Skill validation failed: ${issues.join('; ')}`);
  }

  return prisma.projectPlanningSkillOverride.upsert({
    where: { projectId_slug: { projectId, slug } },
    create: { projectId, slug, content },
    update: { content },
  });
}

export async function listSkillRevisions(slug: string) {
  const skill = await prisma.planningSkill.findUnique({
    where: { slug },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!skill) {
    return [];
  }
  return skill.revisions;
}

export async function revertGlobalSkill(slug: string, revisionId: string, authorId?: number) {
  const revision = await prisma.planningSkillRevision.findUnique({ where: { id: revisionId } });
  if (!revision) {
    throw new NotFoundError('Revision not found');
  }
  const skill = await prisma.planningSkill.findUnique({ where: { slug } });
  if (!skill || revision.skillId !== skill.id) {
    throw new BadRequestError('Revision does not belong to this skill');
  }
  return upsertGlobalSkill(slug, revision.content, authorId);
}

export async function syncFilesystemDefaultsToDb(): Promise<number> {
  let synced = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(defaultSkillsDir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const stat = await fs.stat(path.join(defaultSkillsDir, entry)).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const content = await readFilesystemSkill(entry);
    if (!content) continue;
    const existing = await prisma.planningSkill.findUnique({ where: { slug: entry } });
    if (!existing || existing.contentHash !== hashContent(content)) {
      await upsertGlobalSkill(entry, content);
      synced += 1;
    }
  }
  return synced;
}
