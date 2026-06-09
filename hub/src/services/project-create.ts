/**
 * Shared project creation: templates, columns, prefix uniqueness, lifecycle.
 */
import { prisma } from '../infrastructure/auth/prisma.js';
import { getTemplateById } from '../config/project-templates.js';
import type { ProjectLifecycleStatus } from '../../prisma/generated/prisma/client.js';
import { ConflictError, BadRequestError } from '../infrastructure/http/middleware/error-handler.js';

export type ProjectColumnInput = {
  name: string;
  order?: number;
  color?: string;
  type?: string | null;
  description?: string | null;
  roleType?: string;
};

export type CreateProjectInput = {
  name: string;
  prefix: string;
  description?: string | null;
  columns?: ProjectColumnInput[];
  columnsSpecified?: boolean;
  template?: string;
  settings?: Record<string, unknown>;
  lifecycleStatus?: ProjectLifecycleStatus;
  planningMeta?: Record<string, unknown> | null;
  ownerId: number;
  documents?: Array<{ title: string; content?: string; docType: string }>;
  backlogTasks?: Array<{ name: string; description?: string | null }>;
};

function mapTemplateColumns(templateId: string): ProjectColumnInput[] {
  const tmpl = getTemplateById(templateId);
  if (!tmpl) {
    throw new BadRequestError(`Unknown template: ${templateId}`);
  }
  return tmpl.columns.map((col) => ({
    name: col.name,
    order: col.order,
    color: col.color,
    type: col.type ?? null,
    description: col.description ?? null,
    roleType: col.roleType ?? 'STANDARD',
  }));
}

export function resolveProjectColumnsAndSettings(input: CreateProjectInput): {
  columns: ProjectColumnInput[];
  settings: Record<string, unknown> | undefined;
  templateId: string | null;
} {
  const columnsSpecified = input.columnsSpecified ?? input.columns !== undefined;
  let resolvedColumns = input.columns;
  let resolvedSettings = input.settings;
  let templateId: string | null = input.template ?? null;

  if (input.template) {
    const tmpl = getTemplateById(input.template);
    if (!tmpl) {
      throw new BadRequestError(`Unknown template: ${input.template}`);
    }
    if (!columnsSpecified) {
      resolvedColumns = mapTemplateColumns(input.template);
    }
    resolvedSettings = { ...tmpl.settings, ...input.settings };
    templateId = input.template;
  }

  if (columnsSpecified && input.columns?.length === 0) {
    resolvedColumns = mapTemplateColumns('ADHOC_OPS');
    templateId = templateId ?? 'ADHOC_OPS';
    if (!resolvedSettings) {
      resolvedSettings = { ...getTemplateById('ADHOC_OPS')!.settings };
    }
  }

  if (!columnsSpecified && (!resolvedColumns || resolvedColumns.length === 0)) {
    resolvedColumns = mapTemplateColumns('ADHOC_OPS');
    templateId = templateId ?? 'ADHOC_OPS';
    if (!resolvedSettings) {
      resolvedSettings = { ...getTemplateById('ADHOC_OPS')!.settings };
    }
  }

  if (!resolvedColumns || resolvedColumns.length === 0) {
    throw new BadRequestError('Project must have at least one column');
  }

  return {
    columns: resolvedColumns,
    settings: resolvedSettings,
    templateId,
  };
}

export async function assertPrefixAvailable(prefix: string, excludeProjectId?: number): Promise<void> {
  const existing = await prisma.project.findUnique({ where: { prefix } });
  if (existing && existing.id !== excludeProjectId) {
    throw new ConflictError(`Project prefix "${prefix}" is already in use`);
  }
}

export async function createProjectRecord(input: CreateProjectInput) {
  await assertPrefixAvailable(input.prefix);

  const { columns, settings, templateId } = resolveProjectColumnsAndSettings(input);
  const lifecycleStatus = input.lifecycleStatus ?? 'ACTIVE';

  const planningMeta = {
    ...(input.planningMeta ?? {}),
    ...(templateId ? { templateId } : {}),
  };

  const project = await prisma.project.create({
    data: {
      name: input.name,
      prefix: input.prefix,
      description: input.description ?? null,
      ownerId: input.ownerId,
      lifecycleStatus,
      planningMeta: Object.keys(planningMeta).length > 0 ? (planningMeta as object) : undefined,
      settings: settings as object | undefined,
      members: {
        create: {
          userId: input.ownerId,
          role: 'Owner',
        },
      },
      columns: {
        create: columns.map((col, index) => ({
          name: col.name,
          order: col.order ?? index,
          color: col.color || '#6366f1',
          type: col.type || null,
          description: col.description || null,
          roleType: (col.roleType as 'STANDARD' | 'AGENT_REVIEW' | 'AGENT_ONLY' | 'COMPLETE') || 'STANDARD',
        })),
      },
    },
    include: {
      columns: { orderBy: { order: 'asc' } },
      members: true,
    },
  });

  if (input.documents?.length) {
    for (const doc of input.documents) {
      await prisma.projectDocument.create({
        data: {
          projectId: project.id,
          title: doc.title,
          content: doc.content ?? '',
          docType: doc.docType as 'CONSTITUTION' | 'SPECIFICATION' | 'BRAINSTORM' | 'POST_MORTEM' | 'IMPLEMENTATION_PLAN' | 'OTHER',
          createdById: input.ownerId,
        },
      });
    }
  }

  if (input.backlogTasks?.length) {
    for (const taskInput of input.backlogTasks) {
      const identifier = await generateTaskIdentifier(project.id, project.prefix);
      const maxOrder = await prisma.task.aggregate({
        where: { projectId: project.id, projectColumnId: null },
        _max: { order: true },
      });
      await prisma.task.create({
        data: {
          name: taskInput.name,
          description: taskInput.description ?? null,
          projectId: project.id,
          projectColumnId: null,
          createdById: input.ownerId,
          order: (maxOrder._max.order ?? 0) + 1,
          identifier,
        },
      });
    }
  }

  return project;
}

async function generateTaskIdentifier(projectId: number, prefix: string): Promise<string> {
  const count = await prisma.task.count({ where: { projectId } });
  return `${prefix}-${count + 1}`;
}
