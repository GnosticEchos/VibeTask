/**
 * WebSocket Channel Definitions
 * 
 * These channels match the frontend contract exactly.
 * See: REWRITEPLAN/WEBSOCKET_CONTRACT.md
 */

export const CHANNELS = {
  // Tasks
  TASKS_INDEX: 'TasksIndexChannel',
  TASK_INDEX: 'TaskIndexChannel',
  
  // Columns
  COLUMNS_INDEX: 'ColumnsIndexChannel',
  
  // Members
  MEMBERS_INDEX: 'MembersIndexChannel',
  MEMBER_INDEX: 'MemberIndexChannel',
  
  // Projects
  PROJECT_INDEX: 'ProjectIndexChannel',
  USER_PROJECTS: 'UserProjectsIndexChannel',

  /** Per-user room: settings hub layout sync across tabs (see `settings-layout:updated` event). */
  SETTINGS_LAYOUT: 'SettingsLayoutChannel',

  // Documents (Knowledge Hub)
  DOCUMENTS_INDEX: 'DocumentsIndexChannel',
} as const;

export type ChannelName = typeof CHANNELS[keyof typeof CHANNELS];

export type ChannelParams = {
  [CHANNELS.TASKS_INDEX]: { projectId: number };
  [CHANNELS.TASK_INDEX]: { projectId: number; taskId: number };
  [CHANNELS.COLUMNS_INDEX]: { projectId: number };
  [CHANNELS.MEMBERS_INDEX]: { projectId: number };
  [CHANNELS.MEMBER_INDEX]: { projectId: number; memberId: number };
  [CHANNELS.PROJECT_INDEX]: { projectId: number };
  [CHANNELS.USER_PROJECTS]: {};
  [CHANNELS.SETTINGS_LAYOUT]: { userId: number };
  [CHANNELS.DOCUMENTS_INDEX]: { projectId: number };
};

/**
 * Generate a room name from channel and params
 * This creates a unique identifier for Socket.IO rooms
 * Keys are sorted to ensure consistent room names regardless of object key order
 */
export function getRoomName<C extends ChannelName>(
  channel: C,
  params: ChannelParams[C]
): string {
  // Sort keys to ensure consistent room names
  const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
    (obj as any)[key] = (params as any)[key];
    return obj;
  }, {} as ChannelParams[C]);
  return `${channel}:${JSON.stringify(sortedParams)}`;
}

/**
 * Parse a room name back into channel and params
 */
export function parseRoomName(roomName: string): { channel: string; params: any } | null {
  const separatorIndex = roomName.indexOf(':');
  if (separatorIndex === -1) return null;
  
  const channel = roomName.substring(0, separatorIndex);
  const paramsJson = roomName.substring(separatorIndex + 1);
  
  try {
    const params = JSON.parse(paramsJson);
    return { channel, params };
  } catch {
    return null;
  }
}
