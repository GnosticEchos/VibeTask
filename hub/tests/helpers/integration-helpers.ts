/**
 * Integration Test Helpers
 * 
 * Provides high-level helper functions for integration tests:
 * - Authentication helpers (login, logout, session validation)
 * - Entity creation helpers with automatic cleanup tracking
 * - Request builders for common API operations
 * 
 * All created entities are tracked for automatic cleanup after tests.
 * 
 * @example
 * import { 
 *   authenticateUser, 
 *   createTestUser, 
 *   createTestProject,
 *   cleanupTestData 
 * } from '../helpers/integration-helpers';
 * 
 * describe('My Test', () => {
 *   afterEach(async () => {
 *     await cleanupTestData();
 *   });
 *   
 *   it('should work', async () => {
 *     const { token } = await authenticateUser('user@example.com', 'password');
 *     const project = await createTestProject(userId, { name: 'Test' });
 *   });
 * });
 */

import request from 'supertest';
import { testApp } from '../integration/setup/test-server.js';
import {
  testPrisma,
  createdEntities,
  trackEntity,
  clearTrackedEntities,
  cleanupTrackedEntities,
  MIN_TEST_ID 
} from '../integration/setup/test-db.js';

const isTestVerbose = process.env.TEST_VERBOSE === 'true';
import {
  EXISTING_USER,
  EXISTING_USERS,
  EXISTING_PROJECT_IDS,
  EXISTING_TASK_IDS,
  createTestUserData,
  createTestProjectData,
  createTestColumnData,
  createTestTaskData,
  createTestCommentData,
  createTestProjectUserData,
  generateUniquePrefix,
} from '../integration/setup/fixtures.js';
import type {
  TestUserData,
  TestProjectData,
  TestColumnData,
  TestTaskData,
  TestCommentData,
  TestProjectUserData,
  ApiLoginResponse,
  ApiUserResponse,
  ApiProjectResponse,
  ApiColumnResponse,
  ApiTaskResponse,
} from '../integration/setup/fixtures.js';

// Re-export createdEntities for direct access
export { createdEntities };

// Use testPrisma for database operations to ensure consistency
const db = testPrisma;

// =====================
// AUTHENTICATION HELPERS
// =====================

/**
 * Authenticate a user and get auth token
 * 
 * @param email - User email
 * @param password - User password
 * @returns Login response with token and user data
 * @throws Error if authentication fails
 * 
 * @example
 * const { token, user } = await authenticateUser('user@example.com', 'password');
 * // Use token for authenticated requests
 */
export async function authenticateUser(
  email: string, 
  password: string,
  options: { retries?: number } = {},
): Promise<ApiLoginResponse> {
  const maxAttempts = options.retries ?? 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await request(testApp)
      .post('/api/login')
      .send({ email, password });

    if (response.status === 200) {
      return response.body as ApiLoginResponse;
    }

    const detail = String(response.body?.error ?? response.text ?? response.status);
    lastError = new Error(`Authentication failed: ${detail}`);

    const retryable =
      detail.includes('Session_userId_fkey') ||
      detail.includes('Foreign key constraint violated');
    if (!retryable || attempt === maxAttempts - 1) {
      throw lastError;
    }

    await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
  }

  throw lastError ?? new Error('Authentication failed');
}

/**
 * Authenticate with the default existing test user
 * 
 * @returns Login response with token and user data
 */
export async function authenticateExistingUser(): Promise<ApiLoginResponse> {
  return authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
}

/**
 * CI runs `prisma migrate deploy` only (no DATADUMP seed). Integration suites that
 * call `authenticateExistingUser()` need a credential user + Better Auth Account row.
 */
export async function ensureCiBootstrapExistingUser(): Promise<void> {
  if (process.env.CI !== 'true') {
    return;
  }

  try {
    await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
  } catch {
    // User missing or Account row missing — register below.
    try {
      await registerUser({
        email: EXISTING_USER.email,
        password: EXISTING_USER.password,
        name: EXISTING_USER.name,
        surname: EXISTING_USER.surname,
      });
    } catch {
      await createTestUser({
        email: EXISTING_USER.email,
        password: EXISTING_USER.password,
        name: EXISTING_USER.name,
        surname: EXISTING_USER.surname,
      });
    }
  }

  await db.user.updateMany({
    where: { email: EXISTING_USER.email },
    data: { role: 'ADMIN' },
  });
}

