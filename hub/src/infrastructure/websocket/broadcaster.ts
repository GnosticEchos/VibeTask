/**
 * WebSocket Broadcaster
 * 
 * Broadcasts transformed events to Socket.IO rooms with permission filtering.
 * This is a single-instance implementation (no Redis needed for small deployments).
 */

import type { Server } from 'socket.io';
import {
  transformTaskEvent,
  transformColumnEvent,
  transformMemberEvent,
  transformProjectEvent,
  type DBPayload,
  type TransformedMessage,
} from '../../services/websocket/event-transformer.js';
import { getEventReceivers, filterSocketsByUsers } from '../../services/websocket/receiver-filter.js';
import { getRoomName, CHANNELS, type ChannelName } from './channels.js';

/** Payload for cross-tab settings layout sync (Socket.IO event `settings-layout:updated`). */
export type SettingsLayoutWsPayload = { layout: unknown | null };

// Re-export for convenience
export type { DBPayload };

/**
 * Broadcaster class to handle WebSocket broadcasts
 * Eliminates circular dependency by accepting io instance
 */
export class WebSocketBroadcaster {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Broadcast a message to a specific channel with permission filtering
   */
  async broadcastToChannel(
    channelName: ChannelName,
    roomParams: any,
    message: TransformedMessage,
    authorizedUserIds: number[]
  ): Promise<void> {
    const roomName = getRoomName(channelName, roomParams);

    try {
      // Get all sockets in the room
      const sockets = await this.io.in(roomName).fetchSockets();

      // Filter to only authorized users
      const authorizedSockets = filterSocketsByUsers(sockets, authorizedUserIds);

      // Send to authorized sockets
      for (const socket of authorizedSockets) {
        socket.emit('message', message);
      }

      if (authorizedSockets.length > 0) {
        console.log(`[Broadcaster] Sent to ${authorizedSockets.length} clients in ${channelName}`);
      }
    } catch (error) {
      console.error(`[Broadcaster] Error broadcasting to ${channelName}:`, error);
    }
  }

  /**
   * Handle task-related broadcasts
   */
  async handleTaskBroadcast(payload: DBPayload): Promise<void> {
    const transformed = transformTaskEvent(payload);

    if (!transformed) {
      console.warn('[Broadcaster] Failed to transform task event:', payload);
      return;
    }

    // Get authorized receivers for this project
    const receivers = await getEventReceivers(
      payload.table,
      payload.projectId,
      payload.data
    );

    if (receivers.length === 0) {
      console.log('[Broadcaster] No receivers for task event');
      return;
    }

    // Broadcast to TasksIndexChannel
    await this.broadcastToChannel(
      CHANNELS.TASKS_INDEX,
      { projectId: payload.projectId },
      transformed,
      receivers
    );

    // Also broadcast to TaskIndexChannel for single task updates
    await this.broadcastToChannel(
      CHANNELS.TASK_INDEX,
      { projectId: payload.projectId, taskId: payload.id },
      transformed,
      receivers
    );
  }

  /**
   * Handle column-related broadcasts
   */
  async handleColumnBroadcast(payload: DBPayload): Promise<void> {
    const transformed = transformColumnEvent(payload);

    if (!transformed) {
      console.warn('[Broadcaster] Failed to transform column event:', payload);
      return;
    }

    const receivers = await getEventReceivers(
      payload.table,
      payload.projectId,
      payload.data
    );

    if (receivers.length === 0) {
      console.log('[Broadcaster] No receivers for column event');
      return;
    }

    await this.broadcastToChannel(
      CHANNELS.COLUMNS_INDEX,
      { projectId: payload.projectId },
      transformed,
      receivers
    );
  }

  /**
   * Handle member-related broadcasts
   */
  async handleMemberBroadcast(payload: DBPayload): Promise<void> {
    const transformed = await transformMemberEvent(payload);

    if (!transformed) {
      console.warn('[Broadcaster] Failed to transform member event:', payload);
      return;
    }

    const receivers = await getEventReceivers(
      payload.table,
      payload.projectId,
      payload.data
    );

    if (receivers.length === 0) {
      console.log('[Broadcaster] No receivers for member event');
      return;
    }

    // Broadcast to MembersIndexChannel
    await this.broadcastToChannel(
      CHANNELS.MEMBERS_INDEX,
      { projectId: payload.projectId },
      transformed,
      receivers
    );

    // Also broadcast to MemberIndexChannel
    await this.broadcastToChannel(
      CHANNELS.MEMBER_INDEX,
      { projectId: payload.projectId, memberId: payload.id },
      transformed,
      receivers
    );
  }

  /**
   * Handle project-related broadcasts
   */
  async handleProjectBroadcast(payload: DBPayload): Promise<void> {
    const transformed = transformProjectEvent(payload);

    if (!transformed) {
      console.warn('[Broadcaster] Failed to transform project event:', payload);
      return;
    }

    const receivers = await getEventReceivers(
      payload.table,
      payload.projectId,
      payload.data
    );

    if (receivers.length === 0) {
      console.log('[Broadcaster] No receivers for project event');
      return;
    }

    // Broadcast to UserProjectsIndexChannel
    await this.broadcastToChannel(
      CHANNELS.USER_PROJECTS,
      {},
      transformed.userProjects,
      receivers
    );

    // Broadcast to ProjectIndexChannel
    await this.broadcastToChannel(
      CHANNELS.PROJECT_INDEX,
      { projectId: payload.id },
      transformed.projectIndex,
      receivers
    );
  }

  /**
   * Main entry point for broadcasting database events
   * Called by pg-listen handlers
   */
  /**
   * Notify all sockets subscribed to this user's SettingsLayoutChannel (other tabs / devices).
   * Event name: `settings-layout:updated`
   */
  notifySettingsLayoutUpdated(userId: number, layout: unknown | null): void {
    const roomName = getRoomName(CHANNELS.SETTINGS_LAYOUT, { userId });
    const payload: SettingsLayoutWsPayload = { layout };
    this.io.to(roomName).emit('settings-layout:updated', payload);
  }

  async broadcastDatabaseEvent(payload: DBPayload): Promise<void> {
    console.log(`[Broadcaster] Received ${payload.action} on ${payload.table} (id: ${payload.id})`);

    try {
      switch (payload.table) {
        case 'Task':
          await this.handleTaskBroadcast(payload);
          break;
        case 'ProjectColumn':
          await this.handleColumnBroadcast(payload);
          break;
        case 'ProjectUser':
          await this.handleMemberBroadcast(payload);
          break;
        case 'Project':
          await this.handleProjectBroadcast(payload);
          break;
        default:
          console.warn(`[Broadcaster] Unknown table: ${payload.table}`);
      }
    } catch (error) {
      console.error('[Broadcaster] Error handling broadcast:', error);
    }
  }
}

// Singleton instance (will be initialized in index.ts)
let broadcasterInstance: WebSocketBroadcaster | null = null;

/**
 * Initialize the broadcaster with the Socket.IO server instance
 * Call this once at startup from index.ts
 */
export function initializeBroadcaster(io: Server): WebSocketBroadcaster {
  broadcasterInstance = new WebSocketBroadcaster(io);
  return broadcasterInstance;
}

/**
 * Get the broadcaster instance
 * Throws if not initialized
 */
export function getBroadcaster(): WebSocketBroadcaster {
  if (!broadcasterInstance) {
    throw new Error('Broadcaster not initialized. Call initializeBroadcaster first.');
  }
  return broadcasterInstance;
}
