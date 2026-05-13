import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import { unifiedAuthMiddleware } from '../../../infrastructure/auth/unified-auth.js';
import { isPlatformAgentMetadata, parseAgentKeyMetadata } from '../../../infrastructure/auth/agent-key-metadata.js';
import { verifyPlatformSession } from '../../../infrastructure/auth/platform-session.js';
import { asyncHandler, ForbiddenError } from '../../../infrastructure/http/middleware/error-handler.js';

const PLATFORM_SESSION_HEADER = 'x-platform-session';

const router = Router();

router.get('/', unifiedAuthMiddleware, asyncHandler(async (req, res) => {
  const auth = (req as any).auth;
  let targetUserId: number | null = null;
  let isPlatformAgent = false;

  if (auth?.type === 'agent') {
    const key = await prisma.apikey.findUnique({
      where: { id: auth.agent?.apiKeyId },
      select: { referenceId: true, metadata: true },
    });
    if (key && isPlatformAgentMetadata(key.metadata)) {
      isPlatformAgent = true;
      targetUserId = key.referenceId ? parseInt(key.referenceId, 10) : null;
    }
  }

  if (!isPlatformAgent && !targetUserId) {
    const jwtToken = req.headers[PLATFORM_SESSION_HEADER];
    if (jwtToken) {
      const payload = verifyPlatformSession(Array.isArray(jwtToken) ? jwtToken[0] : jwtToken);
      if (payload) {
        targetUserId = payload.targetUserId;
      }
    }
  }

  if (!targetUserId) {
    throw new ForbiddenError('Platform agent authentication required');
  }

  const agents = await prisma.apikey.findMany({
    where: { referenceId: String(targetUserId) },
    orderBy: { createdAt: 'desc' },
  });

  const agentRows = agents.filter((a) => {
    const m = parseAgentKeyMetadata(a.metadata);
    return m?.isAgent === true;
  });

  const delegations = await prisma.agentDelegation.findMany({
    where: {
      apiKeyId: { in: agentRows.map((a) => a.id) },
      isActive: true,
    },
    include: {
      project: { select: { id: true, name: true, prefix: true } },
    },
  });

  const delegationsByAgentId = new Map<string, typeof delegations>();
  for (const d of delegations) {
    const existing = delegationsByAgentId.get(d.apiKeyId) || [];
    existing.push(d);
    delegationsByAgentId.set(d.apiKeyId, existing);
  }

  const agentRoster = agentRows.map((a) => {
    const isPlatform = isPlatformAgentMetadata(a.metadata);
    const aDelegations = delegationsByAgentId.get(a.id) || [];
    return {
      id: a.id,
      name: a.name,
      isActive: a.enabled !== false,
      isPlatformAgent: isPlatform,
      lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      prefix: a.prefix,
      createdAt: a.createdAt.toISOString(),
      metadata: parseAgentKeyMetadata(a.metadata) ?? undefined,
      delegations: aDelegations.map((d) => ({
        projectId: d.projectId,
        projectName: d.project.name,
        projectPrefix: d.project.prefix,
        permissionLevel: d.permissionLevel,
        delegationMode: d.delegationMode,
        restrictedColumnId: d.restrictedColumnId,
        allowedMoveRange: d.allowedMoveRange,
        isActive: d.isActive,
        createdAt: d.createdAt.toISOString(),
        columnAllowance: {
          mode: d.delegationMode,
          restrictedColumnId: d.delegationMode === 'COLUMN_BOUND' ? (d.restrictedColumnId ?? undefined) : undefined,
          allowedMoveRange: d.allowedMoveRange,
          canViewAllColumns: d.delegationMode !== 'COLUMN_BOUND',
          canMoveAnywhere: d.delegationMode !== 'COLUMN_BOUND',
          canHandoffToReview: true,
        },
      })),
    };
  });

  res.json({
    agents: agentRoster,
    total: agentRoster.length,
    activeTotal: agentRoster.filter((a) => a.isActive).length,
  });
}));

export default router;