/**
 * Validate a session token
 * 
 * @param token - Auth token to validate
 * @returns User data if session is valid
 * @throws Error if session is invalid
 */
export async function validateSession(token: string): Promise<ApiUserResponse> {
  const response = await request(testApp)
    .get('/api/session')
    .set('Authorization', `Bearer ${token}`);

  if (response.status !== 200) {
    throw new Error(`Session validation failed: ${response.body.error || response.status}`);
  }

  return response.body.user as ApiUserResponse;
}

/**
 * Logout a user (invalidate session)
 * 
 * @param token - Auth token to invalidate
 * @returns True if logout successful
 */
export async function logoutUser(token: string): Promise<boolean> {
  const response = await request(testApp)
    .post('/api/logout')
    .set('Authorization', `Bearer ${token}`);

  return response.status === 200;
}

/**
 * Register a new user
 * 
 * @param userData - User registration data
 * @returns Login response with token and user data
 */
export async function registerUser(
  userData: TestUserData
): Promise<ApiLoginResponse> {
  const response = await request(testApp)
    .post('/api/register')
    .send(userData);

  if (response.status !== 200) {
    throw new Error(`Registration failed: ${response.body.error || response.status}`);
  }

  return response.body as ApiLoginResponse;
}

// =====================
// USER CREATION HELPERS
// =====================

/**
 * Create a test user in the database
 * Automatically tracks the user for cleanup
 * 
 * @param overrides - Optional overrides for user data
 * @returns Created user record
 * 
 * @example
 * const user = await createTestUser({ name: 'Custom Name' });
 * console.log(user.id); // Will be > 10000
 */
export async function createTestUser(
  overrides: Partial<TestUserData> = {}
): Promise<{ id: number; email: string; name: string; surname: string | null }> {
  const userData = createTestUserData(overrides);
  
  // Use Better Auth's sign-up to create user with proper password hashing
  const response = await request(testApp)
    .post('/api/register')
    .send(userData);

  if (response.status !== 200) {
    // Fallback: create user + credential account (login requires Account, not User.password)
    const { hashPassword } = await import('better-auth/crypto');
    const user = await db.user.create({
      data: {
        email: userData.email,
        name: userData.name,
        surname: userData.surname,
        emailVerified: true,
      },
    });
    const hashed = await hashPassword(userData.password);
    const account = await db.account.create({
      data: {
        userId: user.id,
        accountId: String(user.id),
        providerId: 'credential',
        password: hashed,
      },
    });

    trackEntity('users', user.id);
    trackEntity('accounts', account.id);
    return user;
  }

  const { user: responseUser } = response.body as ApiLoginResponse;
  
  // CRITICAL: Verify the user exists in the database and get the actual ID
  // Better Auth may return string IDs, but Prisma expects integers
  // Add retry mechanism to handle database connection timing
  let dbUser = null;
  let retries = 0;
  const maxRetries = 5;
  
  while (!dbUser && retries < maxRetries) {
    dbUser = await db.user.findUnique({
      where: { email: responseUser.email },
    });
    
    if (!dbUser) {
      retries++;
      // Wait a bit for database to sync
      await new Promise(resolve => setTimeout(resolve, 50 * retries));
    }
  }
  
  if (!dbUser) {
    throw new Error(`User ${responseUser.email} was not found in database after registration (retries: ${retries})`);
  }

  // Better Auth login requires a credential Account row tied to this user id.
  let credentialAccount = null;
  retries = 0;
  while (!credentialAccount && retries < maxRetries) {
    credentialAccount = await db.account.findFirst({
      where: { userId: dbUser.id, providerId: 'credential' },
    });
    if (!credentialAccount) {
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 50 * retries));
    }
  }

  if (!credentialAccount) {
    throw new Error(
      `Credential account missing for ${dbUser.email} (user id ${dbUser.id}) after registration`,
    );
  }

  trackEntity('users', dbUser.id);
  trackEntity('accounts', credentialAccount.id);
  
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    surname: dbUser.surname,
  };
}

