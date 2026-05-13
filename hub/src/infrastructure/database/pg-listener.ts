/**
 * PostgreSQL LISTEN/NOTIFY Client
 * 
 * Uses pg-listen for robust connection handling with automatic reconnection.
 * Listens for database triggers and broadcasts events to WebSocket clients.
 */

import createSubscriber from 'pg-listen';
import { getBroadcaster } from '../websocket/broadcaster.js';
import type { DBPayload } from '../../services/websocket/event-transformer.js';

// Database channels we listen to (must match trigger channel names)
const DB_CHANNELS = {
  TASK: 'db:task:change',
  COLUMN: 'db:column:change',
  MEMBER: 'db:member:change',
  PROJECT: 'db:project:change',
} as const;

// Create subscriber with reconnection logic
// Note: pg-listen handles reconnection automatically with built-in exponential backoff
const subscriber = createSubscriber({
  connectionString: process.env.DATABASE_URL,
});

// Connection state tracking
let isConnected = false;

// Event logging
subscriber.events.on('error', (error) => {
  console.error('[PG-LISTEN] Fatal error:', error);
  isConnected = false;
});

subscriber.events.on('connected', () => {
  console.log('[PG-LISTEN] Connected to PostgreSQL notification system');
  isConnected = true;
});

subscriber.events.on('reconnect', (attempt) => {
  console.log(`[PG-LISTEN] Reconnecting (attempt ${attempt})...`);
  isConnected = false;
});

// Note: pg-listen events interface only exposes 'connected', 'error', 'notification', and 'reconnect'.
// We use 'error' and 'reconnect' to detect disconnection, and 'connected' to confirm active state.

/**
 * Parse and validate incoming notification payload
 */
function parsePayload(payload: any): DBPayload | null {
  try {
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }
    
    // Validate required fields
    if (!payload.table || !payload.action || payload.id === undefined) {
      console.warn('[PG-LISTEN] Invalid payload structure:', payload);
      return null;
    }
    
    return payload as DBPayload;
  } catch (error) {
    console.error('[PG-LISTEN] Failed to parse payload:', error);
    return null;
  }
}

/**
 * Generic handler for all database change notifications
 */
async function handleNotification(payload: any): Promise<void> {
  const parsed = parsePayload(payload);
  
  if (!parsed) {
    return;
  }
  
  console.log(`[PG-LISTEN] ${parsed.action} on ${parsed.table} (id: ${parsed.id})`);
  
  // Delegate to broadcaster - await to catch any errors
  try {
    await getBroadcaster().broadcastDatabaseEvent(parsed);
  } catch (error) {
    console.error('[PG-LISTEN] Error broadcasting event:', error);
  }
}

/**
 * Start listening to database notifications
 */
export async function startDatabaseListener(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  console.log('[PG-LISTEN] Starting database listener...');
  
  // Connect to PostgreSQL
  await subscriber.connect();
  
  // Subscribe to all database channels
  await subscriber.listenTo(DB_CHANNELS.TASK);
  await subscriber.listenTo(DB_CHANNELS.COLUMN);
  await subscriber.listenTo(DB_CHANNELS.MEMBER);
  await subscriber.listenTo(DB_CHANNELS.PROJECT);
  
  // Set up notification handlers
  subscriber.notifications.on(DB_CHANNELS.TASK, handleNotification);
  subscriber.notifications.on(DB_CHANNELS.COLUMN, handleNotification);
  subscriber.notifications.on(DB_CHANNELS.MEMBER, handleNotification);
  subscriber.notifications.on(DB_CHANNELS.PROJECT, handleNotification);
  
  console.log('[PG-LISTEN] Listening on channels:', Object.values(DB_CHANNELS));
}

/**
 * Stop the database listener gracefully
 */
export async function stopDatabaseListener(): Promise<void> {
  console.log('[PG-LISTEN] Stopping database listener...');
  await subscriber.close();
}

/**
 * Get connection status
 */
export function isListenerConnected(): boolean {
  return isConnected;
}
