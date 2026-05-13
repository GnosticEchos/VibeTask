/**
 * Better Auth Routes
 * 
 * Provides API-compatible endpoints that match the frontend contract.
 * Uses Better Auth for authentication with Prisma adapter.
 */

import { Router } from 'express';
import { auth, prisma } from '../../infrastructure/auth/index.js';
import { validateBody, getValidatedBody } from '../../infrastructure/http/validation.js';
import { loginSchema, registerSchema } from '../../validation/schemas/index.js';
import { UserRole } from '../../infrastructure/auth/prisma.js';
import { asyncHandler, UnauthorizedError, BadRequestError } from '../../infrastructure/http/middleware/error-handler.js';

const router = Router();

const isAuthDebugEnabled = process.env.AUTH_DEBUG === 'true';

// Permission object type
interface UserPermissions {
  isAdmin: boolean;
  canManageRateLimits: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

/**
 * Safely extract user ID from auth response
 * Handles different ID formats from Better Auth
 */
function extractUserId(userId: string | number | undefined): number | undefined {
  if (userId === undefined || userId === null) {
    return undefined;
  }
  if (typeof userId === 'number') {
    return userId > 0 ? userId : undefined;
  }
  const parsed = parseInt(String(userId), 10);
  return isNaN(parsed) || parsed <= 0 ? undefined : parsed;
}

/**
 * Compute user permissions based on role
 */
function computePermissions(role: UserRole | null): UserPermissions {
  const isAdmin = role === UserRole.ADMIN;
  return {
    isAdmin,
    canManageRateLimits: isAdmin,
    canManageUsers: isAdmin,
    canManageSystem: isAdmin,
  };
}

// Helper to extract token from request
function getTokenFromRequest(req: any): string | null {
  return req.headers.authorization?.replace('Bearer ', '') || null;
}

// Helper to map Better Auth user to API response format
function mapUserToResponse(
  user: any,
  role: UserRole | null = null,
  dbUser?: { avatarUrl?: string | null; image?: string | null; name?: string | null; email?: string | null },
) {
  const effectiveName = dbUser?.name ?? user.name;
  const effectiveEmail = dbUser?.email ?? user.email;
  return {
    id: user.id,
    name: effectiveName || '',
    fullName: effectiveName || '',
    email: effectiveEmail || '',
    avatarUrl: dbUser?.avatarUrl ?? dbUser?.image ?? user.avatarUrl ?? user.image ?? null,
    role: role || UserRole.USER,
    permissions: computePermissions(role),
  };
}

// POST /api/login - Authenticate user
// Supports both Better Auth (Argon2id) and legacy (SHA-256) passwords
router.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<{ email: string; password: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { email, password } = body;

  // Use Better Auth's standard sign-in (Argon2id)
  if (isAuthDebugEnabled) {
    console.log('[Login] Attempting Better Auth sign-in for:', email);
  }

  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: req.headers as Record<string, string>,
    });

    if (isAuthDebugEnabled) {
      console.log('[Login] Better Auth result:', result ? 'success' : 'no result');
    }

    if (result && result.token) {
      // Fetch user's role from database
      const userId = extractUserId(result.user.id);
      if (userId === undefined) {
        console.error('[Login] Invalid user ID format:', result.user.id);
        throw new BadRequestError('Authentication error');
      }
      
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, avatarUrl: true, image: true, name: true, email: true },
      });
      const userRole = userRecord?.role || UserRole.USER;

      return res.json({
        token: result.token,
        user: mapUserToResponse(result.user, userRole, userRecord || undefined),
      });
    }
    
    throw new UnauthorizedError('Invalid email or password');
  } catch (betterAuthError: any) {
    if (isAuthDebugEnabled) {
      console.log('[Login] Better Auth error:', betterAuthError.message);
      console.log('[Login] Better Auth error details:', betterAuthError);
    }
    throw betterAuthError;
  }
}));

// POST /api/signin - Alias for login
router.post('/signin', validateBody(loginSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<{ email: string; password: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { email, password } = body;

  const result = await auth.api.signInEmail({
    body: { email, password },
    headers: req.headers as Record<string, string>,
  });

  if (!result || !result.token) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Fetch user's role from database
  const userId = extractUserId(result.user.id);
  if (userId === undefined) {
    console.error('[Signin] Invalid user ID format:', result.user.id);
    throw new BadRequestError('Authentication error');
  }
  
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, avatarUrl: true, image: true, name: true, email: true },
  });
  const userRole = userRecord?.role || UserRole.USER;

  res.json({
    token: result.token,
    user: mapUserToResponse(result.user, userRole, userRecord || undefined),
  });
}));

// POST /api/register - Register a new user
router.post('/register', validateBody(registerSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<{ email: string; password: string; name: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { email, password, name } = body;

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: req.headers as Record<string, string>,
  });

  if (!result || !result.token) {
    throw new BadRequestError('Registration failed');
  }

  // New users default to USER role - fetch to confirm
  const userId = extractUserId(result.user.id);
  if (userId === undefined) {
    console.error('[Register] Invalid user ID format:', result.user.id);
    throw new BadRequestError('Registration error');
  }
  
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, avatarUrl: true, image: true, name: true, email: true },
  });
  const userRole = userRecord?.role || UserRole.USER;

  res.json({
    token: result.token,
    user: mapUserToResponse(result.user, userRole, userRecord || undefined),
  });
}));

// POST /api/signup - Alias for register
router.post('/signup', validateBody(registerSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<{ email: string; password: string; name: string }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { email, password, name } = body;

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: req.headers as Record<string, string>,
  });

  if (!result || !result.token) {
    throw new BadRequestError('Registration failed');
  }

  // New users default to USER role - fetch to confirm
  const userId = extractUserId(result.user.id);
  if (userId === undefined) {
    console.error('[Signup] Invalid user ID format:', result.user.id);
    throw new BadRequestError('Registration error');
  }
  
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, avatarUrl: true, image: true, name: true, email: true },
  });
  const userRole = userRecord?.role || UserRole.USER;

  res.json({
    token: result.token,
    user: mapUserToResponse(result.user, userRole, userRecord || undefined),
  });
}));

// POST /api/logout - Sign out the user
router.post('/logout', asyncHandler(async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (token) {
    await auth.api.signOut({
      headers: { authorization: `Bearer ${token}` },
    });
  }

  res.json({ success: true });
}));

// GET /api/session - Get current session
router.get('/session', asyncHandler(async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    throw new UnauthorizedError('No session');
  }

  const session = await auth.api.getSession({
    headers: { authorization: `Bearer ${token}` },
  });

  if (!session) {
    throw new UnauthorizedError('Invalid session');
  }

  // Fetch user's role from database
  const userId = extractUserId(session.user.id);
  if (userId === undefined) {
    console.error('[Session] Invalid user ID format:', session.user.id);
    throw new UnauthorizedError('Invalid session');
  }
  
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, avatarUrl: true, image: true, name: true, email: true },
  });

  const userRole = userRecord?.role || UserRole.USER;

  res.json({
    user: mapUserToResponse(session.user, userRole, userRecord || undefined),
  });
}));

export default router;