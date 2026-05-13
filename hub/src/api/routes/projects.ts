/**
 * Projects API Routes
 * 
 * Implements the projects endpoints from the API contract:
 * - GET /api/projects - Get list of user's projects
 * - POST /api/projects - Create a new project
 * - GET /api/projects/:id - Get project data with columns and tasks
 * - GET /api/projects/:id/summary - Get project summary
 * - PATCH /api/projects/:id - Update project data
 * - DELETE /api/projects/:id - Delete a project
 * - GET /api/projects/:id/board - Get complete board data
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateBody, validateParams, validateParamsAndBody, getValidatedParams, getValidatedBody } from '../../infrastructure/http/validation.js';
import { 
  createProjectSchema, 
  patchProjectSchema, 
  projectIdParamSchema 
} from '../../validation/schemas/index.js';
import { 
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  BadRequestError
} from '../../infrastructure/http/middleware/error-handler.js';
import { sanitize } from '../../infrastructure/http/middleware/sanitize.js';
import { transformProject } from '../../shared/transformers/index.js';
import { paginatedResponse } from '../../validation/schemas/common.schemas.js';
import { checkProjectMembership } from '../../infrastructure/auth/project-role-check.js';
import { getTemplateById, listTemplates } from '../../config/project-templates.js';

const router = Router();

// GET /api/projects - Get list of user's projects
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;

  // Get projects where user is a member
  const baseQuery = {
    where: {
      members: {
        some: {
          userId: user.id,
        },
      },
    },
    include: {
      columns: {
        include: {
          tasks: true,
        },
        orderBy: { order: 'asc' as const },
      },
      members: {
        include: {
          user: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  };

  // Parse pagination params from query (always use pagination)
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  // Get total count first
  const total = await prisma.project.count({
    where: baseQuery.where,
  });

  // Get paginated projects
  const projects = await prisma.project.findMany({
    ...baseQuery,
    skip,
    take: limit,
  });

  // Format response
  const formattedProjects = projects.map(project => ({
    id: project.id,
    name: project.name,
    description: project.description,
    prefix: project.prefix,
    ownerId: user.id,
    columns: project.columns.map(col => ({
      id: col.id,
      name: col.name,
      order: col.order,
      color: col.color,
      type: col.type,
      description: col.description,
      tasks: col.tasks,
    })),
    isMember: true,
  }));

  res.json(paginatedResponse(formattedProjects, page, limit, total));
}));

// GET /api/projects/templates - List available project templates
router.get('/templates', requireAuth, asyncHandler(async (req, res) => {
  const templates = listTemplates();
  res.json({ data: templates });
}));

// POST /api/projects - Create a new project
router.post('/', requireAuth, validateBody(createProjectSchema), sanitize(['name', 'description']), asyncHandler(async (req, res) => {
  const user = req.user!;

  const body = getValidatedBody<{ name: string; prefix: string; description?: string; columns?: Array<{ name: string; order?: number; color?: string; type?: string; description?: string }>; template?: string; settings?: Record<string, unknown> }>(req);
  if (!body) {
    return res.status(400).json({ error: 'Missing or invalid body' });
  }
  const { name, prefix, description, columns, template, settings } = body;

  // Resolve template or use explicit columns
  let resolvedColumns = columns;
  let resolvedSettings = settings;

  if (template) {
    const tmpl = getTemplateById(template);
    if (!tmpl) {
      return res.status(400).json({ error: `Unknown template: ${template}` });
    }
    // Template columns take precedence if no explicit columns provided
    if (!resolvedColumns || resolvedColumns.length === 0) {
      resolvedColumns = tmpl.columns.map((col: any) => ({
        name: col.name,
        order: col.order,
        color: col.color,
        type: col.type as string | undefined,
        description: col.description,
      }));
    }
    // Merge template settings with any provided settings (provided wins)
    resolvedSettings = { ...tmpl.settings, ...settings };
  }

  // Use the user's UUID directly (Better Auth compatible)
  const ownerId = user.id;

  // Create project with owner as member
  const project = await prisma.project.create({
    data: {
      name,
      prefix,
      description,
      ownerId,
      settings: resolvedSettings as any,
      members: {
        create: {
          userId: user.id,
          role: 'Owner',
        },
      },
      columns: resolvedColumns ? {
        create: resolvedColumns.map((col: any, index: number) => ({
          name: col.name,
          order: col.order ?? index,
          color: col.color || '#6366f1',
          type: col.type || null,
          description: col.description || null,
          roleType: col.roleType || 'STANDARD',
        })),
      } : undefined,
    },
  });

  res.status(201).json(transformProject(project));
}));

// GET /api/projects/:id - Get project data with columns and tasks
router.get('/:id', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  const projectId = params.id;

  // First check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: {
        include: {
          tasks: {
            include: {
              createdBy: { select: { id: true, name: true, surname: true } },
              assignee: { select: { id: true, name: true, surname: true } },
              _count: { select: { children: true } },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
      members: {
        include: {
          user: { select: { id: true, email: true, name: true, surname: true } },
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Check if user is a member
  const membership = project.members.find(m => m.userId === user.id);

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  res.json({
    id: project.id,
    name: project.name,
    description: project.description,
    prefix: project.prefix,
    role: membership.role,
    userId: user.id,
    members: project.members.map(m => ({
      id: m.user.id,
      email: m.user.email,
    })),
    columns: project.columns.map(col => ({
      id: col.id,
      name: col.name,
      order: col.order,
      color: col.color,
      type: col.type,
      description: col.description,
      tasks: col.tasks.map(task => ({
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
        parentId: task.parentId,
        isContainer: task.isContainer,
        planAccepted: task.planAccepted,
        subBoardOutlineColor: task.subBoardOutlineColor,
        childCount: task._count.children,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        createdBy: task.createdBy,
        assignee: task.assignee,
      })),
    })),
  });
}));

// GET /api/projects/:id/summary - Get project summary
router.get('/:id/summary', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  const projectId = params.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: {
        include: {
          tasks: true,
        },
      },
      members: {
        include: {
          user: { select: { id: true, name: true, surname: true, email: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  res.json({
    projectName: project.name,
    projectDescription: project.description,
    members: project.members.map(m => ({
      id: m.user.id,
      name: `${m.user.name} ${m.user.surname}`,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    })),
    columnSummary: project.columns.map(col => ({
      columnName: col.name,
      totalTasks: col.tasks.length,
    })),
  });
}));

// PATCH /api/projects/:id - Update project
router.patch(
  '/:id', 
  requireAuth,
  validateParamsAndBody(projectIdParamSchema, patchProjectSchema),
  sanitize(['name', 'description']),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const params = getValidatedParams<{ id: number }>(req);
    if (!params) {
      return res.status(400).json({ error: 'Missing or invalid parameters' });
    }
    const projectId = params.id;
    const body = getValidatedBody<{ name?: string; description?: string }>(req);
    if (!body) {
      return res.status(400).json({ error: 'Missing or invalid body' });
    }
    const { name, description } = body;

    // First check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: true,
      },
    });

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Check if user is owner
    const membership = project.members.find(m => m.userId === user.id && m.role === 'Owner');

    if (!membership) {
      throw new ForbiddenError('Only owner can update project');
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
    });

    res.status(200).json(transformProject(updatedProject));
  })
);

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  const projectId = params.id;

  // Check if user is owner
  const membership = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: 'Owner',
    },
  });

  if (!membership) {
    throw new ForbiddenError('Only owner can delete project');
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  res.status(200).json({});
}));

// GET /api/projects/:id/board - Get complete board data
router.get('/:id/board', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  const projectId = params.id;

  // First check if project exists and get data
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: {
        include: {
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, avatarUrl: true } },
              _count: { select: { children: true } },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      },
      members: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Check membership
  const membership = project.members.find(m => m.userId === user.id);

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  const canEdit = ['Owner', 'Maintainer', 'Editor'].includes(membership.role);

  res.json({
    board: {
      id: project.id,
      name: project.name,
      description: project.description,
    },
    columns: project.columns.map(col => ({
      id: col.id,
      name: col.name,
      order: col.order,
      color: col.color,
      type: col.type,
      description: col.description,
      tasks: col.tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description,
        order: task.order,
        identifier: task.identifier,
        assigneeId: task.assigneeId,
        parentId: task.parentId,
        isContainer: task.isContainer,
        planAccepted: task.planAccepted,
        subBoardOutlineColor: task.subBoardOutlineColor,
        childCount: task._count.children,
        assignee: task.assignee,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      })),
    })),
    members: project.members.map(m => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
    })),
    tags: [],
    permissions: {
      canEdit,
      canAddColumn: canEdit,
      canMoveTask: canEdit,
    },
  });
}));

// GET /api/projects/:id/active-workspaces - List container tasks (both accepted and draft)
router.get('/:id/active-workspaces', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const projectId = params.id;

  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const workspaces = await prisma.task.findMany({
    where: {
      projectId,
      isContainer: true,
    },
    select: {
      id: true,
      name: true,
      identifier: true,
      subBoardOutlineColor: true,
      parentId: true,
      planAccepted: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ data: workspaces });
}));

// GET /api/projects/:id/delegates - List agents delegated to this project
router.get('/:id/delegates', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const projectId = params.id;

  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this project');
  }

  const delegations = await prisma.agentDelegation.findMany({
    where: {
      projectId,
      isActive: true,
    },
  });

  // Fetch apiKey names separately
  const apiKeyIds = [...new Set(delegations.map((d) => d.apiKeyId))];
  const apiKeys = await prisma.apikey.findMany({
    where: { id: { in: apiKeyIds } },
    select: { id: true, name: true },
  });
  const apiKeyMap = new Map(apiKeys.map((k) => [k.id, k.name]));

  const delegates = delegations.map((d) => ({
    apiKeyId: d.apiKeyId,
    name: apiKeyMap.get(d.apiKeyId) || 'Agent',
    permissionLevel: d.permissionLevel,
    delegatedAt: d.createdAt.toISOString(),
  }));

  res.json({ data: delegates });
}));

// PATCH /api/projects/:id/settings - Update project settings (Maintainer+)
router.patch('/:id/settings', requireAuth, validateParams(projectIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const projectId = params.id;

  const { membership, hasRole } = await checkProjectMembership(user.id, projectId, 'Maintainer');
  if (!membership || !hasRole) {
    throw new ForbiddenError('Maintainer or Owner role required');
  }

  const settings = req.body;
  if (!settings || typeof settings !== 'object') {
    throw new BadRequestError('Settings body is required');
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { settings },
  });

  res.json({ settings: updated.settings });
}));

export default router;