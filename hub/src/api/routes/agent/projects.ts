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

type SummaryScope = 'main' | 'all';
type SummaryIncludeOptions = {
  documents: boolean;
  agentReview: boolean;
  helpRequests: boolean;
  blocked: boolean;
  workspaces: boolean;
  workspacesAll: boolean;
};

function parseOptionalProjectIdFilter(query: Record<string, unknown>): number | null {
  const raw = query.projectId;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const id = parseInt(String(raw), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseSummaryScope(query: Record<string, unknown>): SummaryScope {
  const raw = String(query.scope ?? 'main').toLowerCase();
  return raw === 'all' ? 'all' : 'main';
}

function parseSummaryIncludeOptions(query: Record<string, unknown>): SummaryIncludeOptions {
  const includeRaw = String(query.include ?? '');
  const includeTokens = includeRaw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const includeSet = new Set(includeTokens);
  const includeEverything = includeSet.has('all');
  const listWorkspaces = String(query.listWorkspaces ?? 'false').toLowerCase() === 'true';
  const workspacesAll = includeSet.has('workspaces:all');
  const workspaces = includeSet.has('workspaces') || workspacesAll || listWorkspaces;

  return {
    documents: includeEverything || includeSet.has('documents'),
    agentReview: includeEverything || includeSet.has('agentReview'),
    helpRequests: includeEverything || includeSet.has('helpRequests'),
    blocked: includeEverything || includeSet.has('blocked'),
    workspaces,
    workspacesAll,
  };
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

function projectColumnKey(projectId: number, projectColumnId: number): string {
  return `${projectId}:${projectColumnId}`;
}

type SummaryProject = {
  id: number;
  name: string;
  prefix: string;
  description: string | null;
};

async function buildProjectStatsSummary(
  projects: SummaryProject[],
  scope: SummaryScope,
  include: SummaryIncludeOptions,
) {
  if (projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((project) => project.id);
  const [
    allTaskCounts,
    mainTaskCounts,
    workspaceChildTaskCounts,
    workspaceContainerCounts,
    columnData,
    columnTaskCountsAll,
    columnTaskCountsMain,
    documentCountsByProject,
    documentCountsByType,
    blockedCountsByProject,
    helpRequestRows,
    agentReviewTaskCounts,
    agentReviewIdentifierRows,
    workspaceContainerRows,
    workspaceChildCountsByContainer,
  ] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, parentId: null },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, parentId: { not: null } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, isContainer: true },
      _count: { _all: true },
    }),
    prisma.projectColumn.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, name: true, roleType: true, color: true, projectId: true, order: true },
      orderBy: [{ projectId: 'asc' }, { order: 'asc' }],
    }),
    prisma.task.groupBy({
      by: ['projectId', 'projectColumnId'],
      where: { projectId: { in: projectIds }, projectColumnId: { not: null } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['projectId', 'projectColumnId'],
      where: { projectId: { in: projectIds }, projectColumnId: { not: null }, parentId: null },
      _count: { _all: true },
    }),
    include.documents
      ? prisma.projectDocument.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    include.documents
      ? prisma.projectDocument.groupBy({
          by: ['projectId', 'docType'],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    include.blocked
      ? prisma.task.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds }, relationMode: 'blocked-by', relationId: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    include.helpRequests
      ? prisma.taskComment.findMany({
          where: {
            content: { contains: '🆘 **Help Request (' },
            task: { projectId: { in: projectIds } },
          },
          select: { task: { select: { projectId: true } } },
        })
      : Promise.resolve([]),
    include.agentReview
      ? prisma.task.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projectIds },
            column: { roleType: 'AGENT_REVIEW' },
            ...(scope === 'main' ? { parentId: null } : {}),
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    include.agentReview
      ? prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            column: { roleType: 'AGENT_REVIEW' },
            ...(scope === 'main' ? { parentId: null } : {}),
          },
          select: { projectId: true, identifier: true, id: true },
          orderBy: { id: 'desc' },
        })
      : Promise.resolve([]),
    include.workspaces
      ? prisma.task.findMany({
          where: { projectId: { in: projectIds }, isContainer: true },
          select: { id: true, projectId: true, identifier: true, name: true },
          orderBy: [{ projectId: 'asc' }, { id: 'desc' }],
        })
      : Promise.resolve([]),
    include.workspaces
      ? prisma.task.groupBy({
          by: ['parentId'],
          where: { projectId: { in: projectIds }, parentId: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const allTaskCountMap = new Map(allTaskCounts.map((row) => [row.projectId, row._count._all]));
  const mainTaskCountMap = new Map(mainTaskCounts.map((row) => [row.projectId, row._count._all]));
  const workspaceChildCountMap = new Map(workspaceChildTaskCounts.map((row) => [row.projectId, row._count._all]));
  const workspaceContainerCountMap = new Map(workspaceContainerCounts.map((row) => [row.projectId, row._count._all]));
  const blockedCountMap = new Map(blockedCountsByProject.map((row) => [row.projectId, row._count._all]));
  const documentCountMap = new Map(documentCountsByProject.map((row) => [row.projectId, row._count._all]));
  const agentReviewCountMap = new Map(agentReviewTaskCounts.map((row) => [row.projectId, row._count._all]));

  const columnsByProject = new Map<number, { id: number; name: string; roleType: string | null; color: string | null }[]>();
  for (const col of columnData) {
    const list = columnsByProject.get(col.projectId) || [];
    list.push({ id: col.id, name: col.name, roleType: col.roleType, color: col.color });
    columnsByProject.set(col.projectId, list);
  }

  const columnTaskCountAllMap = new Map<string, number>();
  for (const row of columnTaskCountsAll) {
    if (row.projectColumnId === null) continue;
    columnTaskCountAllMap.set(projectColumnKey(row.projectId, row.projectColumnId), row._count._all);
  }

  const columnTaskCountMainMap = new Map<string, number>();
  for (const row of columnTaskCountsMain) {
    if (row.projectColumnId === null) continue;
    columnTaskCountMainMap.set(projectColumnKey(row.projectId, row.projectColumnId), row._count._all);
  }

  const documentByTypeMap = new Map<number, Record<string, number>>();
  for (const row of documentCountsByType) {
    const byType = documentByTypeMap.get(row.projectId) || {};
    byType[row.docType] = row._count._all;
    documentByTypeMap.set(row.projectId, byType);
  }

  const helpRequestCountMap = new Map<number, number>();
  for (const row of helpRequestRows) {
    const projectId = row.task.projectId;
    helpRequestCountMap.set(projectId, (helpRequestCountMap.get(projectId) || 0) + 1);
  }

  const agentReviewIdentifiersMap = new Map<number, string[]>();
  for (const row of agentReviewIdentifierRows) {
    const list = agentReviewIdentifiersMap.get(row.projectId) || [];
    if (list.length < 5) {
      list.push(row.identifier);
      agentReviewIdentifiersMap.set(row.projectId, list);
    }
  }

  const workspaceChildByParentMap = new Map<number, number>();
  for (const row of workspaceChildCountsByContainer) {
    if (row.parentId === null) continue;
    workspaceChildByParentMap.set(row.parentId, row._count._all);
  }

  const workspaceItemsByProject = new Map<number, { id: number; identifier: string; title: string; childCount: number }[]>();
  for (const row of workspaceContainerRows) {
    const list = workspaceItemsByProject.get(row.projectId) || [];
    list.push({
      id: row.id,
      identifier: row.identifier,
      title: row.name,
      childCount: workspaceChildByParentMap.get(row.id) || 0,
    });
    workspaceItemsByProject.set(row.projectId, list);
  }

  return projects.map((project) => {
    const totalTasks = allTaskCountMap.get(project.id) || 0;
    const mainBoardTasks = mainTaskCountMap.get(project.id) || 0;
    const workspaceChildTasks = workspaceChildCountMap.get(project.id) || 0;
    const workspaceContainers = workspaceContainerCountMap.get(project.id) || 0;
    const cols = columnsByProject.get(project.id) || [];

    const columnSummary = cols.map((col) => {
      const countAll = columnTaskCountAllMap.get(projectColumnKey(project.id, col.id)) || 0;
      const countMain = columnTaskCountMainMap.get(projectColumnKey(project.id, col.id)) || 0;
      return {
        id: col.id,
        name: col.name,
        roleType: col.roleType,
        color: col.color,
        taskCount: scope === 'all' ? countAll : countMain,
        taskCountMain: countMain,
        taskCountAll: countAll,
      };
    });

    const summaryLine = scope === 'all'
      ? `${project.name}: ${totalTasks} total (${mainBoardTasks} on main board)`
      : `${project.name}: ${mainBoardTasks} on main board, ${totalTasks} total (${workspaceChildTasks} in workspaces)`;

    const projectSummary: Record<string, unknown> = {
      id: project.id,
      name: project.name,
      prefix: project.prefix,
      formalityLevel: project.description ? 'FORMAL' : 'LIGHTWEIGHT',
      totalTasks,
      mainBoardTasks,
      workspaceContainers,
      workspaceChildTasks,
      columns: columnSummary,
      activeSprints: 0,
      summaryLine,
    };

    if (include.documents) {
      projectSummary.documents = {
        total: documentCountMap.get(project.id) || 0,
        byType: documentByTypeMap.get(project.id) || {},
      };
    }

    if (include.agentReview) {
      projectSummary.agentReview = {
        taskCount: agentReviewCountMap.get(project.id) || 0,
        identifiers: agentReviewIdentifiersMap.get(project.id) || [],
      };
    }

    if (include.helpRequests) {
      projectSummary.helpRequests = { open: helpRequestCountMap.get(project.id) || 0 };
    }

    if (include.blocked) {
      projectSummary.blocked = { taskCount: blockedCountMap.get(project.id) || 0 };
    }

    if (include.workspaces) {
      const items = workspaceItemsByProject.get(project.id) || [];
      items.sort((a, b) => b.childCount - a.childCount || a.id - b.id);
      projectSummary.workspaces = {
        activeCount: workspaceContainers,
        items: include.workspacesAll ? items : items.slice(0, 5),
      };
    }

    return projectSummary;
  });
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

    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true, prefix: true, description: true },
    });
    const query = req.query as Record<string, unknown>;
    const scope = parseSummaryScope(query);
    const include = parseSummaryIncludeOptions(query);
    const summary = await buildProjectStatsSummary(projects, scope, include);
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

  const projects = memberships.map((membership) => ({
    id: membership.project.id,
    name: membership.project.name,
    prefix: membership.project.prefix,
    description: membership.project.description,
  }));

  const query = req.query as Record<string, unknown>;
  const scope = parseSummaryScope(query);
  const include = parseSummaryIncludeOptions(query);
  const summary = await buildProjectStatsSummary(projects, scope, include);
  const projectIdFilter = parseOptionalProjectIdFilter(req.query as Record<string, unknown>);
  return res.json({ projects: filterSummaryByProjectId(summary, projectIdFilter) });
}));

// GET /api/agent/projects/:projectId/summary - Single-project lightweight summary
router.get('/:projectId/summary', requireAgentProjectAccess(ProjectAction.VIEW_PROJECT), asyncHandler(async (req, res) => {
  const auth = (req as any).auth;
  const projectId = parseInt(String(req.params.projectId), 10);

  if (!auth) {
    throw new UnauthorizedError('Unauthorized');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, prefix: true, description: true },
  });

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const query = req.query as Record<string, unknown>;
  const scope = parseSummaryScope(query);
  const include = parseSummaryIncludeOptions(query);
  const [summary] = await buildProjectStatsSummary([project], scope, include);

  return res.json({ project: summary });
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
