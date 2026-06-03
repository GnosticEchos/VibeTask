/**
 * Shared project stats aggregation for agent and human summary routes.
 */
import { prisma } from '../infrastructure/auth/prisma.js';

export type SummaryScope = 'main' | 'all' | 'workspace';
export type SummaryIncludeOptions = {
  documents: boolean;
  agentReview: boolean;
  helpRequests: boolean;
  blocked: boolean;
  workspaces: boolean;
  workspacesAll: boolean;
};

export function parseOptionalProjectIdFilter(query: Record<string, unknown>): number | null {
  const raw = query.projectId;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const id = parseInt(String(raw), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function parseSummaryScope(query: Record<string, unknown>): SummaryScope {
  const raw = String(query.scope ?? 'main').toLowerCase();
  if (raw.startsWith('workspace:') || String(query.workspace ?? '').trim().length > 0) {
    return 'workspace';
  }
  return raw === 'all' ? 'all' : 'main';
}

export function parseWorkspaceScopeSelector(query: Record<string, unknown>): string | null {
  const scopeRaw = String(query.scope ?? '').trim();
  if (scopeRaw.toLowerCase().startsWith('workspace:')) {
    const selector = scopeRaw.slice('workspace:'.length).trim();
    return selector.length > 0 ? selector : null;
  }
  const workspaceRaw = String(query.workspace ?? '').trim();
  return workspaceRaw.length > 0 ? workspaceRaw : null;
}

export function parseSummaryIncludeOptions(query: Record<string, unknown>): SummaryIncludeOptions {
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

export function filterSummaryByProjectId<T extends { id: number }>(
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

/** Matches main-board UI: Agent Review column counts all tasks in the column (see boardTaskScope). */
function isAgentReviewColumn(roleType: string | null): boolean {
  return roleType === 'AGENT_REVIEW';
}

export type SummaryProject = {
  id: number;
  name: string;
  prefix: string;
  description: string | null;
};

export async function buildProjectStatsSummary(
  projects: SummaryProject[],
  scope: SummaryScope,
  include: SummaryIncludeOptions,
  workspaceScopeSelector: string | null = null,
) {
  if (projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((project) => project.id);
  const scopeWorkspaceSelector = scope === 'workspace' ? workspaceScopeSelector : null;
  const scopeWorkspaceId = scopeWorkspaceSelector !== null && /^\d+$/.test(scopeWorkspaceSelector)
    ? Number(scopeWorkspaceSelector)
    : null;
  const normalizedWorkspaceSelector = scopeWorkspaceSelector?.toLowerCase() ?? null;
  const workspaceRowsForScope = scopeWorkspaceSelector
    ? await prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          isContainer: true,
        },
        select: { id: true, projectId: true, identifier: true, name: true },
      })
    : [];
  const scopedWorkspaceByProject = new Map<number, number>();
  if (scopeWorkspaceSelector) {
    for (const row of workspaceRowsForScope) {
      const matchById = scopeWorkspaceId !== null && row.id === scopeWorkspaceId;
      const matchByIdentifier =
        normalizedWorkspaceSelector !== null &&
        String(row.identifier ?? '').toLowerCase() === normalizedWorkspaceSelector;
      const matchByName =
        normalizedWorkspaceSelector !== null &&
        String(row.name ?? '').toLowerCase() === normalizedWorkspaceSelector;
      if (matchById || matchByIdentifier || matchByName) {
        scopedWorkspaceByProject.set(row.projectId, row.id);
      }
    }
  }
  const scopedWorkspaceIds = [...new Set(scopedWorkspaceByProject.values())];
  const scopedWorkspaceTaskRows = scopedWorkspaceIds.length > 0
    ? await prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          parentId: { in: scopedWorkspaceIds },
          projectColumnId: { not: null },
        },
        select: { projectId: true, projectColumnId: true, id: true },
      })
    : [];
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
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    include.agentReview
      ? prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            column: { roleType: 'AGENT_REVIEW' },
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

  const workspaceScopeColumnCountMap = new Map<string, number>();
  const workspaceScopeTotalByProject = new Map<number, number>();
  for (const row of scopedWorkspaceTaskRows) {
    if (row.projectColumnId === null) continue;
    const key = projectColumnKey(row.projectId, row.projectColumnId);
    workspaceScopeColumnCountMap.set(key, (workspaceScopeColumnCountMap.get(key) || 0) + 1);
    workspaceScopeTotalByProject.set(row.projectId, (workspaceScopeTotalByProject.get(row.projectId) || 0) + 1);
  }

  return projects.map((project) => {
    const totalTasks = allTaskCountMap.get(project.id) || 0;
    const workspaceChildTasks = workspaceChildCountMap.get(project.id) || 0;
    const workspaceContainers = workspaceContainerCountMap.get(project.id) || 0;
    const cols = columnsByProject.get(project.id) || [];

    const columnSummary = cols.map((col) => {
      const countAll = columnTaskCountAllMap.get(projectColumnKey(project.id, col.id)) || 0;
      const countMain = columnTaskCountMainMap.get(projectColumnKey(project.id, col.id)) || 0;
      const boardMainCount =
        scope === 'main' && isAgentReviewColumn(col.roleType) ? countAll : countMain;
      const workspaceScopedCount = workspaceScopeColumnCountMap.get(projectColumnKey(project.id, col.id)) || 0;
      const scopedMainCount = scope === 'workspace' ? workspaceScopedCount : boardMainCount;
      return {
        id: col.id,
        name: col.name,
        roleType: col.roleType,
        color: col.color,
        taskCount: scope === 'all' ? countAll : scopedMainCount,
        taskCountMain: scopedMainCount,
        taskCountAll: countAll,
      };
    });

    const scopedWorkspaceTotal = workspaceScopeTotalByProject.get(project.id) || 0;
    const mainBoardTasks =
      scope === 'workspace'
        ? scopedWorkspaceTotal
        : scope === 'main'
        ? columnSummary.reduce((sum, col) => sum + col.taskCountMain, 0)
        : mainTaskCountMap.get(project.id) || 0;
    const totalTasksForScope = scope === 'workspace' ? scopedWorkspaceTotal : totalTasks;
    const workspaceChildTasksForScope = scope === 'workspace' ? scopedWorkspaceTotal : workspaceChildTasks;

    const summaryLine = scope === 'workspace'
      ? `${project.name}: ${scopedWorkspaceTotal} tasks in workspace ${scopeWorkspaceSelector}`
      : scope === 'all'
      ? `${project.name}: ${totalTasks} total (${mainBoardTasks} on main board)`
      : `${project.name}: ${mainBoardTasks} on main board, ${totalTasks} total (${workspaceChildTasks} in workspaces)`;

    const projectSummary: Record<string, unknown> = {
      id: project.id,
      name: project.name,
      prefix: project.prefix,
      description: project.description,
      formalityLevel: project.description ? 'FORMAL' : 'LIGHTWEIGHT',
      totalTasks: totalTasksForScope,
      mainBoardTasks,
      workspaceContainers,
      workspaceChildTasks: workspaceChildTasksForScope,
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
      const scopedAgentReviewCount = columnSummary
        .filter((col) => col.roleType === 'AGENT_REVIEW')
        .reduce((sum, col) => sum + col.taskCount, 0);
      projectSummary.agentReview = {
        taskCount: scope === 'workspace' ? scopedAgentReviewCount : (agentReviewCountMap.get(project.id) || 0),
        identifiers: scope === 'workspace' ? [] : (agentReviewIdentifiersMap.get(project.id) || []),
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
