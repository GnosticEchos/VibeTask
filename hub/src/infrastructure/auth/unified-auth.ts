/**
 * Unified Authentication Middleware
 *
 * This middleware allows both human users (via Better Auth sessions)
 * and agents (via API keys) to authenticate seamlessly.
 *
 * Priority: Better Auth session (user) > API key (agent)
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma.js';
import { auth } from './better-auth.js';
import { defaultKeyHasher } from '@better-auth/api-key';
import { isAgentKeyMetadata } from './agent-key-metadata.js';

const AGENT_API_KEY_HEADER = 'x-agent-api-key';

// Agent permission level enum (matches Prisma schema)
export enum AgentPermissionLevel {
  VIEWER = 'VIEWER',
  USER = 'USER',
}

// Delegation mode enum (matches Prisma schema)
export enum DelegationMode {
  FULL = 'FULL',
  COLUMN_BOUND = 'COLUMN_BOUND',
}

// Agent delegation interface (matches Prisma model)
export interface AgentDelegation {
  id: string;
  apiKeyId: string;
  projectId: number;
  project: { id: number; name: string; prefix: string };
  permissionLevel: AgentPermissionLevel;
  delegationMode: DelegationMode;
  restrictedColumnId?: number;
  allowedMoveRange: number;
  delegatedById: number;
  isActive: boolean;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Unified authentication context
 * Works for both human users and agents
 */
export interface AuthContext {
  type: 'user' | 'agent';
  user: { id: number; email: string; role: string; name?: string };
  agent?: { apiKeyId: string; name: string };
  delegations?: AgentDelegation[]; // Only for agents
}

/**
 * Extended Express Request with auth context
 */
export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
  agentDelegation?: AgentDelegation;
}

function parseNumericId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function getAgentApiKeyFromHeader(req: Request): string | null {
  const header = req.headers[AGENT_API_KEY_HEADER];
  if (Array.isArray(header)) {
    const first = String(header[0] || '').trim();
    return first.length > 0 ? first : null;
  }
  const value = String(header || '').trim();
  return value.length > 0 ? value : null;
}

async function verifyAgentApiKeyViaPrisma(rawKey: string): Promise<{ apiKeyId: string; userId: number } | null> {
  const hashed = await defaultKeyHasher(rawKey);
  const now = new Date();

  const apiKey = await prisma.apikey.findFirst({
    where: {
      key: hashed,
      enabled: true,
    },
    select: {
      id: true,
      referenceId: true,
      expiresAt: true,
      metadata: true,
    },
  });

  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt <= now) return null;
  if (!isAgentKeyMetadata(apiKey.metadata)) return null;

  const userId = parseNumericId(apiKey.referenceId);
  if (!userId) return null;

  return { apiKeyId: apiKey.id, userId };
}

async function loadUserRole(userId: number): Promise<string> {
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return userRecord?.role || 'USER';
}

async function buildAgentAuthContext(params: {
  apiKeyId: string;
  userId: number;
  fallbackEmail?: string;
  fallbackName?: string;
}): Promise<AuthContext> {
  const [delegations, userRecord, apiKeyRecord] = await Promise.all([
    prisma.agentDelegation.findMany({
      where: { apiKeyId: params.apiKeyId, isActive: true },
      include: { project: { select: { id: true, name: true, prefix: true } } },
    }),
    prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true, name: true, role: true },
    }),
    prisma.apikey.findUnique({
      where: { id: params.apiKeyId },
      select: { name: true },
    }),
  ]);

  return {
    type: 'agent',
    user: {
      id: params.userId,
      email: userRecord?.email || params.fallbackEmail || '',
      role: userRecord?.role || 'USER',
      name: userRecord?.name || params.fallbackName || undefined,
    },
    agent: {
      apiKeyId: params.apiKeyId,
      name: apiKeyRecord?.name || params.fallbackName || 'Agent',
    },
    delegations: delegations as AgentDelegation[],
  };
}

/**
 * Unified authentication middleware
 * Tries Better Auth session first (for human users), then falls back to API key (for agents)
 */
