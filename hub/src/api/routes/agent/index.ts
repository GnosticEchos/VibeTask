/**
 * Agent API Routes
 *
 * Agent-scoped endpoints for safe agent operations.
 * All routes require authentication (either user or agent).
 */

import { Router } from 'express';
import { unifiedAuthMiddleware } from '../../../infrastructure/auth/unified-auth.js';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import { requireAgentProjectAccess, ProjectAction } from '../../../infrastructure/auth/agent-permissions.js';
import { attachOptionalPlatformSession, requirePlatformSession } from '../../../infrastructure/http/middleware/platform-session.js';
import projectsRouter from './projects.js';
import projectDraftRouter from './project-draft.js';
import agentPlanningSkillsRouter from './planning-skills.js';
import agentProjectPlanningRouter from './project-planning.js';
import tasksRouter from './tasks.js';
import commentsRouter from './comments.js';
import documentsRouter from './documents.js';
import docLinksRouter from './doc-links.js';
import helpRequestsRouter from './help-requests.js';
import sessionRouter from './session.js';
import myAgentsRouter from './my-agents.js';
import {
  getAllowedReadEndpoints,
  getEffectiveAllowedReadEndpoints,
  isPlatformAgentMetadata,
  parseAgentKeyMetadata,
  platformAgentReadEndpointAllowed,
} from '../../../infrastructure/auth/agent-key-metadata.js';
import { transformTasks } from '../../../shared/transformers/index.js';
import { asyncHandler, BadRequestError, NotFoundError } from '../../../infrastructure/http/middleware/error-handler.js';


const router = Router();
const PLATFORM_AGENT_ALWAYS_ALLOWED_READ_ENDPOINTS = ['/api/agent/health', '/api/agent/me'] as const;

// All agent routes require authentication
router.use(unifiedAuthMiddleware);
router.use(attachOptionalPlatformSession);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', scope: 'agent' });
});

