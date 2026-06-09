/**
 * Agent Permissions Middleware
 *
 * Middleware to check agent permissions on specific projects.
 * Works in conjunction with unified-auth middleware.
 * Supports column-bound agents with restricted movement.
 */

import { Request, Response, NextFunction } from 'express';
import { AgentPermissionLevel, AgentDelegation, DelegationMode } from './unified-auth.js';
import { getValidatedParams } from '../http/validation.js';

/**
 * Project actions that can be performed by agents
 */
export enum ProjectAction {
  VIEW_PROJECT = 'project:view',
  VIEW_TASKS = 'tasks:view',
  CREATE_TASK = 'task:create',
  UPDATE_TASK = 'task:update',
  DELETE_TASK = 'task:delete',
  VIEW_COLUMNS = 'columns:view',
  VIEW_MEMBERS = 'members:view',
  VIEW_DOCS = 'docs:view',
  CREATE_DOC = 'docs:create',
  ADD_COMMENT = 'comment:add',
  ADD_PROGRESS = 'progress:add',
  LINK_DOC = 'doc:link',
}

/**
 * Map actions to required permission level
 */
const ACTION_PERMISSIONS: Record<ProjectAction, AgentPermissionLevel> = {
  // Viewer actions - VIEWER level can perform these
  [ProjectAction.VIEW_PROJECT]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_TASKS]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_COLUMNS]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_MEMBERS]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_DOCS]: AgentPermissionLevel.VIEWER,

  // User actions - USER level required
  [ProjectAction.CREATE_TASK]: AgentPermissionLevel.USER,
  [ProjectAction.UPDATE_TASK]: AgentPermissionLevel.USER,
  [ProjectAction.DELETE_TASK]: AgentPermissionLevel.USER,
  [ProjectAction.CREATE_DOC]: AgentPermissionLevel.USER,
  [ProjectAction.ADD_COMMENT]: AgentPermissionLevel.USER,
  [ProjectAction.ADD_PROGRESS]: AgentPermissionLevel.USER,
  [ProjectAction.LINK_DOC]: AgentPermissionLevel.USER,
};

/**
 * Extended Express Request with agent delegation
 */
export interface AgentRequest extends Request {
  agentDelegation?: AgentDelegation;
}

/**
 * Middleware factory to require agent project access
 * Only applies to agents - regular users bypass this check
 *
 * NOTE: This middleware expects routes to have a `:projectId` parameter.
 * It will not work correctly on routes that use different param names (e.g., `:id`).
 * This middleware should only be used on agent routes that follow the pattern
 * `/api/agent/projects/:projectId/...`
 *
 * @param action - The action the agent is trying to perform
 * @returns Express middleware function
 */
export function requireAgentProjectAccess(action: ProjectAction) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> => {
    const auth = (req as any).auth;

    // If no auth context, reject
    if (!auth) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Only apply to agents - users bypass this check
    if (auth.type !== 'agent') {
      return next();
    }

    // Try to get validated params, fall back to parsing from req.params
    // Note: Routes should use validateParams middleware before this middleware
    // to ensure params are properly validated
    let projectId: number | undefined;
    const validatedParams = getValidatedParams<{ projectId: number }>(req);
    if (validatedParams?.projectId !== undefined) {
      projectId = validatedParams.projectId;
    } else {
      // Fallback: parse from req.params (string in Express 5)
      const projectIdStr = req.params.projectId;
      projectId = typeof projectIdStr === 'string' ? parseInt(projectIdStr, 10) : NaN;
    }

    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    try {
      const { assertDelegateAccessToProject } = await import('../../services/project-lifecycle.js');
      await assertDelegateAccessToProject(projectId);
    } catch (err) {
      return next(err);
    }

    // Find delegation for this project
    const delegation = auth.delegations?.find(
      (d: AgentDelegation) => d.projectId === projectId && d.isActive
    );

    if (!delegation) {
      return res.status(403).json({
        error: 'Agent has no access to this project',
        projectId,
      });
    }

    // Check permission level
    const requiredLevel = ACTION_PERMISSIONS[action];

    if (!requiredLevel) {
      return res.status(403).json({
        error: 'Unknown action',
        action,
      });
    }

    // USER level can do everything, VIEWER can only do viewer actions
    if (
      requiredLevel === AgentPermissionLevel.USER &&
      delegation.permissionLevel !== AgentPermissionLevel.USER
    ) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        action,
        required: AgentPermissionLevel.USER,
        current: delegation.permissionLevel,
      });
    }

    // Check column-bound restrictions for task mutations
    if (delegation.delegationMode === DelegationMode.COLUMN_BOUND) {
      // Column-bound agents can only perform USER-level actions (not VIEWER-only)
      // and are restricted to their assigned column
      if (action === ProjectAction.UPDATE_TASK || action === ProjectAction.DELETE_TASK) {
        // These will be further validated in the route handler based on column
        // For now, allow if they have USER permission
      }
    }

    // Attach delegation to request for use in handlers
    (req as AgentRequest).agentDelegation = delegation;

    next();
  };
}

