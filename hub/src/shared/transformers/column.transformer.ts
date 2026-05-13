/**
 * Column Transformer
 * 
 * Transforms column data for API responses with consistent formatting.
 */

import type { ProjectColumn, Task } from '../../infrastructure/auth/prisma.js';

type ColumnWithRelations = ProjectColumn & {
  tasks?: Task[];
};

export interface ColumnResponse {
  id: number;
  name: string;
  order: number;
  color: string | null;
  type: string | null;
  description: string | null;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  tasks?: Array<{
    id: number;
    name: string;
    description: string | null;
    order: number;
    identifier: string;
    projectId: number;
    projectColumnId: number | null;
    assigneeId: number | null;
    createdById: number;
    relationMode: string | null;
    relationId: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export const transformColumn = (column: ColumnWithRelations): ColumnResponse => ({
  id: column.id,
  name: column.name,
  order: column.order,
  color: column.color,
  type: column.type,
  description: column.description,
  projectId: column.projectId,
  createdAt: column.createdAt.toISOString(),
  updatedAt: column.updatedAt.toISOString(),
  ...(column.tasks && {
    tasks: column.tasks.map((task: Task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      order: task.order,
      identifier: task.identifier,
      projectId: task.projectId,
      projectColumnId: task.projectColumnId,
      assigneeId: task.assigneeId,
      createdById: task.createdById,
      relationMode: task.relationMode,
      relationId: task.relationId,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
  }),
});

export const transformColumns = (columns: ColumnWithRelations[]): ColumnResponse[] =>
  columns.map(transformColumn);