/**
 * Project lifecycle guards and helpers.
 */
import { prisma } from '../infrastructure/auth/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../infrastructure/http/middleware/error-handler.js';
import type { ProjectLifecycleStatus } from '../../prisma/generated/prisma/client.js';

export type ProjectLifecycleRow = {
  id: number;
  lifecycleStatus: ProjectLifecycleStatus;
  ownerId: number;
  planningMeta: unknown;
};

export async function getProjectLifecycle(projectId: number): Promise<ProjectLifecycleRow> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, lifecycleStatus: true, ownerId: true, planningMeta: true },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  return project;
}

export function isDraftProject(project: Pick<ProjectLifecycleRow, 'lifecycleStatus'>): boolean {
  return project.lifecycleStatus === 'DRAFT';
}

export async function assertDraftAllowsTaskCreate(
  projectId: number,
  projectColumnId: number | null | undefined,
): Promise<void> {
  const project = await getProjectLifecycle(projectId);
  if (!isDraftProject(project)) {
    return;
  }
  if (projectColumnId != null) {
    throw new BadRequestError('Cannot assign tasks to columns until the draft project is accepted');
  }
}

export async function assertDelegateAccessToProject(projectId: number): Promise<void> {
  const project = await getProjectLifecycle(projectId);
  if (isDraftProject(project)) {
    throw new ForbiddenError('Delegate agents cannot access draft projects until accepted');
  }
}

export function getPlanningTemplateId(planningMeta: unknown): string | null {
  if (planningMeta == null || typeof planningMeta !== 'object' || Array.isArray(planningMeta)) {
    return null;
  }
  const templateId = (planningMeta as Record<string, unknown>).templateId;
  return typeof templateId === 'string' ? templateId : null;
}

export function excludeDraftProjects<T extends { lifecycleStatus?: ProjectLifecycleStatus }>(
  projects: T[],
  includeDraft: boolean,
): T[] {
  if (includeDraft) {
    return projects;
  }
  return projects.filter((p) => p.lifecycleStatus !== 'DRAFT');
}