/**
 * Check if an agent can perform an action on a project
 * Helper function for use in route handlers
 *
 * @param delegations - Agent's delegations
 * @param projectId - Project ID to check
 * @param action - Action to check
 * @returns boolean indicating if action is allowed
 */
export function canPerformAction(
  delegations: AgentDelegation[],
  projectId: number,
  action: ProjectAction
): boolean {
  const delegation = delegations.find(
    (d) => d.projectId === projectId && d.isActive
  );

  if (!delegation) {
    return false;
  }

  const requiredLevel = ACTION_PERMISSIONS[action];

  if (!requiredLevel) {
    return false;
  }

  // USER level can do everything, VIEWER can only do viewer actions
  if (
    requiredLevel === AgentPermissionLevel.USER &&
    delegation.permissionLevel !== AgentPermissionLevel.USER
  ) {
    return false;
  }

  return true;
}

/**
 * Get the required permission level for an action
 *
 * @param action - The action to check
 * @returns The required permission level
 */
export function getRequiredPermissionLevel(
  action: ProjectAction
): AgentPermissionLevel {
  return ACTION_PERMISSIONS[action] || AgentPermissionLevel.USER;
}

/**
 * List all actions an agent can perform with a given permission level
 *
 * @param level - The permission level
 * @returns Array of allowed actions
 */
export function getAllowedActions(
  level: AgentPermissionLevel
): ProjectAction[] {
  const actions: ProjectAction[] = [];

  for (const [action, requiredLevel] of Object.entries(ACTION_PERMISSIONS)) {
    if (
      requiredLevel === AgentPermissionLevel.VIEWER ||
      level === AgentPermissionLevel.USER
    ) {
      actions.push(action as ProjectAction);
    }
  }

  return actions;
}

/**
 * Column-bound agent helpers
 */

/**
 * Check if an agent is restricted to a specific column
 */
export function isColumnBound(delegation: AgentDelegation): boolean {
  return delegation.delegationMode === DelegationMode.COLUMN_BOUND;
}

/**
 * Get the restricted column ID for a column-bound agent
 * Returns undefined if agent is not column-bound
 */
export function getRestrictedColumnId(delegation: AgentDelegation): number | undefined {
  return delegation.restrictedColumnId ?? undefined;
}

/**
 * Check if a task move is allowed for a column-bound agent
 * Agents can move tasks ±allowedMoveRange columns or to Agent Review
 */
export function canMoveTask(
  delegation: AgentDelegation,
  currentColumnId: number,
  targetColumnId: number,
  targetColumnRoleType?: string
): boolean {
  if (delegation.delegationMode !== DelegationMode.COLUMN_BOUND) {
    return true; // Full access agents can move anywhere
  }

  // Allow handoff to Agent Review column
  if (targetColumnRoleType === 'AGENT_REVIEW') {
    return true;
  }

  // For column-bound agents, they can only move tasks within their allowed range
  // This is a simplified check - the actual implementation would need column ordering
  // For now, we check if the target is within the agent's restricted column
  if (delegation.restrictedColumnId && targetColumnId !== delegation.restrictedColumnId) {
    return false;
  }

  return true;
}

/**
 * Check if agent can view a specific column
 * Column-bound agents can only view their restricted column
 */
export function canViewColumn(
  delegation: AgentDelegation,
  columnId: number
): boolean {
  if (delegation.delegationMode !== DelegationMode.COLUMN_BOUND) {
    return true;
  }

  return columnId === delegation.restrictedColumnId;
}

/**
 * Get column-bound agent allowance shape for /api/agent/me
 * Returns a clear, client-friendly allowance object
 */
export function getColumnBoundAllowance(delegation: {
  delegationMode: DelegationMode;
  restrictedColumnId?: number | null;
  allowedMoveRange: number;
}): {
  mode: 'FULL' | 'COLUMN_BOUND';
  restrictedColumnId?: number;
  allowedMoveRange: number;
  canViewAllColumns: boolean;
  canMoveAnywhere: boolean;
  canHandoffToReview: boolean;
} {
  const isBound = delegation.delegationMode === DelegationMode.COLUMN_BOUND;

  return {
    mode: delegation.delegationMode,
    restrictedColumnId: isBound ? (delegation.restrictedColumnId ?? undefined) : undefined,
    allowedMoveRange: delegation.allowedMoveRange,
    canViewAllColumns: !isBound,
    canMoveAnywhere: !isBound,
    canHandoffToReview: true, // All agents can handoff to review
  };
}
