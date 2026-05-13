/**
 * Admin User Management API
 *
 * Allows admins to manage user roles.
 */

import { Router } from 'express';
import { UserRole } from '../../../infrastructure/auth/prisma.js';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/auth/index.js';
import { requireAdmin } from '../../../infrastructure/http/middleware/auth.js';
import { validateBody, validateParams, getValidatedParams, getValidatedBody } from '../../../infrastructure/http/validation.js';
import { adminIssueTemporaryPassword } from '../../../domain/services/admin-temporary-password.service.js';
import { asyncHandler, ForbiddenError, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';

const router = Router();

// All routes require admin
router.use(requireAdmin);

// Validation schemas
const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

const userIdParamSchema = z.object({
  id: z.coerce.number().positive(),
});

/**
 * GET /admin/users
 * List all users with their roles
 */
router.get('/', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    users: users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    })),
  });
}));

/**
 * PATCH /admin/users/:id/role
 * Update user role
 */
router.patch(
  '/:id/role',
  validateParams(userIdParamSchema),
  validateBody(updateUserRoleSchema),
  asyncHandler(async (req, res) => {
    const params = getValidatedParams<{ id: number }>(req);
    if (!params) {
      throw new BadRequestError('Missing or invalid parameters');
    }
    const userId = params.id;
    const body = getValidatedBody<{ role: UserRole }>(req);
    if (!body) {
      throw new BadRequestError('Missing or invalid body');
    }
    const { role } = body;

    // Prevent self-demotion (can't demote yourself from ADMIN)
    const currentAdmin = (req as any).user;
    if (userId === currentAdmin.id && role !== UserRole.ADMIN) {
      throw new ForbiddenError('Cannot demote yourself from admin');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        role: true,
      },
    });

    res.json({
      user: updatedUser,
      message: `User role updated to ${role}`,
    });
  })
);

/**
 * POST /admin/users/:id/temporary-password
 * Issue a one-time random password (admin relays manually; not emailed).
 * Revokes all sessions for the target user.
 */
router.post('/:id/temporary-password', validateParams(userIdParamSchema), asyncHandler(async (req, res) => {
  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const targetUserId = params.id;
  const currentAdmin = (req as any).user as { id: number };
  if (targetUserId === currentAdmin.id) {
    throw new ForbiddenError('Cannot issue a temporary password for your own account from the admin console. Use Account settings instead.');
  }

  const result = await adminIssueTemporaryPassword(currentAdmin.id, targetUserId);
  return res.status(200).json({
    temporaryPassword: result.temporaryPassword,
    user: result.user,
    message:
      'Share this password with the user through a secure channel. It is not emailed. All of their sessions have been signed out.',
  });
}));

export default router;
