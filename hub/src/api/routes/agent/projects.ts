/**
 * Agent Projects API Routes
 *
 * List accessible projects for agents and users.
 */

import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import { asyncHandler, UnauthorizedError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requireAgentProjectAccess, ProjectAction } from '../../../infrastructure/auth/agent-permissions.js';

const router = Router();

function parseOptionalProjectIdFilter(query: Record<string, unknown>): number | null {
  const raw = query.projectId;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const id = parseInt(String(raw), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function filterSummaryByProjectId<T extends { id: number }>(
  items: T[],
  projectId: number | null,
): T[] {
  if (projectId === null) {
    return items;
  }
  return items.filter((item) => item.id === projectId);
}

// GET /api/agent/projects - List accessible projects
router.get('/', asyncHandler(async (req, res) => {
  const auth = (req as any).auth;

  if (!auth) {
    throw new UnauthorizedError('Unauthorized');
  }

  if (auth.type === 'agent') {
    const projects =
      auth.delegations?.map((d: any) => ({
        id: d.project.id,
        name: d.project.name,
        prefix: d.project.prefix,
        permissionLevel: d.permissionLevel,
        delegationMode: d.delegationMode,
        restrictedColumnId: d.restrictedColumnId,
        allowedMoveRange: d.allowedMoveRange,
        isActive: d.isActive,
        delegatedAt: d.createdAt,
      })) || [];

    return res.json({ projects });
  }

  // Regular user - return their projects
  const memberships = await prisma.projectUser.findMany({
    where: { userId: auth.user.id },
    include: { project: true },
  });

  const projects = memberships.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    role: m.role,
  }));

  return res.json({ projects });
}));

// GET /api/agent/projects/summary - List lightweight summaries for accessible projects
// NOTE: This route MUST be defined before /:projectId to avoid "summary" being matched as a projectId
router.get('/summary', asyncHandler(async (req, res) => {
  const auth = (req as any).auth;

  if (!auth) {
    throw new UnauthorizedError('Unauthorized');
  }

  if (auth.type === 'agent') {
    const projectIds = (auth.delegations || [])
      .filter((d: any) => d.isActive)
      .map((d: any) => d.projectId);

    if (projectIds.length === 0) {
      return res.json({ projects: [] });
    }

    const [projects, taskCounts, columnData] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, prefix: true, description: true },
      }),
      prisma.task.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      prisma.projectColumn.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, name: true, roleType: true, projectId: true, order: true },
        orderBy: { order: 'asc' },
      }),
    ]);

    const taskCountMap = new Map(taskCounts.map((row) => [row.projectId, row._count._all]));
    const columnsByProject = new Map<number, { id: number; name: string; roleType: string | null }[]>();
    for (const col of columnData) {
      const list = columnsByProject.get(col.projectId) || [];
      list.push({ id: col.id, name: col.name, roleType: col.roleType });
      columnsByProject.set(col.projectId, list);
    }

    const summary = await Promise.all(projects.map(async (project) => {
      const cols = columnsByProject.get(project.id) || [];
      const colIds = cols.map((c) => c.id);
      const taskCountsByCol = colIds.length > 0
        ? await prisma.task.groupBy({
            by: ['projectColumnId'],
            where: { projectId: project.id, projectColumnId: { in: colIds } },
            _count: { _all: true },
          })
        : [];
      const taskCountByColMap = new Map(taskCountsByCol.map((r) => [r.projectColumnId, r._count._all]));
      const columnSummary = cols.map((col) => ({
        id: col.id,
        name: col.name,
        roleType: col.roleType,
        taskCount: taskCountByColMap.get(col.id) || 0,
      }));

      return {
        id: project.id,
        name: project.name,
        prefix: project.prefix,
        formalityLevel: project.description ? 'FORMAL' : 'LIGHTWEIGHT',
        totalTasks: taskCountMap.get(project.id) || 0,
        columns: columnSummary,
        activeSprints: 0,
      };
    }));

    const projectIdFilter = parseOptionalProjectIdFilter(req.query as Record<string, unknown>);
    return res.json({ projects: filterSummaryByProjectId(summary, projectIdFilter) });
  }

  const memberships = await prisma.projectUser.findMany({
    where: { userId: auth.user.id },
    select: {
      projectId: true,
      project: {
        select: {
          id: true,
          name: true,
          prefix: true,
          description: true,
        },
      },
    },
  });

  const projectIds = memberships.map((m) => m.projectId);
  const [taskCounts, columnData] = await Promise.all([
    projectIds.length > 0
      ? prisma.task.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        })
      : [],
    projectIds.length > 0
      ? prisma.projectColumn.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true, name: true, roleType: true, projectId: true, order: true },
          orderBy: { order: 'asc' },
        })
      : [],
  ]);

  const taskCountMap = new Map(taskCounts.map((row) => [row.projectId, row._count._all]));
  const columnsByProject = new Map<number, { id: number; name: string; roleType: string | null }[]>();
  for (const col of columnData) {
    const list = columnsByProject.get(col.projectId) || [];
    list.push({ id: col.id, name: col.name, roleType: col.roleType });
    columnsByProject.set(col.projectId, list);
  }

  const summary = await Promise.all(memberships.map(async (membership) => {
    const cols = columnsByProject.get(membership.project.id) || [];
    const colIds = cols.map((c) => c.id);
    const taskCountsByCol = colIds.length > 0
      ? await prisma.task.groupBy({
          by: ['projectColumnId'],
          where: { projectId: membership.project.id, projectColumnId: { in: colIds } },
          _count: { _all: true },
        })
      : [];
    const taskCountByColMap = new Map(taskCountsByCol.map((r) => [r.projectColumnId, r._count._all]));
    const columnSummary = cols.map((col) => ({
      id: col.id,
      name: col.name,
      roleType: col.roleType,
      taskCount: taskCountByColMap.get(col.id) || 0,
    }));

    return {
      id: membership.project.id,
      name: membership.project.name,
      prefix: membership.project.prefix,
      formalityLevel: membership.project.description ? 'FORMAL' : 'LIGHTWEIGHT',
      totalTasks: taskCountMap.get(membership.project.id) || 0,
      columns: columnSummary,
      activeSprints: 0,
    };
  }));

  const projectIdFilter = parseOptionalProjectIdFilter(req.query as Record<string, unknown>);
  return res.json({ projects: filterSummaryByProjectId(summary, projectIdFilter) });
}));

// GET /api/agent/projects/:projectId - Get single project
// NOTE: This route MUST be defined AFTER /summary to avoid "summary" being matched as a projectId
router.get('/:projectId', requireAgentProjectAccess(ProjectAction.VIEW_PROJECT), asyncHandler(async (req, res) => {
  const auth = (req as any).auth;
  const projectId = parseInt(String(req.params.projectId), 10);

  if (!auth) {
    throw new UnauthorizedError('Unauthorized');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      prefix: true,
      ownerId: true,
      columns: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          order: true,
          color: true,
          type: true,
          roleType: true,
          description: true,
        },
      },
    },
  });

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ project });
}));

export default router;
