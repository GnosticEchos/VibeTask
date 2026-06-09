/**
 * Agent Projects API Routes
 *
 * List accessible projects for agents and users.
 */

import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import { asyncHandler, UnauthorizedError } from '../../../infrastructure/http/middleware/error-handler.js';
import { requireAgentProjectAccess, ProjectAction } from '../../../infrastructure/auth/agent-permissions.js';
import {
  buildProjectStatsSummary,
  filterSummaryByProjectId,
  parseOptionalProjectIdFilter,
  parseSummaryIncludeOptions,
  parseSummaryScope,
  parseWorkspaceScopeSelector,
} from '../../../services/project-stats-summary.js';

const router = Router();

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

    const includeDraft = String(req.query.includeDraft ?? 'false').toLowerCase() === 'true'
      || String(req.query.include ?? '').split(',').map((t) => t.trim().toLowerCase()).includes('draft');

    const projects = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        ...(includeDraft ? {} : { lifecycleStatus: 'ACTIVE' }),
      },
      select: { id: true, name: true, prefix: true, description: true },
    });
    const query = req.query as Record<string, unknown>;
    const scope = parseSummaryScope(query);
    const workspaceScopeSelector = parseWorkspaceScopeSelector(query);
    const include = parseSummaryIncludeOptions(query);
    const summary = await buildProjectStatsSummary(projects, scope, include, workspaceScopeSelector);
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
          lifecycleStatus: true,
        },
      },
    },
  });

  const includeDraft = String(req.query.includeDraft ?? 'false').toLowerCase() === 'true'
    || String(req.query.include ?? '').split(',').map((t) => t.trim().toLowerCase()).includes('draft');

  const projects = memberships
    .map((membership) => membership.project)
    .filter((p) => includeDraft || p.lifecycleStatus !== 'DRAFT')
    .map((p) => ({
      id: p.id,
      name: p.name,
      prefix: p.prefix,
      description: p.description,
    }));

  const query = req.query as Record<string, unknown>;
  const scope = parseSummaryScope(query);
  const workspaceScopeSelector = parseWorkspaceScopeSelector(query);
  const include = parseSummaryIncludeOptions(query);
  const summary = await buildProjectStatsSummary(projects, scope, include, workspaceScopeSelector);
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
  const workspaceScopeSelector = parseWorkspaceScopeSelector(query);
  const include = parseSummaryIncludeOptions(query);
  const [summary] = await buildProjectStatsSummary([project], scope, include, workspaceScopeSelector);

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
