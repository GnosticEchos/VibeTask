/**
 * Test Server Setup
 * 
 * Provides Express app configuration for integration tests with:
 * - HTTP request testing via supertest
 * - Full middleware stack (CORS, JSON, rate limiting)
 * - All API routes mounted
 * - No actual server listening (uses supertest's request handling)
 * 
 * @example
 * import request from 'supertest';
 * import { testApp } from './test-server';
 * 
 * const response = await request(testApp)
 *   .get('/api/session')
 *   .set('Authorization', `Bearer ${token}`);
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables BEFORE any other imports
// This ensures TEST_RATE_LIMIT is set before the app is created
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local'), override: true, quiet: true });

// Ensure NODE_ENV and TEST_RATE_LIMIT are set
process.env.NODE_ENV = 'test';
if (process.env.TEST_RATE_LIMIT === undefined) {
  process.env.TEST_RATE_LIMIT = 'false';
}

import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import swaggerUi from 'swagger-ui-express';

// Import auth configuration - use the same auth instance as the main app
// Using @ alias for proper resolution in vitest
import { auth, prisma } from '@/infrastructure/auth/index.js';
import authRoutes from '@/api/routes/auth.js';
import usersRoutes from '@/api/routes/users.js';
import projectsRoutes from '@/api/routes/projects.js';
import projectPlanningRoutes from '@/api/routes/project-planning.js';
import tasksRoutes from '@/api/routes/tasks.js';
import columnsRoutes from '@/api/routes/columns.js';
import membersRoutes from '@/api/routes/members.js';
import agentsRoutes from '@/api/routes/agents.js';
import delegationsRoutes from '@/api/routes/agents/delegations.js';
import agentRouter from '@/api/routes/agent/index.js';
import adminRateLimitsRoutes from '@/api/routes/admin/rate-limits.js';
import adminUsersRoutes from '@/api/routes/admin/users.js';
import adminHealthRoutes from '@/api/routes/admin/health.js';
import adminAuditLogRoutes from '@/api/routes/admin/audit-log.js';
import { runSystemHealthCheck } from '@/infrastructure/http/system-health.js';
import { createDynamicRateLimiter } from '@/infrastructure/http/rate-limiter.js';

// Import OpenAPI spec
import openapiSpec from '@/openapi.json' assert { type: 'json' };

/**
 * CORS origins for test environment
 * Allows requests from common test origins
 */
const TEST_CORS_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

/**
 * Create and configure Express app for testing
 * This function creates a fresh app instance for each test suite
 */
export function createTestApp(): express.Application {
  const app = express();

  // CORS configuration
  app.use(cors({
    origin: TEST_CORS_ORIGINS,
    credentials: true,
  }));

  // Better Auth handler - must be before express.json() for proper cookie handling
  // Express 5 requires named wildcards like /*splat for catch-all routes
  app.all('/api/auth/*splat', toNodeHandler(auth));

  // Express json middleware
  app.use(express.json());

  // Apply rate limiting middleware (can be disabled in tests via env var)
  if (process.env.TEST_RATE_LIMIT !== 'false') {
    app.use(createDynamicRateLimiter());
  }

  // Mount API routes - same structure as main app
  
  // Legacy Auth routes (for backward compatibility)
  app.use('/api', authRoutes);

  app.use('/api/users', usersRoutes);

  // Projects routes
  app.use('/api/projects', projectsRoutes);
  app.use('/api/projects/:projectId/planning', projectPlanningRoutes);

  // Tasks routes
  app.use('/api/tasks', tasksRoutes);

  // Columns routes
  app.use('/api/columns', columnsRoutes);

  // Members routes
  app.use('/api/members', membersRoutes);

  // Agents routes
  app.use('/api/agents', agentsRoutes);
  app.use('/api/agents/:agentId/delegations', delegationsRoutes);

  // Admin routes
  app.use('/api/admin/rate-limits', adminRateLimitsRoutes);
  app.use('/api/admin/users', adminUsersRoutes);
  app.use('/api/admin/health', adminHealthRoutes);
  app.use('/api/admin/audit-log', adminAuditLogRoutes);

  app.use('/api/agent', agentRouter);

  // Swagger UI (optional, useful for debugging)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  // Swagger JSON endpoint
  app.get('/api-docs.json', (req, res) => {
    res.json(openapiSpec);
  });

  // Health check (no Socket.IO in test app — websocket section reports unknown)
  app.get('/health', async (req, res) => {
    const { body, statusCode } = await runSystemHealthCheck(prisma, null);
    res.status(statusCode).json(body);
  });

  // WebSocket health check endpoint
  app.get('/health/websocket', (req, res) => {
    const health = {
      status: 'ok',
      websocket: {
        enabled: false, // WebSocket not available in test environment
        port: 8080,
      },
    };
    res.json(health);
  });

  // Error handling middleware - properly forward error status codes
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const statusCode = err.statusCode || err.status || 500;
    if (process.env.TEST_VERBOSE === 'true' || statusCode >= 500) {
      console.error('[Test Server] Error:', err.message || err.error);
    }

    const errorMessage = err.message || 'Internal Server Error';

    res.status(statusCode).json({ 
      error: errorMessage,
    });
  });

  return app;
}

/**
 * Default test app instance
 * Created once and reused across tests for efficiency
 */
export const testApp = createTestApp();

/**
 * Export prisma for direct database access in tests
 */
export { prisma };

/**
 * Export auth for direct auth API access in tests
 */
export { auth };

export default testApp;
