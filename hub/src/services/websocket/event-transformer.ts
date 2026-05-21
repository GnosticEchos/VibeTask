/**
 * WebSocket Event Transformer
 * 
 * Transforms database notification events into frontend-compatible messages.
 * CRITICAL: This must match the frontend contract exactly.
 * See: REWRITEPLAN/WEBSOCKET_CONTRACT.md
 */

import { CHANNELS } from '../../infrastructure/websocket/channels.js';
import { prisma } from '../../infrastructure/auth/prisma.js';

// Database action types from triggers
export type DBAction = 'INSERT' | 'UPDATE' | 'DELETE';

// Frontend action types (contract)
export type FrontendAction = 'create' | 'update' | 'delete';

// Frontend message format (contract)
export interface TransformedMessage {
  identifier: {
    channel: string;
  };
  message: {
    itemType?: 'task' | 'column' | 'member' | 'project';
    actionType: FrontendAction;
    data: any;
  };
}

// Database payload structure from triggers
export interface DBPayload {
  table: string;
  action: DBAction;
  id: number;
  projectId: number | null;
  data: any;
}

// Action mapping: DB action -> Frontend action
const ACTION_MAP: Record<DBAction, FrontendAction> = {
  'INSERT': 'create',
  'UPDATE': 'update',
  'DELETE': 'delete',
};

/**
 * Transform database timestamp to ISO string
 */
function formatDate(date: any): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString();
  return null;
}

/**
 * Transform Task table events to frontend format
 */
export function transformTaskEvent(payload: DBPayload): TransformedMessage | null {
  const { action, data } = payload;
  
  if (!data) return null;

  // Transform to frontend contract format
  // See REWRITEPLAN/WEBSOCKET_CONTRACT.md - TasksIndexChannel
  return {
    identifier: {
      channel: CHANNELS.TASKS_INDEX,
    },
    message: {
      itemType: 'task',
      actionType: ACTION_MAP[action],
      data: {
        id: data.id,
        name: data.name || data.title,
        description: data.description,
        order: data.order,
        identifier: data.identifier,
        projectId: data.projectId,
        projectColumnId: data.projectColumnId,
        assigneeId: data.assigneeId,
        createdById: data.createdById,
        relationMode: data.relationMode,
        relationId: data.relationId,
        parentId: data.parentId ?? null,
        isContainer: data.isContainer ?? false,
        planAccepted: data.planAccepted ?? false,
        subBoardOutlineColor: data.subBoardOutlineColor ?? null,
        createdAt: formatDate(data.createdAt),
        updatedAt: formatDate(data.updatedAt),
        // Note: assignee and createdBy are populated by the frontend stores
        // based on the member data they already have
      },
    },
  };
}

/**
 * Transform ProjectColumn table events to frontend format
 */
export function transformColumnEvent(payload: DBPayload): TransformedMessage | null {
  const { action, data } = payload;
  
  if (!data) return null;

  // Transform to frontend contract format
  // See REWRITEPLAN/WEBSOCKET_CONTRACT.md - ColumnsIndexChannel
  return {
    identifier: {
      channel: CHANNELS.COLUMNS_INDEX,
    },
    message: {
      itemType: 'column',
      actionType: ACTION_MAP[action],
      data: {
        id: data.id,
        name: data.name,
        order: data.order,
        color: data.color,
        type: data.type,
        description: data.description,
        projectId: data.projectId,
        createdAt: formatDate(data.createdAt),
        updatedAt: formatDate(data.updatedAt),
      },
    },
  };
}

/**
 * Transform ProjectUser (member) table events to frontend format
 * Note: This is async because we need to fetch user data from the database
 */
export async function transformMemberEvent(payload: DBPayload): Promise<TransformedMessage | null> {
  const { action, data } = payload;
  
  if (!data) return null;

  // Fetch user data since the trigger only provides ProjectUser data
  let userData = {
    name: data.name,
    surname: data.surname,
    email: data.email,
    avatarUrl: data.avatarUrl,
  };

  // If user data is not in the payload (which is typical), fetch it from the database
  if (!data.name || !data.email) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: {
          name: true,
          surname: true,
          email: true,
          avatarUrl: true,
        },
      });

      if (user) {
        userData = {
          name: user.name,
          surname: user.surname,
          email: user.email,
          avatarUrl: user.avatarUrl,
        };
      }
    } catch (error) {
      console.warn('[EventTransformer] Failed to fetch user data for member event:', error);
      // Continue with whatever data we have (may be incomplete)
    }
  }

  // Transform to frontend contract format
  // See REWRITEPLAN/WEBSOCKET_CONTRACT.md - MembersIndexChannel
  return {
    identifier: {
      channel: CHANNELS.MEMBERS_INDEX,
    },
    message: {
      itemType: 'member',
      actionType: ACTION_MAP[action],
      data: {
        id: data.id,
        userId: data.userId,
        name: userData.name,
        surname: userData.surname,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
        role: data.role,
        createdAt: formatDate(data.createdAt),
      },
    },
  };
}

/**
 * Transform Project table events to frontend format
 * This broadcasts to both USER_PROJECTS and PROJECT_INDEX channels
 */
export function transformProjectEvent(payload: DBPayload): { userProjects: TransformedMessage; projectIndex: TransformedMessage } | null {
  const { action, data } = payload;
  
  if (!data) return null;

  const baseData = {
    id: data.id,
    name: data.name,
    description: data.description,
    prefix: data.prefix,
    ownerId: data.ownerId,
    createdAt: formatDate(data.createdAt),
    updatedAt: formatDate(data.updatedAt),
  };

  return {
    userProjects: {
      identifier: {
        channel: CHANNELS.USER_PROJECTS,
      },
      message: {
        itemType: 'project',
        actionType: ACTION_MAP[action],
        data: baseData,
      },
    },
    projectIndex: {
      identifier: {
        channel: CHANNELS.PROJECT_INDEX,
      },
      message: {
        itemType: 'project',
        actionType: ACTION_MAP[action],
        // For project index, we may send partial updates
        data: action === 'UPDATE' 
          ? { name: data.name, description: data.description }
          : baseData,
      },
    },
  };
}

/**
 * Main entry point for transforming any database event
 */
export async function transformEvent(payload: DBPayload): Promise<TransformedMessage | null> {
  switch (payload.table) {
    case 'Task':
      return transformTaskEvent(payload);
    case 'ProjectColumn':
      return transformColumnEvent(payload);
    case 'ProjectUser':
      return transformMemberEvent(payload);
    case 'Project': {
      // Project events return a special structure
      const result = transformProjectEvent(payload);
      return result?.userProjects || null;
    }
    default:
      console.warn(`[EventTransformer] Unknown table: ${payload.table}`);
      return null;
  }
}
