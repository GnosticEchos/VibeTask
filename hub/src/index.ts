/**
 * Kanban Backend Rewrite
 * 
 * Architecture:
 * - Infrastructure: HTTP server, WebSocket, Auth
 * - Domain: Entities, Services, Repositories
 * - API: Controllers (maintaining frontend compatibility)
 * 
 * Dependencies:
 * - Better Auth for authentication
 * - Socket.IO for WebSockets
 * - Prisma for database
 * - pg-listen for PostgreSQL notifications
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { toNodeHandler } from 'better-auth/node';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import { auth, getUserIdFromRequest } from './infrastructure/auth/index.js';
import { prisma } from './infrastructure/auth/index.js';
import authRoutes from './api/routes/auth.js';
import projectsRoutes from './api/routes/projects.js';
import tasksRoutes from './api/routes/tasks.js';
import taskSearchRoutes from './api/routes/tasks-search.js';
import columnsRoutes from './api/routes/columns.js';
import membersRoutes from './api/routes/members.js';
import usersRoutes from './api/routes/users.js';
import agentsRoutes from './api/routes/agents.js';
import delegationsRoutes from './api/routes/agents/delegations.js';
import agentRouter from './api/routes/agent/index.js';
import adminRateLimitsRoutes from './api/routes/admin/rate-limits.js';
import adminUsersRoutes from './api/routes/admin/users.js';
import adminHealthRoutes from './api/routes/admin/health.js';
import adminAuditLogRoutes from './api/routes/admin/audit-log.js';
import adminPlatformAgentsRoutes from './api/routes/admin/platform-agents.js';
import documentsRoutes from './api/routes/documents.js';
import taskDocLinksRoutes from './api/routes/task-doc-links.js';
import planAcceptanceRoutes from './api/routes/plan-acceptance.js';
import monitorPassRoutes from './api/routes/monitor-pass.js';
import { runSystemHealthCheck } from './infrastructure/http/system-health.js';
import { setSocketIOServer } from './infrastructure/websocket/io-registry.js';
import { createDynamicRateLimiter } from './infrastructure/http/rate-limiter.js';
import { RateLimitService } from './domain/services/rate-limit.service.js';
import { startDatabaseListener } from './infrastructure/database/pg-listener.js';
import { ensureWebsocketTriggers } from './infrastructure/database/ensure-websocket-triggers.js';
import { getRoomName, CHANNELS } from './infrastructure/websocket/channels.js';
import { initializeBroadcaster } from './infrastructure/websocket/broadcaster.js';
import { errorHandler, notFoundHandler } from './infrastructure/http/middleware/error-handler.js';
import openapiSpec from './openapi.json';

// WebSocket payload validation schemas
const subscribePayloadSchema = z.object({
  channel: z.string().min(1, 'Channel name is required'),
  params: z.record(z.string(), z.any()).optional(),
});

const unsubscribePayloadSchema = z.object({
  channel: z.string().min(1, 'Channel name is required'),
});

// Config
const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '8080', 10);

// Express app
const app = express();

// CORS configuration
const corsOrigins = process.env.DEVELOPMENT_FE_ORIGIN?.split(',') || [
  'http://localhost:4000',
];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Better Auth handler - must be before express.json() for proper cookie handling
// Express 5 requires named wildcards like /*splat for catch-all routes
app.all('/api/auth/*splat', toNodeHandler(auth));

// Express json middleware
app.use(express.json());

// Apply dynamic rate limiting middleware globally
app.use(createDynamicRateLimiter());

// HTTP Server
const httpServer = createServer(app);

// Separate WebSocket HTTP server for port 8080
const wsHttpServer = createServer();

// Socket.IO server on separate port
const io = new Server(wsHttpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});
setSocketIOServer(io);

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.Authorization;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  try {
    // Validate Better Auth session token
    const session = await auth.api.getSession({
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    
    if (!session) {
      return next(new Error('Invalid session'));
    }
    
    // Attach user to socket for later use
    socket.data.user = session.user;
    next();
  } catch {
    next(new Error('Authentication failed'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}, user: ${socket.data.user?.email}`);
  
  // Send welcome message per contract
  socket.emit('welcome', { type: 'welcome', message: 'Welcome!' });
  
  // Handle subscribe - updated to use getRoomName with validation
  socket.on('subscribe', (data) => {
    const validation = subscribePayloadSchema.safeParse(data);
    if (!validation.success) {
      socket.emit('error', { message: 'Invalid subscribe payload', errors: validation.error.format() });
      return;
    }
    
    const { channel, params } = validation.data;
    if (channel === CHANNELS.SETTINGS_LAYOUT) {
      const p = (params || {}) as Record<string, unknown>;
      const uid = Number(p.userId);
      const authId = Number((socket.data.user as { id?: unknown } | undefined)?.id);
      if (!Number.isFinite(uid) || !Number.isFinite(authId) || uid !== authId) {
        socket.emit('error', { message: 'Forbidden: invalid settings layout subscription' });
        return;
      }
    }
    const room = getRoomName(channel as any, params || {});
    socket.join(room);
    socket.emit('confirmSubscription', { channel });
    console.log(`[WS] ${socket.id} subscribed to ${room}`);
  });
  
  // Handle unsubscribe - updated to use channel matching with validation
  socket.on('unsubscribe', (data) => {
    const validation = unsubscribePayloadSchema.safeParse(data);
    if (!validation.success) {
      socket.emit('error', { message: 'Invalid unsubscribe payload', errors: validation.error.format() });
      return;
    }
    
    const { channel } = validation.data;
    const rooms = Array.from(socket.rooms);
    rooms.forEach(room => {
      if (room.startsWith(channel)) {
        socket.leave(room);
      }
    });
    socket.emit('confirmUnsubscription', { channel });
    console.log(`[WS] ${socket.id} unsubscribed from ${channel}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

initializeBroadcaster(io);

// Legacy Auth routes (for backward compatibility)
app.use('/api', authRoutes);

// Projects routes
app.use('/api/projects', projectsRoutes);

// Search routes - cleaner path structure
app.use('/api/search', taskSearchRoutes);
app.use('/api/tasks', tasksRoutes);

// Columns routes
app.use('/api/columns', columnsRoutes);

// Members routes
app.use('/api/members', membersRoutes);

// User account routes
app.use('/api/users', usersRoutes);

// Agents routes
app.use('/api/agents', agentsRoutes);
app.use('/api/agents/:agentId/delegations', delegationsRoutes);

// Admin routes
app.use('/api/admin/rate-limits', adminRateLimitsRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/health', adminHealthRoutes);
app.use('/api/admin/audit-log', adminAuditLogRoutes);
app.use('/api/admin/platform-agents', adminPlatformAgentsRoutes);

app.use('/api/agent', agentRouter);

// Documents (Knowledge Hub)
app.use('/api/projects/:projectId/docs', documentsRoutes);
app.use('/api/projects/:projectId/tasks/:taskId/doc-links', taskDocLinksRoutes);
app.use('/api/projects/:projectId/accept-plan/:taskId', planAcceptanceRoutes);
app.use('/api/tasks', monitorPassRoutes);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Swagger JSON endpoint
app.get('/api-docs.json', (req, res) => {
  res.json(openapiSpec);
});

// Health check
app.get('/health', async (req, res) => {
  const { body, statusCode } = await runSystemHealthCheck(prisma, { server: io, port: WS_PORT });
  res.status(statusCode).json(body);
});

// WebSocket health check endpoint
app.get('/health/websocket', async (req, res) => {
  const health: {
    status: 'ok' | 'error';
    timestamp: string;
    websocket: {
      enabled: boolean;
      port: number;
      connectedClients: number;
      status: 'connected' | 'disconnected';
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: {
      enabled: true,
      port: WS_PORT,
      connectedClients: 0,
      status: 'connected',
    },
  };

  try {
    const socketCount = io.sockets.sockets.size;
    health.websocket.connectedClients = socketCount;
    health.websocket.status = 'connected';
  } catch {
    health.status = 'error';
    health.websocket.status = 'disconnected';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start HTTP server
httpServer.listen(PORT, async () => {
  console.log(`[HTTP] Server running on port ${PORT}`);
  console.log(`[AUTH] Better Auth endpoints available at /api/auth/*`);
  
  // Initialize default rate limit configurations
  try {
    await RateLimitService.initializeDefaults();
    console.log('[RATE LIMIT] Default configurations initialized');
  } catch (error) {
    console.error('[RATE LIMIT] Failed to initialize defaults:', error);
  }
  
  // Start PostgreSQL LISTEN for database notifications
  try {
    await ensureWebsocketTriggers();
    await startDatabaseListener();
    console.log('[PG-LISTEN] Database notification listener started');
  } catch (error) {
    console.error('[PG-LISTEN] Failed to start database listener:', error);
    // Don't exit - server can still work without real-time updates
  }
});

// Start WebSocket server on separate port
wsHttpServer.listen(WS_PORT, () => {
  console.log(`[WS] Server running on port ${WS_PORT}`);
  console.log('[Broadcaster] WebSocket broadcaster ready');
});

export { app, io, prisma, getUserIdFromRequest };