/**
 * Project Role Middleware
 *
 * Reusable middleware for checking project membership and role thresholds.
 * Role hierarchy: Owner > Maintainer > Editor > Viewer
 */

import { Request, RequestHandler } from 'express';
import { ForbiddenError } from '../../infrastructure/http/middleware/error-handler.js';
import { prisma } from './prisma.js';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name?: string | null;
    surname?: string | null;
    avatarUrl?: string | null;
  };
}

const ROLE_HIERARCHY: Record<string, number> = {
  Owner: 4,
  Maintainer: 3,
  Editor: 2,
  Viewer: 1,
};

export interface ProjectMembershipResult {
  membership: { userId: number; projectId: number; role: string } | null;
  hasRole: boolean;
}

/**
 * Check if a user has at least the minimum required role in a project.
 */
export async function checkProjectMembership(
  userId: number,
  projectId: number,
  minRole: 'Owner' | 'Maintainer' | 'Editor' | 'Viewer' = 'Viewer'
): Promise<ProjectMembershipResult> {
  const membership = await prisma.projectUser.findUnique({
    where: {
      userId_projectId: { userId, projectId },
    },
  });

  if (!membership) {
    return { membership: null, hasRole: false };
  }

  const userLevel = ROLE_HIERARCHY[membership.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  return {
    membership,
    hasRole: userLevel >= requiredLevel,
  };
}

/**
 * Express middleware that checks project membership and role.
 * Expects `projectId` to be available in req.params or req.body.
 */
export function requireProjectRole(
  minRole: 'Owner' | 'Maintainer' | 'Editor' | 'Viewer'
): RequestHandler {
  return async (req: AuthRequest, res, next) => {
    const user = req.user;
    if (!user) {
      return next(new ForbiddenError('Authentication required'));
    }

    const projectId = Number(req.params.id ?? req.params.projectId ?? req.body.projectId);
    if (!projectId || isNaN(projectId)) {
      return next(new ForbiddenError('Project ID is required'));
    }

    const result = await checkProjectMembership(user.id, projectId, minRole);

    if (!result.membership) {
      return next(new ForbiddenError('You are not a member of this project'));
    }

    if (!result.hasRole) {
      return next(new ForbiddenError(`This action requires ${minRole} role or higher`));
    }

    (req as any).projectMembership = result.membership;
    next();
  };
}

/**
 * Middleware that checks project membership for a task-scoped route.
 * Fetches the task first to determine its projectId, then checks membership.
 */
export function requireProjectRoleForTask(
  minRole: 'Owner' | 'Maintainer' | 'Editor' | 'Viewer'
): RequestHandler {
  return async (req: AuthRequest, res, next) => {
    const user = req.user;
    if (!user) {
      return next(new ForbiddenError('Authentication required'));
    }

    const taskId = Number(req.params.taskId ?? req.params.id);
    if (!taskId || isNaN(taskId)) {
      return next(new ForbiddenError('Task ID is required'));
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });

    if (!task) {
      return next(new ForbiddenError('Task not found'));
    }

    const result = await checkProjectMembership(user.id, task.projectId, minRole);

    if (!result.membership) {
      return next(new ForbiddenError('You are not a member of this project'));
    }

    if (!result.hasRole) {
      return next(new ForbiddenError(`This action requires ${minRole} role or higher`));
    }

    (req as any).projectMembership = result.membership;
    (req as any).taskProjectId = task.projectId;
    next();
  };
}
