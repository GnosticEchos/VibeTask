/**
 * Planning preview, accept, and device-code confirmation.
 */
import crypto from 'crypto';
import { prisma } from '../infrastructure/auth/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../infrastructure/http/middleware/error-handler.js';
import { getTemplateById } from '../config/project-templates.js';
import { getPlanningTemplateId, getProjectLifecycle, isDraftProject } from './project-lifecycle.js';

const ACCEPT_SESSION_TTL_MS = 15 * 60 * 1000;

export type PlanningPreview = {
  projectId: number;
  name: string;
  prefix: string;
  description: string | null;
  lifecycleStatus: string;
  templateId: string | null;
  columns: Array<{ id: number; name: string; roleType: string | null; order: number }>;
  documents: Array<{ id: number; title: string; docType: string; contentPreview: string }>;
  backlogCount: number;
  checklist: Array<{ id: string; label: string; passed: boolean }>;
  warnings: string[];
};

function contentPreview(content: string, max = 120): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

/** Fill null column descriptions from the planning template (draft projects only). */
export async function backfillMissingColumnDescriptionsFromTemplate(projectId: number): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { columns: true },
  });
  if (!project || project.lifecycleStatus !== 'DRAFT') {
    return;
  }

  const templateId = getPlanningTemplateId(project.planningMeta);
  if (!templateId) {
    return;
  }
  const template = getTemplateById(templateId);
  if (!template) {
    return;
  }

  const updates = project.columns
    .filter((col) => !col.description?.trim())
    .map((col) => {
      const templateColumn =
        template.columns.find((t) => t.name === col.name) ??
        template.columns.find((t) => t.order === col.order);
      const description = templateColumn?.description?.trim();
      if (!description) {
        return null;
      }
      return prisma.projectColumn.update({
        where: { id: col.id },
        data: { description },
      });
    })
    .filter((op): op is ReturnType<typeof prisma.projectColumn.update> => op != null);

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

export async function buildPlanningPreview(projectId: number): Promise<PlanningPreview> {
  await backfillMissingColumnDescriptionsFromTemplate(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: { orderBy: { order: 'asc' } },
      documents: { orderBy: { updatedAt: 'desc' }, take: 20 },
    },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const backlogCount = await prisma.task.count({
    where: { projectId, projectColumnId: null, archivedAt: null },
  });

  const templateId = getPlanningTemplateId(project.planningMeta);
  const specDoc = project.documents.find((d) => d.docType === 'SPECIFICATION');
  const warnings: string[] = [];

  const duplicatePrefix = await prisma.project.count({
    where: { prefix: project.prefix, id: { not: project.id } },
  });
  if (duplicatePrefix > 0) {
    warnings.push(`Another project uses prefix "${project.prefix}"`);
  }

  const requireSpec = templateId !== 'ADHOC_OPS';
  const columnsHaveDescriptions =
    project.columns.length > 0 &&
    project.columns.every((col) => Boolean(col.description?.trim()));
  const checklist = [
    { id: 'owner', label: 'Project has a name and prefix', passed: Boolean(project.name && project.prefix) },
    { id: 'columns', label: 'At least one board column', passed: project.columns.length > 0 },
    {
      id: 'column-descriptions',
      label: 'Column descriptions set (agent persona context)',
      passed: columnsHaveDescriptions,
    },
    {
      id: 'spec',
      label: requireSpec ? 'Specification document present' : 'Specification optional (ad-hoc template)',
      passed: requireSpec ? Boolean(specDoc) : true,
    },
  ];

  const missingDescriptionCount = project.columns.filter((col) => !col.description?.trim()).length;
  if (missingDescriptionCount > 0) {
    warnings.push(
      `${missingDescriptionCount} column(s) missing descriptions — column-gated agents use these for persona context`,
    );
  }

  return {
    projectId: project.id,
    name: project.name,
    prefix: project.prefix,
    description: project.description,
    lifecycleStatus: project.lifecycleStatus,
    templateId,
    columns: project.columns.map((c) => ({
      id: c.id,
      name: c.name,
      roleType: c.roleType,
      order: c.order,
    })),
    documents: project.documents.map((d) => ({
      id: d.id,
      title: d.title,
      docType: d.docType,
      contentPreview: contentPreview(d.content),
    })),
    backlogCount,
    checklist,
    warnings,
  };
}

function assertChecklistPassed(preview: PlanningPreview): void {
  const failed = preview.checklist.filter((item) => !item.passed);
  if (failed.length > 0) {
    throw new BadRequestError(
      `Accept checklist failed: ${failed.map((f) => f.label).join('; ')}`,
    );
  }
}

export async function acceptDraftProject(projectId: number, userId: number) {
  const project = await getProjectLifecycle(projectId);
  if (!isDraftProject(project)) {
    throw new BadRequestError('Project is not in draft status');
  }
  if (project.ownerId !== userId) {
    throw new ForbiddenError('Only the project owner can accept a draft project');
  }

  const preview = await buildPlanningPreview(projectId);
  assertChecklistPassed(preview);

  return prisma.project.update({
    where: { id: projectId },
    data: { lifecycleStatus: 'ACTIVE' },
    include: { columns: { orderBy: { order: 'asc' } } },
  });
}

function generateUserCode(): string {
  const chars = 'BCDFGHJKLMNPQRSTVWXZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

export async function initProjectAcceptSession(projectId: number, userId: number) {
  const project = await getProjectLifecycle(projectId);
  if (!isDraftProject(project)) {
    throw new BadRequestError('Project is not in draft status');
  }

  const challenge = crypto
    .createHmac('sha256', process.env.BETTER_AUTH_SECRET || 'dev-accept-secret')
    .update(JSON.stringify({ action: 'accept', projectId, userId, nonce: crypto.randomUUID() }))
    .digest('hex');

  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + ACCEPT_SESSION_TTL_MS);

  await prisma.projectAcceptSession.create({
    data: {
      projectId,
      userId,
      userCode: userCode.replace('-', ''),
      challenge,
      expiresAt,
    },
  });

  const displayCode = userCode;
  const baseUrl = process.env.DEVELOPMENT_FE_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:4000';

  return {
    verificationUrl: `${baseUrl}/dashboard/settings/project?acceptProject=${projectId}`,
    userCode: displayCode,
    expiresAt: expiresAt.toISOString(),
    projectId,
  };
}

export async function confirmProjectAcceptByCode(projectId: number, userId: number, userCode: string) {
  const normalized = userCode.replace(/-/g, '').toUpperCase();
  const session = await prisma.projectAcceptSession.findFirst({
    where: {
      projectId,
      userId,
      userCode: normalized,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!session) {
    throw new BadRequestError('Invalid or expired accept code');
  }

  const project = await acceptDraftProject(projectId, userId);

  await prisma.projectAcceptSession.update({
    where: { id: session.id },
    data: { consumedAt: new Date() },
  });

  return { project, nextSteps: ['create_delegate_agent'] as const };
}

export async function confirmProjectAcceptFromBrowser(projectId: number, userId: number) {
  const project = await acceptDraftProject(projectId, userId);
  return { project, nextSteps: ['create_delegate_agent'] as const };
}
