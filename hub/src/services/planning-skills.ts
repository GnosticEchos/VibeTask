/**
 * Planning skills: filesystem defaults + hub DB overrides.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../infrastructure/auth/prisma.js';
import { BadRequestError, NotFoundError } from '../infrastructure/http/middleware/error-handler.js';
import { parseMarkdown } from '../infrastructure/security/markdown-parser.js';

export type SkillCatalogSource = 'filesystem' | 'db' | 'both';

export type PlanningSkillCatalogEntry = {
  slug: string;
  source: SkillCatalogSource;
  filesystemHash: string | null;
  dbContentHash: string | null;
  dbUpdatedAt: Date | null;
  syncAvailable: boolean;
};

export type ProjectPlanningSkillIndexEntry = {
  slug: string;
  catalogSource: SkillCatalogSource;
  hasOverride: boolean;
  overrideUpdatedAt: Date | null;
};

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

async function listFilesystemSkillSlugs(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(defaultSkillsDir);
  } catch {
    return [];
  }

  const slugs: string[] = [];
  for (const entry of entries) {
    const stat = await fs.stat(path.join(defaultSkillsDir, entry)).catch(() => null);
    if (!stat?.isDirectory()) continue;
    if (!SKILL_SLUG_PATTERN.test(entry)) continue;
    const content = await readFilesystemSkill(entry);
    if (content) {
      slugs.push(entry);
    }
  }
  return slugs.sort();
}

export async function listSkillCatalog(): Promise<PlanningSkillCatalogEntry[]> {
  const fsSlugs = await listFilesystemSkillSlugs();
  const dbSkills = await prisma.planningSkill.findMany({ orderBy: { slug: 'asc' } });
  const dbBySlug = new Map(dbSkills.map((skill) => [skill.slug, skill]));
  const allSlugs = [...new Set([...fsSlugs, ...dbSkills.map((skill) => skill.slug)])].sort();

  return Promise.all(
    allSlugs.map(async (slug) => {
      const fsContent = fsSlugs.includes(slug) ? await readFilesystemSkill(slug) : null;
      const filesystemHash = fsContent ? hashContent(fsContent) : null;
      const dbSkill = dbBySlug.get(slug);
      const dbContentHash = dbSkill?.contentHash ?? null;

      let source: SkillCatalogSource;
      if (filesystemHash && dbContentHash) {
        source = 'both';
      } else if (dbContentHash) {
        source = 'db';
      } else {
        source = 'filesystem';
      }

      return {
        slug,
        source,
        filesystemHash,
        dbContentHash,
        dbUpdatedAt: dbSkill?.updatedAt ?? null,
        syncAvailable: Boolean(filesystemHash && dbContentHash && filesystemHash !== dbContentHash),
      };
    }),
  );
}

export async function assertSkillInCatalog(slug: string): Promise<void> {
  validateSkillSlug(slug);
  const hasFilesystem = (await readFilesystemSkill(slug)) != null;
  const hasDatabase = (await prisma.planningSkill.findUnique({ where: { slug } })) != null;
  if (!hasFilesystem && !hasDatabase) {
    throw new BadRequestError(`Skill not in catalog: ${slug}`);
  }
}

export async function validateSkillContentForSave(content: string): Promise<void> {
  const issues = scanSkillContent(content);
  if (issues.length > 0) {
    throw new BadRequestError(`Skill validation failed: ${issues.join('; ')}`);
  }

  const parseResult = await parseMarkdown(content);
  if (!parseResult.valid) {
    throw new BadRequestError(`Content validation failed: ${parseResult.errors.join('; ')}`);
  }
}

export async function listProjectSkillOverrides(
  projectId: number,
): Promise<ProjectPlanningSkillIndexEntry[]> {
  const catalog = await listSkillCatalog();
  const overrides = await prisma.projectPlanningSkillOverride.findMany({
    where: { projectId },
  });
  const overrideBySlug = new Map(overrides.map((override) => [override.slug, override]));

  return catalog.map((entry) => ({
    slug: entry.slug,
    catalogSource: entry.source,
    hasOverride: overrideBySlug.has(entry.slug),
    overrideUpdatedAt: overrideBySlug.get(entry.slug)?.updatedAt ?? null,
  }));
}

export async function deleteProjectSkillOverride(projectId: number, slug: string): Promise<void> {
  validateSkillSlug(slug);
  await assertSkillInCatalog(slug);

  const existing = await prisma.projectPlanningSkillOverride.findUnique({
    where: { projectId_slug: { projectId, slug } },
  });
  if (!existing) {
    throw new NotFoundError('Project skill override not found');
  }

  await prisma.projectPlanningSkillOverride.delete({
    where: { projectId_slug: { projectId, slug } },
  });
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
  await assertSkillInCatalog(slug);
  await validateSkillContentForSave(content);

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
  await assertSkillInCatalog(slug);
  await validateSkillContentForSave(content);

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
