/**
 * Task Transformer
 * 
 * Transforms task data for API responses with consistent formatting.
 */

import type { Task, User, Project, ProjectColumn } from '../../infrastructure/auth/prisma.js';

type TaskWithRelations = Task & {
  createdBy?: Pick<User, 'id' | 'name' | 'surname'> | null;
  assignee?: Pick<User, 'id' | 'name' | 'surname' | 'avatarUrl'> | null;
  project?: Pick<Project, 'id' | 'name' | 'prefix'> | null;
  column?: Pick<ProjectColumn, 'id' | 'name'> | null;
};

export interface TaskResponse {
  id: number;
  name: string;
  description: string | null;
  order: number;
  identifier: string;
  projectId: number;
  projectColumnId: number | null;
  assigneeId: number | null;
  assigneeApiKeyId: string | null;
  createdById: number;
  relationMode: string | null;
  relationId: number | null;
  parentId: number | null;
  isContainer: boolean;
  planAccepted: boolean;
  subBoardOutlineColor: string | null;
  childCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: number; name: string | null; surname: string | null };
  assignee?: { id: number; name: string | null; surname: string | null; avatarUrl: string | null } | null;
  project?: { id: number; name: string; prefix: string };
  column?: { id: number; name: string };
}

export const transformTask = (task: TaskWithRelations & { 
  _count?: { children: number },
  assigneeApiKeyId?: string | null
}): TaskResponse => ({
  id: task.id,
  name: task.name,
  description: task.description,
  order: task.order,
  identifier: task.identifier,
  projectId: task.projectId,
  projectColumnId: task.projectColumnId,
  assigneeId: task.assigneeId,
  assigneeApiKeyId: task.assigneeApiKeyId ?? null,
  createdById: task.createdById,
  relationMode: task.relationMode,
  relationId: task.relationId,
  parentId: task.parentId,
  isContainer: task.isContainer,
  planAccepted: task.planAccepted,
  subBoardOutlineColor: task.subBoardOutlineColor,
  childCount: task._count?.children ?? 0,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  ...(task.createdBy && {
    createdBy: {
      id: task.createdBy.id,
      name: task.createdBy.name,
      surname: task.createdBy.surname,
    },
  }),
  ...(task.assignee && {
    assignee: {
      id: task.assignee.id,
      name: task.assignee.name,
      surname: task.assignee.surname,
      avatarUrl: task.assignee.avatarUrl,
    },
  }),
  ...(task.project && {
    project: {
      id: task.project.id,
      name: task.project.name,
      prefix: task.project.prefix,
    },
  }),
  ...(task.column && {
    column: {
      id: task.column.id,
      name: task.column.name,
    },
  }),
});

export const transformTasks = (tasks: TaskWithRelations[]): TaskResponse[] =>
  tasks.map(transformTask);