router.use(async (req, res, next) => {
  try {
  const auth = (req as any).auth;
  if (!auth || auth.type !== 'agent') {
    return next();
  }

  const key = await prisma.apikey.findUnique({
    where: { id: auth.agent?.apiKeyId },
    select: { metadata: true },
  });

  console.assert(key, 'Agent key not found');
  console.assert(key?.metadata, 'Agent metadata missing');

  if (!key || !isPlatformAgentMetadata(key.metadata)) {
    return next();
  }

  // Allow session endpoint for platform agents (POST to create JWT)
  if (req.path === '/session' || req.path === '/session/') {
    return next();
  }

  // Platform agent draft create + planning accept/preview (requires platform session on route)
  if (
    req.method === 'POST' &&
    (req.path === '/projects/draft' || req.path === '/projects/draft/')
  ) {
    return next();
  }
  if (req.path.startsWith('/planning/')) {
    return next();
  }

  if (req.method !== 'GET') {
    return res.status(403).json({ error: 'Platform agents are read-only' });
  }

  const requestPath = `/api/agent${req.path}`;
  if (PLATFORM_AGENT_ALWAYS_ALLOWED_READ_ENDPOINTS.includes(requestPath as (typeof PLATFORM_AGENT_ALWAYS_ALLOWED_READ_ENDPOINTS)[number])) {
    return next();
  }

  const allowed = getEffectiveAllowedReadEndpoints(key.metadata);
  const allowedMatch = platformAgentReadEndpointAllowed(allowed, requestPath);
  if (!allowedMatch) {
    return res.status(403).json({ error: 'Endpoint not allowed for this platform agent' });
  }

  return next();
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
  const auth = (req as any).auth;
  if (!auth || auth.type !== 'agent') {
    return res.status(403).json({ error: 'Agent authentication required' });
  }

  const key = await prisma.apikey.findUnique({
    where: { id: auth.agent?.apiKeyId },
    select: {
      id: true,
      name: true,
      referenceId: true,
      createdAt: true,
      expiresAt: true,
      metadata: true,
    },
  });

  if (!key) {
    return res.status(404).json({ error: 'Agent key not found' });
  }

  const delegations = await prisma.agentDelegation.findMany({
    where: { apiKeyId: key.id, isActive: true },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          prefix: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const configuredReadEndpoints = getAllowedReadEndpoints(key.metadata);
  const metadata = parseAgentKeyMetadata(key.metadata);
  const isPlatformAgent = isPlatformAgentMetadata(key.metadata);
  const alwaysAllowedReadEndpoints = isPlatformAgent ? [...PLATFORM_AGENT_ALWAYS_ALLOWED_READ_ENDPOINTS] : [];

  return res.json({
    agent: {
      id: key.id,
      name: key.name || auth.agent?.name || 'Agent',
      ownerId: Number(key.referenceId),
      createdAt: key.createdAt.toISOString(),
      expiresAt: key.expiresAt?.toISOString() ?? null,
      metadata,
    },
    delegations: delegations.map((delegation) => ({
      projectId: delegation.projectId,
      projectName: delegation.project.name,
      projectPrefix: delegation.project.prefix,
      permissionLevel: delegation.permissionLevel,
      delegationMode: delegation.delegationMode,
      restrictedColumnId: delegation.restrictedColumnId,
      allowedMoveRange: delegation.allowedMoveRange,
      delegatedAt: delegation.createdAt.toISOString(),
      columnAllowance: {
        mode: delegation.delegationMode,
        restrictedColumnId: delegation.delegationMode === 'COLUMN_BOUND' ? (delegation.restrictedColumnId ?? undefined) : undefined,
        allowedMoveRange: delegation.allowedMoveRange,
        canViewAllColumns: delegation.delegationMode !== 'COLUMN_BOUND',
        canMoveAnywhere: delegation.delegationMode !== 'COLUMN_BOUND',
        canHandoffToReview: true,
      },
    })),
    apiAllowance: {
      isPlatformAgent,
      readOnly: isPlatformAgent,
      alwaysAllowedReadEndpoints,
      configuredReadEndpoints,
      effectiveReadEndpoints: Array.from(new Set([
        ...alwaysAllowedReadEndpoints,
        ...(isPlatformAgent
          ? getEffectiveAllowedReadEndpoints(key.metadata)
          : configuredReadEndpoints),
      ])),
      usesDefaultScoutReadEndpoints: isPlatformAgent && configuredReadEndpoints.length === 0,
    },
  });
  } catch (err) {
    next(err);
  }
});

/**
 * After bulk imports / CSV restores, SERIAL sequences can lag behind MAX(id).
 * Without this, the next DEFAULT insert reuses an existing id and fails with P2002.
 */
async function syncProjectColumnIdSequence(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public."ProjectColumn"', 'id')::regclass,
        (SELECT COALESCE(MAX("id"), 1) FROM "ProjectColumn")
      )
    `);
  } catch {
    // Best-effort; explicit-id creates still avoid the immediate collision.
  }
}

/**
 * Ensure an Agent Review column exists for a project.
 * Creates one if it doesn't exist.
 */
export async function ensureAgentReviewColumn(projectId: number) {
  // Check if review column exists
  const reviewColumn = await prisma.projectColumn.findFirst({
    where: {
      projectId,
      roleType: 'AGENT_REVIEW',
    },
  });

  if (reviewColumn) {
    return reviewColumn;
  }

  // Get max order for new column placement
  const maxOrder = await prisma.projectColumn.findFirst({
    where: { projectId },
    orderBy: { order: 'desc' },
  });

  const maxIdAgg = await prisma.projectColumn.aggregate({
    _max: { id: true },
  });
  const nextId = (maxIdAgg._max.id ?? 0) + 1;

  try {
    const created = await prisma.projectColumn.create({
      data: {
        id: nextId,
        name: 'Agent Review', // Default name, user can change later
        projectId,
        roleType: 'AGENT_REVIEW',
        order: (maxOrder?.order || 0) + 1,
        color: '#FFA500', // Orange for visibility
        description: 'Tasks flagged by agents for human review',
      },
    });
    await syncProjectColumnIdSequence();
    return created;
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : null;
    if (code === 'P2002') {
      const again = await prisma.projectColumn.findFirst({
        where: { projectId, roleType: 'AGENT_REVIEW' },
      });
      if (again) return again;
    }
    throw e;
  }
}

// Register sub-routers
router.use('/session', sessionRouter);
router.use('/my-agents', myAgentsRouter);
router.use('/planning', agentPlanningSkillsRouter);
router.use('/planning', agentProjectPlanningRouter);
router.use('/projects', projectDraftRouter);
router.use('/projects', projectsRouter);
router.use('/projects/:projectId/tasks', tasksRouter);
router.use('/projects/:projectId/tasks/:taskId/comments', commentsRouter);
router.use('/projects/:projectId/docs', documentsRouter);
router.use('/projects/:projectId/tasks/:taskId/doc-links', docLinksRouter);
router.use('/projects/:projectId/help-requests', helpRequestsRouter);

// Backward-compatible doc-link creation via body-based taskId (used by VibeTools client)
router.post('/projects/:projectId/doc-links',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.LINK_DOC),
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string, 10);
    const body = req.body || {};

    // Accept both naming conventions (VibeTools uses docId/document_id, backend uses documentId)
    const taskIdVal = body.taskId ?? body.task_id ?? body.taskid;
    const documentIdVal = body.documentId ?? body.docId ?? body.document_id ?? body.doc_id;
    let roleVal = body.role ?? body.linkType ?? body.link_type ?? body.roleType ?? 'REFERENCE';

    // Normalize role values from VibeTools naming to Prisma DocLinkRole enum
    const roleMap: Record<string, string> = {
      'attached': 'ATTACHMENT',
      'work_log': 'REFERENCE',
      'specification': 'SPECIFICATION',
      'implementation_plan': 'IMPLEMENTATION_PLAN',
      'reference': 'REFERENCE',
      'attachment': 'ATTACHMENT',
    };
    roleVal = roleMap[String(roleVal).toLowerCase()] || roleVal;

    if (!taskIdVal || !documentIdVal) {
      throw new BadRequestError('taskId and documentId are required');
    }

    // Parse task ID (supports compound "projectId-taskId" format or plain number)
    const taskId = typeof taskIdVal === 'string' && String(taskIdVal).includes('-')
      ? parseInt(String(taskIdVal).split('-').pop()!, 10)
      : typeof taskIdVal === 'number' ? taskIdVal : parseInt(String(taskIdVal), 10);
    const documentId = typeof documentIdVal === 'number' ? documentIdVal : parseInt(String(documentIdVal), 10);

    if (isNaN(taskId) || isNaN(documentId)) {
      throw new BadRequestError('Invalid taskId or documentId');
    }

    // Verify task exists and belongs to project
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundError('Task');

    // Verify document exists and belongs to project
    const document = await prisma.projectDocument.findFirst({
      where: { id: documentId, projectId },
      select: { id: true },
    });
    if (!document) throw new NotFoundError('Document');

    const docLink = await prisma.taskDocumentLink.upsert({
      where: { taskId_documentId: { taskId, documentId } },
      create: {
        projectId,
        taskId,
        documentId,
        role: roleVal as any || 'REFERENCE',
      },
      update: {
        role: roleVal as any || 'REFERENCE',
      },
      include: {
        document: { select: { id: true, title: true, docType: true, version: true } },
      },
    });

    res.status(201).json({ data: docLink });
  })
);

// Backward-compatible doc-link creation via body-based taskId (used by VibeTasks client)
router.post('/projects/:projectId/doc-links',
  requirePlatformSession,
  requireAgentProjectAccess(ProjectAction.LINK_DOC),
  asyncHandler(async (req, res) => {
    const { taskId, documentId, role, pinnedVersion } = req.body;
    if (!taskId || !documentId) {
      throw new BadRequestError('taskId and documentId are required');
    }

    // Forward to the existing doc-links router by rewriting the URL
    req.url = `/projects/${req.params.projectId}/tasks/${taskId}/doc-links`;
    req.body = { documentId, role, pinnedVersion };
    docLinksRouter(req, res, () => {
      throw new BadRequestError('Doc-link route not found');
    });
  })
);

// GET /api/agent/search - Search tasks across all delegated projects
router.get('/search', asyncHandler(async (req, res) => {
  const auth = (req as any).auth;
  if (!auth || auth.type !== 'agent') {
    return res.status(403).json({ error: 'Agent authentication required' });
  }

  const { q, page = '1', limit = '50' } = req.query;

  if (!q || typeof q !== 'string') {
    throw new BadRequestError('Search query (q) is required');
  }

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 50));
  const skip = (pageNum - 1) * limitNum;

  // Parse search query
  const searchFilters = parseSearchQuery(q);

  // Get agent's delegated projects
  const key = await prisma.apikey.findUnique({
    where: { id: auth.agent?.apiKeyId },
    select: { id: true },
  });

  if (!key) {
    return res.json({ tasks: [], total: 0 });
  }

  const delegations = await prisma.agentDelegation.findMany({
    where: { apiKeyId: key.id, isActive: true },
    select: { projectId: true, permissionLevel: true },
  });

  if (delegations.length === 0) {
    return res.json({ tasks: [], total: 0 });
  }

  const projectIds = delegations.map(d => d.projectId);

  // Build search where clause
  const where: any = {
    projectId: { in: projectIds },
  };

  // Add search filters
  const searchWhere = await buildAgentSearchWhereClause(searchFilters);
  Object.assign(where, searchWhere.where);

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, surname: true, avatarUrl: true } },
        assignee: { select: { id: true, name: true, surname: true, avatarUrl: true } },
        project: { select: { id: true, name: true, prefix: true } },
        _count: { select: { children: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({
    tasks: transformTasks(tasks),
    total,
    page: pageNum,
    limit: limitNum,
  });
}));

/**
 * Parse natural language search query into field filters
 */
function parseSearchQuery(q: string): Record<string, string> {
  const filters: Record<string, string> = {};
  const fieldValueRegex = /(\w+):\s*("[^"]+"|\S+)/g;
  let match;

  while ((match = fieldValueRegex.exec(q)) !== null) {
    const field = match[1].toLowerCase();
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    filters[field] = value;
  }

  const remaining = q.replace(fieldValueRegex, '').trim();
  if (remaining) {
    filters._general = remaining;
  }

  return filters;
}

/**
 * Build Prisma where clause for agent search
 */
async function buildAgentSearchWhereClause(filters: Record<string, string>): Promise<{ where: any }> {
  const where: any = {};

  const fieldMappings: Record<string, string> = {
    title: 'name',
    description: 'description',
    identifier: 'identifier',
    status: 'status',
    priority: 'priority',
    tags: 'tags',
    column: 'projectColumnId',
    due: 'dueDate',
  };

  for (const [field, value] of Object.entries(filters)) {
    if (field === '_general') {
      where.OR = [
        { name: { contains: value, mode: 'insensitive' } },
        { description: { contains: value, mode: 'insensitive' } },
        { identifier: { contains: value, mode: 'insensitive' } },
      ];
      continue;
    }

    if (field === 'comments') {
      continue;
    }

    const prismaField = fieldMappings[field];
    if (!prismaField) continue;

    if (field === 'due') {
      const dateRange = parseDateRange(value);
      if (dateRange) {
        if (dateRange.after) {
          where[prismaField] = { ...where[prismaField], gte: dateRange.after };
        }
        if (dateRange.before) {
          where[prismaField] = { ...where[prismaField], lte: dateRange.before };
        }
      } else {
        where[prismaField] = { contains: value, mode: 'insensitive' };
      }
      continue;
    }

    if (prismaField === 'name' || prismaField === 'description' || prismaField === 'identifier' || prismaField === 'status' || prismaField === 'priority' || prismaField === 'tags') {
      where[prismaField] = { contains: value, mode: 'insensitive' };
    } else if (prismaField === 'projectColumnId') {
      const columns = await prisma.projectColumn.findMany({
        where: { name: { contains: value, mode: 'insensitive' } },
        take: 10,
      });
      if (columns.length > 0) {
        where.projectColumnId = { in: columns.map(c => c.id) };
      }
    }
  }

  return { where };
}

function parseDateRange(value: string): { after?: Date; before?: Date } | null {
  if (value.includes('..')) {
    const [after, before] = value.split('..');
    return {
      after: new Date(after.trim()),
      before: new Date(before.trim()),
    };
  }
  if (value.startsWith('>')) {
    return { after: new Date(value.slice(1).trim()) };
  }
  if (value.startsWith('<')) {
    return { before: new Date(value.slice(1).trim()) };
  }
  return null;
}

export default router;
