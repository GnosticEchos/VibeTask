/**
 * Test Database Connection
 * 
 * Provides database connection for integration tests with:
 * - Real database connections (no mocks)
 * - Transaction support for test isolation
 * - Cleanup tracking for entities created during tests
 * 
 * IMPORTANT: This uses the SAME database as development/production.
 * Tests must only destroy data they create (IDs > 10000).
 * 
 * IMPORTANT: We re-export the app's prisma client to ensure all database
 * operations use the same connection pool. This prevents issues where data
 * created via API routes isn't visible to test helpers.
 */

// Re-export the app's prisma client to ensure consistency
// This must be imported from test-server.ts which loads .env.test first
import { prisma } from './test-server.js';

// Use the app's prisma client for all test database operations
export const testPrisma = prisma;

/**
 * Entity tracking for cleanup
 * All entities created during tests should be tracked here
 * Only entities with IDs > 10000 should be tracked (to protect existing data)
 */
export const createdEntities = {
  users: new Set<number>(),
  projects: new Set<number>(),
  columns: new Set<number>(),
  tasks: new Set<number>(),
  comments: new Set<number>(),
  sessions: new Set<number>(),
  accounts: new Set<number>(),
  projectUsers: new Set<number>(),
  taskLogs: new Set<number>(),
  agentDelegations: new Set<string>(),
  agentAuditLogs: new Set<string>(),
};

/**
 * Minimum ID for existing test data that should never be modified
 * Entities with IDs <= this value are considered existing data
 */
export const MIN_TEST_ID = 10000;

const isTestVerbose = process.env.TEST_VERBOSE === 'true';

/**
 * Track a created entity for cleanup
 * Tracks ALL entities created during tests, regardless of ID.
 * The tracking system ensures we only delete what we created.
 */
export function trackEntity(type: keyof typeof createdEntities, id: number | string): void {
  // Convert string IDs to numbers for numeric entity types
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  
  // For string-based IDs (like agent delegations), store as string
  // For numeric IDs, store as number
  if (typeof id === 'string' && isNaN(numericId)) {
    createdEntities[type].add(id as never);
  } else {
    createdEntities[type].add(numericId as never);
  }
  
  // Log tracking for debugging
  if (process.env.TEST_DEBUG === 'true') {
    console.log(`[Track] ${type}: ${id}`);
  }
}

/**
 * Clear all tracked entities (doesn't delete from DB, just clears tracking)
 */
export function clearTrackedEntities(): void {
  Object.keys(createdEntities).forEach(key => {
    createdEntities[key as keyof typeof createdEntities].clear();
  });
}

/**
 * Get count of tracked entities for debugging
 */
export function getTrackedCounts(): Record<string, number> {
  return {
    users: createdEntities.users.size,
    projects: createdEntities.projects.size,
    columns: createdEntities.columns.size,
    tasks: createdEntities.tasks.size,
    comments: createdEntities.comments.size,
    sessions: createdEntities.sessions.size,
    accounts: createdEntities.accounts.size,
    projectUsers: createdEntities.projectUsers.size,
    taskLogs: createdEntities.taskLogs.size,
    agentDelegations: createdEntities.agentDelegations.size,
    agentAuditLogs: createdEntities.agentAuditLogs.size,
  };
}

/**
 * Delete all tracked entities from the database
 * Called after each test or test suite to clean up
 */
