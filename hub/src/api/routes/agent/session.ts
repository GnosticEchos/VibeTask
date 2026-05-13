import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/prisma.js';
import { unifiedAuthMiddleware } from '../../../infrastructure/auth/unified-auth.js';
import { isPlatformAgentMetadata, parseAgentKeyMetadata } from '../../../infrastructure/auth/agent-key-metadata.js';
import { signPlatformSession, getSessionExpiry } from '../../../infrastructure/auth/platform-session.js';
import { asyncHandler, ForbiddenError } from '../../../infrastructure/http/middleware/error-handler.js';

const router = Router();

router.post('/', unifiedAuthMiddleware, asyncHandler(async (req, res) => {
  const auth = (req as any).auth;
  if (!auth || auth.type !== 'agent') {
    throw new ForbiddenError('Agent authentication required');
  }

  const key = await prisma.apikey.findUnique({
    where: { id: auth.agent?.apiKeyId },
    select: { id: true, enabled: true, expiresAt: true, metadata: true, referenceId: true },
  });

  if (!key || !isPlatformAgentMetadata(key.metadata)) {
    throw new ForbiddenError('Platform agent authentication required');
  }
  if (!key.enabled) {
    throw new ForbiddenError('Platform agent is disabled');
  }
  if (key.expiresAt && key.expiresAt <= new Date()) {
    throw new ForbiddenError('Platform agent key has expired');
  }

  const metadata = parseAgentKeyMetadata(key.metadata);
  const sessionExpirySeconds = (metadata?.sessionExpirySeconds as number) ?? 86400;
  const targetUserId = key.referenceId ? parseInt(key.referenceId, 10) : null;
  if (!targetUserId) {
    return res.status(500).json({ error: 'Platform agent has no target user' });
  }

  const exp = getSessionExpiry(sessionExpirySeconds);
  const token = signPlatformSession({
    sub: key.id,
    targetUserId,
    type: 'platform-session',
    exp,
  });

  const agents = await prisma.apikey.findMany({
    where: { referenceId: String(targetUserId) },
    orderBy: { createdAt: 'desc' },
  });

  const agentRows = agents.filter((a) => {
    const m = parseAgentKeyMetadata(a.metadata);
    return m?.isAgent === true && m?.isPlatformAgent !== true;
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
    const aDelegations = delegationsByAgentId.get(a.id) || [];
    return {
      id: a.id,
      name: a.name,
      isActive: a.enabled !== false,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      prefix: a.prefix,
      delegations: aDelegations.map((d) => ({
        projectId: d.projectId,
        projectName: d.project.name,
        projectPrefix: d.project.prefix,
        permissionLevel: d.permissionLevel,
        delegationMode: d.delegationMode,
        restrictedColumnId: d.restrictedColumnId,
        allowedMoveRange: d.allowedMoveRange,
        isActive: d.isActive,
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
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    agents: agentRoster,
  });
}));

export default router;
