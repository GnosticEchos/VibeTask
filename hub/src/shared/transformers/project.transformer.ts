/**
 * Project Transformer
 * 
 * Transforms project data for API responses with consistent formatting.
 */

import type { Project, ProjectUser } from '../../infrastructure/auth/prisma.js';

type ProjectWithRelations = Project & {
  members?: ProjectUser[];
};

export interface ProjectResponse {
  id: number;
  name: string;
  description: string | null;
  prefix: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  lifecycleStatus: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export const transformProject = (project: ProjectWithRelations & { lifecycleStatus?: string }): ProjectResponse => ({
  id: project.id,
  name: project.name,
  description: project.description,
  prefix: project.prefix,
  startDate: null,
  endDate: null,
  status: project.lifecycleStatus === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
  lifecycleStatus: project.lifecycleStatus ?? 'ACTIVE',
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
  ...(project.members && { memberCount: project.members.length }),
});

export const transformProjects = (projects: ProjectWithRelations[]): ProjectResponse[] =>
  projects.map(transformProject);