export async function cleanupTrackedEntities(): Promise<void> {
  const counts = getTrackedCounts();
  const totalTracked = Object.values(counts).reduce((sum, n) => sum + n, 0);
  
  if (totalTracked === 0) {
    return; // Nothing to clean up
  }

  if (isTestVerbose) {
    console.log(`[Cleanup] Cleaning up ${totalTracked} tracked entities:`, counts);
  }

  try {
    // Delete in reverse dependency order
    
    // Agent audit logs
    if (createdEntities.agentAuditLogs.size > 0) {
      await testPrisma.agentAuditLog.deleteMany({
        where: { id: { in: Array.from(createdEntities.agentAuditLogs) } },
      });
    }
    
    // Agent delegations
    if (createdEntities.agentDelegations.size > 0) {
      await testPrisma.agentDelegation.deleteMany({
        where: { id: { in: Array.from(createdEntities.agentDelegations) } },
      });
    }
    
    // Task logs
    if (createdEntities.taskLogs.size > 0) {
      await testPrisma.taskLog.deleteMany({
        where: { id: { in: Array.from(createdEntities.taskLogs) } },
      });
    }
    
    // Task comments
    if (createdEntities.comments.size > 0) {
      await testPrisma.taskComment.deleteMany({
        where: { id: { in: Array.from(createdEntities.comments) } },
      });
    }
    
    // Tasks
    if (createdEntities.tasks.size > 0) {
      await testPrisma.task.deleteMany({
        where: { id: { in: Array.from(createdEntities.tasks) } },
      });
    }
    
    // Project columns
    if (createdEntities.columns.size > 0) {
      await testPrisma.projectColumn.deleteMany({
        where: { id: { in: Array.from(createdEntities.columns) } },
      });
    }
    
    // Project users
    if (createdEntities.projectUsers.size > 0) {
      await testPrisma.projectUser.deleteMany({
        where: { id: { in: Array.from(createdEntities.projectUsers) } },
      });
    }
    
    // Projects
    if (createdEntities.projects.size > 0) {
      await testPrisma.project.deleteMany({
        where: { id: { in: Array.from(createdEntities.projects) } },
      });
    }
    
    // Sessions
    if (createdEntities.sessions.size > 0) {
      await testPrisma.session.deleteMany({
        where: { id: { in: Array.from(createdEntities.sessions) } },
      });
    }
    
    // Accounts
    if (createdEntities.accounts.size > 0) {
      await testPrisma.account.deleteMany({
        where: { id: { in: Array.from(createdEntities.accounts) } },
      });
    }
    
    // Users (must be last due to foreign key constraints)
    if (createdEntities.users.size > 0) {
      await testPrisma.user.deleteMany({
        where: { id: { in: Array.from(createdEntities.users) } },
      });
    }
    
    if (isTestVerbose) {
      console.log(`[Cleanup] Successfully cleaned up ${totalTracked} entities`);
    }
  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error);
    throw error;
  } finally {
    // Always clear tracking, even if deletion failed
    clearTrackedEntities();
  }
}

/**
 * Connect to the test database
 * Called in beforeAll hook
 */
/**
 * After CSV restore / manual inserts with explicit ids, PostgreSQL serial sequences can stay
 * near 1 while rows already occupy those ids — the next INSERT then hits unique constraint on id.
 * Bump each sequence to at least MAX(id) so autoincrement creates do not collide.
 */
export async function syncPostgresSequencesToMaxIds(): Promise<void> {
  const tables = [
    'User',
    'Session',
    'Account',
    'Verification',
    'Project',
    'ProjectColumn',
    'Task',
    'ProjectUser',
    'TaskComment',
    'TaskLog',
    'RateLimitConfig',
    'AdminAuditLog',
  ];
  for (const table of tables) {
    const rows = await testPrisma.$queryRawUnsafe<{ m: number | null }[]>(
      `SELECT MAX(id) AS m FROM "${table}"`,
    );
    const maxId = rows[0]?.m ?? null;
    if (maxId == null) {
      await testPrisma.$executeRawUnsafe(`
        SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 1, false);
      `);
    } else {
      await testPrisma.$executeRawUnsafe(`
        SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), ${maxId}, true);
      `);
    }
  }
}

export async function connectTestDatabase(): Promise<void> {
  await testPrisma.$connect();
  // Align with migration 20260327130000 when test DB has not run migrate deploy yet
  await testPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserSettingsLayout" (
      "userId" INTEGER NOT NULL,
      "payload" JSONB NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserSettingsLayout_pkey" PRIMARY KEY ("userId")
    );
  `);
  await testPrisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'UserSettingsLayout_userId_fkey'
      ) THEN
        ALTER TABLE "UserSettingsLayout" ADD CONSTRAINT "UserSettingsLayout_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await testPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
      "id" SERIAL NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "actorUserId" INTEGER NOT NULL,
      "action" VARCHAR(64) NOT NULL,
      "targetUserId" INTEGER,
      "metadata" JSONB,
      CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
    );
  `);
  await testPrisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AdminAuditLog_actorUserId_fkey'
      ) THEN
        ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
        FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  try {
    await testPrisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");`,
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");`,
    );
  } catch {
    /* indexes may exist */
  }

  await syncPostgresSequencesToMaxIds();
}

/**
 * Disconnect from the test database
 * Called in afterAll hook
 */
export async function disconnectTestDatabase(): Promise<void> {
  await cleanupTrackedEntities();
  await testPrisma.$disconnect();
}

/**
 * Execute a function within a database transaction
 * Useful for tests that need transaction isolation
 * 
 * @param fn - Function to execute within transaction
 * @returns Result of the function
 * 
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const user = await tx.user.create({ data: { ... } });
 *   return user;
 * });
 */
export async function withTransaction<T>(
  fn: (tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return testPrisma.$transaction(fn);
}

/**
 * Reset sequence for auto-increment columns
 * Useful when tests need predictable IDs
 * 
 * @param tableName - Name of the table to reset sequence for
 * @param startId - Starting ID for the sequence (default: MIN_TEST_ID + 1)
 */
export async function resetSequence(
  tableName: string, 
  startId: number = MIN_TEST_ID + 1
): Promise<void> {
  await testPrisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), ${startId}, false)`
  );
}

export default testPrisma;