export async function unifiedAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    // 1) Try Better Auth session first (handles Bearer tokens and cookies)
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session?.user) {
      const userId = parseNumericId(session.user.id as string);
      if (!userId) {
        return res.status(401).json({ error: 'Invalid session user ID' });
      }

      const sessionData = session.session as any;
      if (sessionData?.impersonatedBy === 'api-key') {
        // Session was created from an API key.
        const apiKeyId = sessionData.metadata?.apiKeyId as string;

        if (!apiKeyId) {
          console.error('API key session missing apiKeyId in metadata');
          return res.status(401).json({ error: 'Invalid agent session' });
        }

        (req as AuthenticatedRequest).auth = await buildAgentAuthContext({
          apiKeyId,
          userId,
          fallbackEmail: session.user.email,
          fallbackName: session.user.name || undefined,
        });
      } else {
        // Regular user session
        const role = await loadUserRole(userId);
        (req as AuthenticatedRequest).auth = {
          type: 'user',
          user: {
            id: userId,
            email: session.user.email,
            role,
            name: session.user.name || undefined,
          },
        };
      }

      return next();
    }

    // 2) No session found -> explicit API key fallback via canonical header.
    const apiKeyRaw = getAgentApiKeyFromHeader(req);
    if (apiKeyRaw) {
      // Prefer direct Prisma hash verification for x-agent-api-key.
      // Better Auth verifyApiKey may trigger an adapter-side update path that fails on some schemas.
      const localVerification = await verifyAgentApiKeyViaPrisma(apiKeyRaw);
      if (!localVerification) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const apiKeyId = localVerification.apiKeyId;
      const userId = localVerification.userId;

      (req as AuthenticatedRequest).auth = await buildAgentAuthContext({
        apiKeyId,
        userId,
      });
      return next();
    }

    // No valid authentication credentials.
    return res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    console.error('Unified auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Helper to check if user can create agents
 * Requires USER role or higher (USER, SUPPORT, ADMIN)
 */
export function requireUserRole(
  req: Request,
  res: Response,
  next: NextFunction
): void | Response {
  const authContext = (req as AuthenticatedRequest).auth;

  if (!authContext) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Agents cannot create/manage agents - only users
    if (authContext.type === 'agent') {

    return res.status(403).json({ error: 'Agents cannot manage other agents' });
  }

  const allowedRoles = ['USER', 'SUPPORT', 'ADMIN'];
  if (allowedRoles.includes(authContext.user.role)) {
    return next();
  }

  return res.status(403).json({
    error: 'USER role or higher required',
    required: allowedRoles,
      current: authContext.user.role,

  });
}

/**
 * Helper to get current auth context from request
 */
export function getAuthContext(req: Request): AuthContext | null {
  return (req as AuthenticatedRequest).auth || null;
}

/**
 * Helper to check if request is from an agent
 */
export function isAgent(req: Request): boolean {
  return (req as AuthenticatedRequest).auth?.type === 'agent';
}

/**
 * Helper to check if request is from a human user
 */
export function isUser(req: Request): boolean {
  return (req as AuthenticatedRequest).auth?.type === 'user';
}

/**
 * Middleware to require a specific minimum user role
 * Only applies to human users, agents are blocked
 */
export function requireMinimumRole(minRole: 'USER' | 'SUPPORT' | 'ADMIN') {
  const roleHierarchy = { USER: 1, SUPPORT: 2, ADMIN: 3 };
  const minLevel = roleHierarchy[minRole];

  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const authContext = (req as AuthenticatedRequest).auth;

    if (!authContext) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Agents cannot access user-only routes
  if (authContext.type === 'agent') {

      return res.status(403).json({ error: 'User access required' });
    }

    const userLevel = roleHierarchy[authContext.user.role as keyof typeof roleHierarchy] || 0;

    if (userLevel >= minLevel) {
      return next();
    }

    return res.status(403).json({
      error: `Minimum ${minRole} role required`,
      required: minRole,
    current: authContext.user.role,

    });
  };
}
