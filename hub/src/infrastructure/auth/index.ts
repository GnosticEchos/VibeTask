/**
 * Better Auth Integration
 *
 * Production-ready authentication with Better Auth and Prisma adapter.
 * Maintains backward compatibility with existing auth patterns.
 */

// Export Prisma client (from separate file to avoid circular dependencies)
export { prisma } from './prisma.js';

// Export Better Auth configuration
export { auth } from './better-auth.js';
export type { AuthUser, AuthSession } from './better-auth.js';

// Export Unified Authentication Middleware
export {
  unifiedAuthMiddleware,
  requireUserRole,
  requireMinimumRole,
  getAuthContext,
  isAgent,
  isUser,
} from './unified-auth.js';
export type {
  AuthContext,
  AuthenticatedRequest,
  AgentDelegation,
  AgentPermissionLevel,
} from './unified-auth.js';

// Export Agent Permissions
export {
  requireAgentProjectAccess,
  canPerformAction,
  getRequiredPermissionLevel,
  getAllowedActions,
  ProjectAction,
} from './agent-permissions.js';
export type { AgentRequest } from './agent-permissions.js';

/**
 * Extract user ID from request headers (Bearer token)
 * Returns null if not authenticated
 */
export async function getUserIdFromRequest(req: any): Promise<number | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return null;
  }
  
  try {
    const { auth } = await import('./better-auth.js');
    const session = await auth.api.getSession({
      headers: { authorization: `Bearer ${token}` },
    });
    const id = session?.user?.id;
    return id ? parseInt(id as string, 10) : null;
  } catch {
    return null;
  }
}
