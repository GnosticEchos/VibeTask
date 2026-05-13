/**
 * Prisma Client Singleton
 * 
 * Separated from auth module to avoid circular dependencies.
 * Both Better Auth and the rest of the app import from here.
 * 
 * Uses Prisma 7 with @prisma/adapter-pg for connection pooling.
 * Error handling is done at the PrismaClient level, not at the pool level.
 */

import { PrismaClient } from '../../../prisma/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, DatabaseError } from 'pg';

// Singleton pattern to prevent multiple PrismaClient instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Configurable pool size with sensible default
const poolSize = parseInt(process.env.DB_POOL_SIZE || '20', 10);
const pool = new Pool({ 
  connectionString, 
  max: poolSize,
  // Match Prisma ORM v6 defaults for timeout behavior
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 300_000,
});

// Pool health tracking for monitoring (not for automatic reconnection)
let poolHealthy = true;

// Error classification for pool errors
const FATAL_ERROR_CODES = ['ECONNREFUSED', 'ENOTFOUND', '28P01', '28000']; // auth failed, connection refused

pool.on('error', (err: Error) => {
  // Cast to DatabaseError to access the code property
  const dbError = err as Partial<DatabaseError>;
  
  // Classify error as fatal or recoverable
  if (dbError.code && FATAL_ERROR_CODES.includes(dbError.code)) {
    console.error('[Prisma Pool] Fatal database error - application should restart:', err.message);
    poolHealthy = false;
    // Don't exit here - let the application handle it gracefully
    // The error will propagate to PrismaClient operations
  } else {
    // Recoverable error - log and mark pool as unhealthy
    console.error('[Prisma Pool] Recoverable database error:', err.message);
    poolHealthy = false;
  }
});

pool.on('connect', () => {
  poolHealthy = true;
});

const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' && process.env.LOG_QUERIES === 'true' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// Re-export PrismaClient for convenience
export { PrismaClient } from '../../../prisma/generated/prisma/client';
export type { PrismaClient as PrismaClientType } from '../../../prisma/generated/prisma/client';

// Export pool health check function for monitoring
export function isPoolHealthy(): boolean {
  return poolHealthy;
}

// Export commonly used types - only export types that are actually used in the codebase
export {
  UserRole,
  AgentPermissionLevel,
  ColumnType,
  type RateLimitConfig,
  type User,
  type Project,
  type Task,
  type ProjectColumn,
  type ProjectUser,
  type TaskComment,
  type TaskLog,
  type AgentDelegation,
  type AgentAuditLog,
  type AgentLifecycleAuditLog,
  type Session,
  type Account,
  type Verification,
  type apikey,
} from '../../../prisma/generated/prisma/client';