// =====================
// PROJECT CREATION HELPERS
// =====================

/**
 * Create a test project in the database
 * Automatically tracks the project for cleanup
 * 
 * @param userId - Owner user ID
 * @param overrides - Optional overrides for project data
 * @returns Created project record
 * 
 * @example
 * const project = await createTestProject(user.id, { name: 'My Project' });
 */
export async function createTestProject(
  userId: number,
  overrides: Partial<TestProjectData> & { bare?: boolean } = {}
): Promise<ApiProjectResponse & { id: number }> {
  const { bare, ...rest } = overrides;
  if (bare) {
    const direct = await createTestProjectDirect(userId, rest);
    return {
      ...direct,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const projectData = createTestProjectData(userId, rest);

  // Get auth token for the user
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Create project via API - use existing user's password
  const { token } = await authenticateUser(user.email, 'admin1234');

  const payload: Record<string, unknown> = {
    name: projectData.name,
    description: projectData.description,
    prefix: projectData.prefix,
  };
  if (rest.columns !== undefined) {
    payload.columns = projectData.columns;
  }
  if (rest.template !== undefined) {
    payload.template = rest.template;
  }

  const response = await request(testApp)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  if (response.status !== 200 && response.status !== 201) {
    const project = await db.project.create({
      data: {
        name: projectData.name,
        description: projectData.description,
        prefix: projectData.prefix,
        ownerId: projectData.ownerId,
        members: {
          create: {
            userId: projectData.ownerId,
            role: 'Owner',
          },
        },
      },
    });
    
    trackEntity('projects', project.id);
    return { ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() };
  }

  const project = response.body as ApiProjectResponse;
  trackEntity('projects', project.id);
  
  return project;
}

/**
 * Create a test project directly in the database (bypasses API)
 * Useful when you need to create a project without authentication
 * 
 * @param userId - Owner user ID
 * @param overrides - Optional overrides for project data
 * @returns Created project record
 */
export async function createTestProjectDirect(
  userId: number,
  overrides: Partial<TestProjectData> = {}
): Promise<{ id: number; name: string; prefix: string; ownerId: number }> {
  const projectData = createTestProjectData(userId, overrides);

  const project = await db.project.create({
    data: {
      name: projectData.name,
      description: projectData.description,
      prefix: projectData.prefix,
      ownerId: projectData.ownerId,
      members: {
        create: {
          userId: projectData.ownerId,
          role: 'Owner',
        },
      },
    },
  });
  
  trackEntity('projects', project.id);
  
  // Verify the project exists before returning
  const verified = await db.project.findUnique({
    where: { id: project.id },
  });
  
  if (!verified) {
    throw new Error(`Project ${project.id} was not found in database after creation`);
  }
  
  return project;
}

// =====================
// COLUMN CREATION HELPERS
// =====================

/**
 * Create a test column in the database
 * Automatically tracks the column for cleanup
 * 
 * @param projectId - Project ID
 * @param order - Column order (default: 1)
 * @param overrides - Optional overrides for column data
 * @returns Created column record
 */
export async function createTestColumn(
  projectId: number,
  order: number = 1,
  overrides: Partial<TestColumnData> = {}
): Promise<ApiColumnResponse & { id: number }> {
  const columnData = createTestColumnData(projectId, order, overrides);
  
  const column = await db.projectColumn.create({
    data: columnData,
  });
  
  trackEntity('columns', column.id);
  return { ...column, type: column.type || null, description: column.description };
}

// =====================
// TASK CREATION HELPERS
// =====================

/**
 * Create a test task in the database
 * Automatically tracks the task for cleanup
 * 
 * @param projectId - Project ID
 * @param createdById - User ID creating the task
 * @param projectPrefix - Project prefix for task identifier
 * @param overrides - Optional overrides for task data
 * @returns Created task record
 */
export async function createTestTask(
  projectId: number,
  createdById: number,
  projectPrefix: string,
  overrides: Partial<TestTaskData> = {}
): Promise<ApiTaskResponse & { id: number }> {
  const taskData = createTestTaskData(projectId, createdById, projectPrefix, overrides);
  
  const task = await db.task.create({
    data: taskData,
  });
  
  trackEntity('tasks', task.id);
  return { 
    ...task, 
    createdAt: task.createdAt.toISOString(), 
    updatedAt: task.updatedAt.toISOString() 
  };
}

/**
 * Create a test task directly in the database
 * 
 * @param projectId - Project ID
 * @param createdById - User ID creating the task
 * @param columnId - Optional column ID
 * @param overrides - Optional overrides for task data
 * @returns Created task record
 */
export async function createTestTaskDirect(
  projectId: number,
  createdById: number,
  columnId?: number,
  overrides: Partial<{
    name: string;
    description: string;
    order: number;
    assigneeId: number | string | null;
  }> = {}
): Promise<{ id: number; name: string; identifier: string; projectId: number }> {
  // Convert IDs to numbers if they're strings
  const numericProjectId = typeof projectId === 'string' ? parseInt(projectId, 10) : projectId;
  const numericCreatedById = typeof createdById === 'string' ? parseInt(createdById, 10) : createdById;
  const numericColumnId = columnId ? (typeof columnId === 'string' ? parseInt(columnId, 10) : columnId) : null;
  
  // Convert assigneeId to number if it's a string
  let numericAssigneeId: number | null = null;
  if (overrides.assigneeId !== undefined && overrides.assigneeId !== null) {
    numericAssigneeId = typeof overrides.assigneeId === 'string' 
      ? parseInt(overrides.assigneeId, 10) 
      : overrides.assigneeId;
  }
  
  // Get project prefix
  const project = await db.project.findUnique({ where: { id: numericProjectId } });
  if (!project) {
    throw new Error(`Project ${numericProjectId} not found`);
  }

  const taskCount = await db.task.count({ where: { projectId: numericProjectId } });
  const identifier = `${project.prefix}-${taskCount + 1}`;
  
  const task = await db.task.create({
    data: {
      name: overrides.name || `Test Task ${Date.now()}`,
      description: overrides.description || 'Test task',
      createdById: numericCreatedById,
      assigneeId: numericAssigneeId,
      projectId: numericProjectId,
      projectColumnId: numericColumnId,
      order: overrides.order || taskCount + 1,
      identifier,
    },
  });
  
  trackEntity('tasks', task.id);
  return task;
}

// =====================
// COMMENT CREATION HELPERS
// =====================

/**
 * Create a test comment in the database
 * Automatically tracks the comment for cleanup
 * 
 * @param taskId - Task ID
 * @param userId - User ID creating the comment
 * @param overrides - Optional overrides for comment data
 * @returns Created comment record
 */
export async function createTestComment(
  taskId: number,
  userId: number,
  overrides: Partial<TestCommentData> = {}
): Promise<{ id: number; taskId: number; userId: number; content: string | null }> {
  const commentData = createTestCommentData(taskId, userId, overrides);
  
  const comment = await db.taskComment.create({
    data: commentData,
  });
  
  trackEntity('comments', comment.id);
  return comment;
}

// =====================
// PROJECT MEMBERSHIP HELPERS
// =====================

/**
 * Add a user to a project
 * Automatically tracks the membership for cleanup
 * 
 * @param userId - User ID
 * @param projectId - Project ID
 * @param role - Member role (default: 'Viewer')
 * @returns Created project user record
 */
export async function addProjectMember(
  userId: number | string,
  projectId: number | string,
  role: string = 'Viewer'
): Promise<{ id: number; userId: number; projectId: number; role: string }> {
  // Convert IDs to numbers if they're strings
  const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
  const numericProjectId = typeof projectId === 'string' ? parseInt(projectId, 10) : projectId;
  
  // Verify both user and project exist before creating membership
  const [user, project] = await Promise.all([
    db.user.findUnique({ where: { id: numericUserId } }),
    db.project.findUnique({ where: { id: numericProjectId } }),
  ]);
  
  if (!user) {
    throw new Error(`User ${numericUserId} not found when adding project member`);
  }
  if (!project) {
    throw new Error(`Project ${numericProjectId} not found when adding project member`);
  }
  
  const membership = await db.projectUser.create({
    data: { userId: numericUserId, projectId: numericProjectId, role },
  });
  
  trackEntity('projectUsers', membership.id);
  return membership;
}

// =====================
// CLEANUP HELPERS
// =====================

/**
 * Clean up all test data created during the test run
 * Uses API endpoints to test destructive flows while cleaning up
 * Falls back to direct database deletion when API doesn't support the operation
 */
export async function cleanupTestData(): Promise<void> {
  const counts = {
    users: createdEntities.users.size,
    projects: createdEntities.projects.size,
    columns: createdEntities.columns.size,
    tasks: createdEntities.tasks.size,
    comments: createdEntities.comments.size,
    projectUsers: createdEntities.projectUsers.size,
  };
  
  const totalTracked = Object.values(counts).reduce((sum, n) => sum + n, 0);
  
  if (totalTracked === 0) {
    // Even if nothing is tracked, check for orphaned test data
    await cleanupOrphanedTestData();
    return;
  }
  
  if (isTestVerbose) {
    console.log(`[Cleanup] Cleaning up ${totalTracked} tracked entities:`, counts);
  }
  
  try {
    // Get auth token for API calls
    const { token } = await authenticateExistingUser();
    
    // Delete tasks via API
    for (const taskId of Array.from(createdEntities.tasks)) {
      try {
        await request(testApp)
          .delete(`/api/tasks/${taskId}`)
          .set('Authorization', `Bearer ${token}`);
      } catch (error) {
        console.error(`[Cleanup] Failed to delete task ${taskId}:`, error);
      }
    }
    
    // Delete columns via API
    for (const columnId of Array.from(createdEntities.columns)) {
      try {
        await request(testApp)
          .delete(`/api/columns/${columnId}`)
          .set('Authorization', `Bearer ${token}`);
      } catch (error) {
        console.error(`[Cleanup] Failed to delete column ${columnId}:`, error);
      }
    }
    
    // Delete project memberships via API
    for (const membershipId of Array.from(createdEntities.projectUsers)) {
      try {
        // Get the membership to find projectId
        const membership = await db.projectUser.findUnique({
          where: { id: membershipId },
          select: { userId: true, projectId: true },
        });
        if (membership) {
          await request(testApp)
            .delete(`/api/members/${membership.userId}?projectId=${membership.projectId}`)
            .set('Authorization', `Bearer ${token}`);
        }
      } catch (error) {
        console.error(`[Cleanup] Failed to delete membership ${membershipId}:`, error);
      }
    }
    
    // Delete projects via API (only works for projects owned by the authenticated user)
    for (const projectId of Array.from(createdEntities.projects)) {
      try {
        await request(testApp)
          .delete(`/api/projects/${projectId}`)
          .set('Authorization', `Bearer ${token}`);
      } catch (error) {
        console.error(`[Cleanup] Failed to delete project ${projectId}:`, error);
      }
    }
    
    // Handle test users and their owned data
    if (createdEntities.users.size > 0) {
      const testUserIds = Array.from(createdEntities.users);
      await cleanupTestUsers(testUserIds);
    }
    
    // Also clean up any orphaned test data
    await cleanupOrphanedTestData();
    
    if (isTestVerbose) {
      console.log(`[Cleanup] Successfully cleaned up ${totalTracked} entities`);
    }
  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error);
    // Fallback to direct database cleanup
    await cleanupTrackedEntities();
    await cleanupOrphanedTestData();
  } finally {
    // Always clear tracking
    clearTrackedEntities();
  }
}

/**
 * Clean up test users by their IDs
 */
async function cleanupTestUsers(testUserIds: number[]): Promise<void> {
  // Find all projects owned by test users and delete them directly from DB
  const projectsOwnedByTestUsers = await db.project.findMany({
    where: { ownerId: { in: testUserIds } },
    select: { id: true },
  });
  
  if (projectsOwnedByTestUsers.length > 0) {
    const projectIds = projectsOwnedByTestUsers.map(p => p.id);
    
    // Delete in order due to foreign key constraints
    await db.taskLog.deleteMany({
      where: { task: { projectId: { in: projectIds } } },
    });
    await db.taskComment.deleteMany({
      where: { task: { projectId: { in: projectIds } } },
    });
    await db.task.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await db.projectColumn.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await db.projectUser.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await db.project.deleteMany({
      where: { id: { in: projectIds } },
    });
  }
  
  // Delete test users directly from database
  // First delete their sessions, accounts, and any remaining memberships
  await db.session.deleteMany({
    where: { userId: { in: testUserIds } },
  });
  await db.account.deleteMany({
    where: { userId: { in: testUserIds } },
  });
  await db.projectUser.deleteMany({
    where: { userId: { in: testUserIds } },
  });
  
  // Then delete the users
  await db.user.deleteMany({
    where: { id: { in: testUserIds } },
  });
}

/**
 * Clean up any orphaned test data (users with test- email prefix)
 * This is a safety net to catch any test data that wasn't tracked
 */
async function cleanupOrphanedTestData(): Promise<void> {
  // Find users with test- email prefix
  const testUsers = await db.user.findMany({
    where: { email: { startsWith: 'test-' } },
    select: { id: true },
  });
  
  if (testUsers.length === 0) {
    return;
  }
  
  const testUserIds = testUsers.map(u => u.id);
  if (isTestVerbose) {
    console.log(`[Cleanup] Found ${testUsers.length} orphaned test users, cleaning up...`);
  }
  
  await cleanupTestUsers(testUserIds);
}

/**
 * Get a summary of tracked entities for debugging
 */
export function getTrackedEntitiesSummary(): string {
  const counts = {
    users: createdEntities.users.size,
    projects: createdEntities.projects.size,
    columns: createdEntities.columns.size,
    tasks: createdEntities.tasks.size,
    comments: createdEntities.comments.size,
  };
  
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  
  if (total === 0) {
    return 'No tracked entities';
  }
  
  return `Tracked entities: ${Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type}=${count}`)
    .join(', ')}`;
}

// =====================
// REQUEST BUILDERS
// =====================

/**
 * Create an authenticated request builder
 * 
 * @param token - Auth token
 * @returns Object with methods for common HTTP requests
 * 
 * @example
 * const { token } = await authenticateExistingUser();
 * const api = authenticatedRequest(token);
 * const response = await api.get('/api/projects');
 */
export function authenticatedRequest(token: string) {
  return {
    get: (url: string) => 
      request(testApp).get(url).set('Authorization', `Bearer ${token}`),
    
    post: (url: string, body?: object) => 
      request(testApp).post(url).set('Authorization', `Bearer ${token}`).send(body),
    
    put: (url: string, body?: object) => 
      request(testApp).put(url).set('Authorization', `Bearer ${token}`).send(body),
    
    patch: (url: string, body?: object) => 
      request(testApp).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    
    delete: (url: string) => 
      request(testApp).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

// =====================
// UTILITY FUNCTIONS
// =====================

/**
 * Wait for a specified number of milliseconds
 * Useful for testing async operations or timeouts
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a unique identifier string
 */
export function uniqueId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Export prisma for direct database access when needed
export { testPrisma as prisma };

// Export fixtures for direct access
export {
  EXISTING_USER,
  EXISTING_USERS,
  EXISTING_PROJECT_IDS,
  EXISTING_TASK_IDS,
  MIN_TEST_ID,
};

// Re-export test data factory functions for convenience
export {
  createTestUserData,
  createTestProjectData,
  createTestColumnData,
  createTestTaskData,
  createTestCommentData,
  createTestProjectUserData,
  generateUniquePrefix,
};

// Re-export types for convenience
export type {
  TestUserData,
  TestProjectData,
  TestColumnData,
  TestTaskData,
  TestCommentData,
  TestProjectUserData,
  ApiLoginResponse,
  ApiUserResponse,
  ApiProjectResponse,
  ApiColumnResponse,
  ApiTaskResponse,
};
