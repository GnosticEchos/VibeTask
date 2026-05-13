/**
 * WebSocket Receiver Filter
 * 
 * Determines which users should receive WebSocket messages
 * based on project membership and permissions.
 */

import { prisma } from '../../infrastructure/auth/prisma.js';

/**
 * Type for remote sockets returned by fetchSockets()
 */
interface RemoteSocket {
  id: string;
  data: {
    user?: {
      id: number;
      [key: string]: any;
    };
  };
  emit: (event: string, ...args: any[]) => void;
}

/**
 * Get list of user IDs that are members of a project
 */
export async function getProjectMemberUserIds(projectId: number): Promise<number[]> {
  const memberships = await prisma.projectUser.findMany({
    where: { projectId },
    select: { userId: true },
  });
  
  return memberships.map(m => m.userId);
}

/**
 * Get receiver IDs for websocket broadcasts:
 * project members + project owner (owner may not have ProjectUser row).
 */
export async function getProjectReceiverUserIds(projectId: number): Promise<number[]> {
  const [memberships, project] = await Promise.all([
    prisma.projectUser.findMany({
      where: { projectId },
      select: { userId: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    }),
  ]);

  const userIds = new Set<number>(memberships.map((m) => m.userId));
  if (project?.ownerId) {
    userIds.add(project.ownerId);
  }
  return [...userIds];
}

/**
 * Get list of all project members (detailed info)
 */
export async function getProjectMembers(projectId: number) {
  const memberships = await prisma.projectUser.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          surname: true,
          avatarUrl: true,
        },
      },
    },
  });
  
  return memberships;
}

/**
 * Check if a user is a member of a project (including owner)
 */
export async function isProjectMember(userId: number, projectId: number): Promise<boolean> {
  const [membership, project] = await Promise.all([
    prisma.projectUser.findFirst({
      where: { projectId, userId },
    }),
    prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
    }),
  ]);
  
  return !!(membership || project);
}

/**
 * Get receivers for a database event based on table and project
 */
export async function getEventReceivers(
  table: string,
  projectId: number | null,
  data: any
): Promise<number[]> {
  // If no project ID, return empty array (shouldn't happen for most events)
  if (!projectId) {
    // For projects being created, the projectId is in data.id
    if (table === 'Project' && data?.id) {
      // Get members of the project (including the owner)
      return getProjectReceiverUserIds(data.id);
    }
    return [];
  }
  
  switch (table) {
    case 'Task':
    case 'ProjectColumn':
    case 'ProjectUser':
      // These all broadcast to project members
      return getProjectReceiverUserIds(projectId);
    
    case 'Project':
      // Project updates go to all members
      return getProjectReceiverUserIds(data.id || projectId);
    
    default:
      return [];
  }
}

/**
 * Filter sockets by authorized user IDs
 * Returns sockets that belong to users in the authorized list
 */
export function filterSocketsByUsers(
  sockets: RemoteSocket[],
  authorizedUserIds: number[]
): RemoteSocket[] {
  // Use Set for O(1) lookup performance
  const authorizedSet = new Set(authorizedUserIds);
  return sockets.filter(socket => {
    const rawUserId = socket.data.user?.id;
    const userId = typeof rawUserId === 'number' ? rawUserId : Number(rawUserId);
    return Number.isFinite(userId) && authorizedSet.has(userId);
  });
}
