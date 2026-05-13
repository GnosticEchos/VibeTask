/**
 * Authentication Middleware
 * 
 * Centralized authentication logic for extracting and validating user sessions.
 * Replaces duplicated getUserFromRequest functions in route files.
 */

import { auth } from '../../auth/index.js';
import { prisma, UserRole } from '../../auth/prisma.js';
import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
  surname?: string | null;
  avatarUrl?: string | null;
}

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Extract and validate user from request authorization header
 * @param req - Express request object
 * @returns AuthUser if valid session, null otherwise
 */
export async function getUserFromRequest(req: Request): Promise<AuthUser | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  
  try {
    const session = await auth.api.getSession({
      headers: { authorization: `Bearer ${token}` },
    });
    
    if (!session?.user) return null;
    
    // Convert string ID to number for Prisma compatibility
    return {
      ...session.user,
      id: parseInt(session.user.id as string, 10),
    };
  } catch {
    return null;
  }
}

/**
 * Middleware to require authentication
 * Attaches user to req.user if valid, returns 401 otherwise
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = user;
  next();
}

/**
 * Middleware to require specific user role
 * @param allowedRoles - Array of roles that can access the route
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getUserFromRequest(req);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Fetch user from database to get their role
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true },
    });
    
    if (!dbUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(dbUser.role)) {
      return res.status(403).json({
        error: 'Access denied',
        required: allowedRoles,
        current: dbUser.role,
      });
    }
    
    req.user = user;
    next();
  };
}

/**
 * Convenience middleware for admin-only routes
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * Convenience middleware for admin or support routes
 */
export const requireAdminOrSupport = requireRole(UserRole.ADMIN, UserRole.SUPPORT);

// Re-export UserRole for convenience
export { UserRole };
