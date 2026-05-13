/**
 * Test Data Fixtures
 * 
 * Provides test data factories for integration tests that:
 * - Generate unique identifiers to avoid conflicts with existing data
 * - Use IDs > 10000 to protect existing test data (users 1-5, projects 1-10, tasks 1-50)
 * - Create consistent, predictable test data
 * 
 * EXISTING DATA (DO NOT MODIFY):
 * - Users 1-5 with password 'admin1234'
 * - Projects 1-10
 * - Tasks with IDs 1-50
 * - Columns, comments, logs associated with above
 * 
 * @example
 * import { EXISTING_USER, createTestUserData, createTestProjectData } from './fixtures';
 * 
 * // Use existing user for login tests
 * const loginResponse = await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
 * 
 * // Create new test user with unique email
 * const userData = createTestUserData();
 * const user = await createTestUser(userData);
 */

import { MIN_TEST_ID } from './test-db.js';

// =====================
// EXISTING TEST DATA CONSTANTS
// =====================

/**
 * Existing user credentials for testing
 * These users already exist in the database and should NOT be modified
 * Data sourced from prisma/DATADUMP/users.csv
 */
export const EXISTING_USERS = {
  user1: {
    id: 1,
    email: 'lukaszpodlipskikontakt@example.com',
    password: 'admin1234',
    name: 'Łukasz',
    surname: 'Podlipski',
  },
  user2: {
    id: 2,
    email: 'andrzejpodlipski@example.com',
    password: 'admin1234',
    name: 'Andrzej',
    surname: 'Podlipski',
  },
  user3: {
    id: 3,
    email: 'jakkowalski@example.com',
    password: 'admin1234',
    name: 'Jan',
    surname: 'Kowalski',
  },
  user4: {
    id: 4,
    email: 'adammickiewicz@example.com',
    password: 'admin1234',
    name: 'Adam',
    surname: 'Mickiewicz',
  },
  user5: {
    id: 5,
    email: 'juliuszslowacki@example.com',
    password: 'admin1234',
    name: 'Juliusz',
    surname: 'Słowacki',
  },
} as const;

/**
 * Primary test user (most commonly used)
 */
export const EXISTING_USER = EXISTING_USERS.user1;

/**
 * Existing project IDs (1-10, note: project 3 does not exist)
 * Data sourced from prisma/DATADUMP/projects.csv
 * Actual project IDs: 1, 2, 4, 5, 6, 7, 8, 9, 10 (9 projects)
 */
export const EXISTING_PROJECT_IDS = [1, 2, 4, 5, 6, 7, 8, 9, 10];

/**
 * Existing task IDs (various IDs between 1-50, not all sequential)
 * Data sourced from prisma/DATADUMP/tasks.csv
 * There are 47 tasks with IDs in the range 1-50
 */
export const EXISTING_TASK_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 28, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50
];

// =====================
// ID GENERATION
// =====================

/**
 * Counter for generating unique IDs
 * Starts at MIN_TEST_ID + 1 to avoid conflicts with existing data
 */
let idCounter = MIN_TEST_ID + 1;

/**
 * Generate a unique ID for test entities
 * Ensures IDs are always > MIN_TEST_ID
 */
export function generateUniqueId(): number {
  return idCounter++;
}

/**
 * Reset the ID counter (use sparingly, mainly for test isolation)
 */
export function resetIdCounter(startId: number = MIN_TEST_ID + 1): void {
  idCounter = startId;
}

/**
 * Generate a unique string suffix
 * Combines timestamp and random string for uniqueness
 */
export function generateUniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique email for test users
 */
export function generateUniqueEmail(prefix: string = 'test'): string {
  return `${prefix}-${generateUniqueSuffix()}@example.com`;
}

/**
 * Generate a unique project prefix (3 characters)
 */
export function generateUniquePrefix(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomChars = () => 
    Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${randomChars()}`;
}

// =====================
// TEST DATA FACTORIES
// =====================

/**
 * User creation data template
 */
export interface TestUserData {
  email: string;
  password: string;
  name: string;
  surname?: string;
  avatarUrl?: string;
}

/**
 * Create test user data with unique email
 */
export function createTestUserData(overrides: Partial<TestUserData> = {}): TestUserData {
  const uniqueSuffix = generateUniqueSuffix();
  return {
    email: `test-user-${uniqueSuffix}@example.com`,
    password: 'TestPass123!',
    name: `Test User ${uniqueSuffix.slice(0, 8)}`,
    surname: 'TestUser',
    avatarUrl: null,
    ...overrides,
  };
}

/**
 * Project creation data template
 */
export interface TestProjectData {
  name: string;
  description?: string;
  prefix: string;
  ownerId: number;
}

/**
 * Create test project data with unique prefix
 */
export function createTestProjectData(
  ownerId: number | string, 
  overrides: Partial<TestProjectData> = {}
): TestProjectData {
  // Convert string ID to number if needed
  const numericOwnerId = typeof ownerId === 'string' ? parseInt(ownerId, 10) : ownerId;
  
  return {
    name: `Test Project ${generateUniqueSuffix()}`,
    description: 'Test project created by integration tests',
    prefix: generateUniquePrefix(),
    ownerId: numericOwnerId,
    ...overrides,
  };
}

/**
 * Column creation data template
 */
export interface TestColumnData {
  name: string;
  projectId: number;
  order: number;
  color?: string;
  type?: string;
  description?: string;
}

/**
 * Create test column data
 */
export function createTestColumnData(
  projectId: number,
  order: number = 1,
  overrides: Partial<TestColumnData> = {}
): TestColumnData {
  return {
    name: `Test Column ${order}`,
    projectId,
    order,
    color: '#3498db',
    type: 'STANDARD',
    description: null,
    ...overrides,
  };
}

/**
 * Task creation data template
 */
export interface TestTaskData {
  name: string;
  description?: string;
  createdById: number;
  assigneeId?: number;
  projectId: number;
  projectColumnId?: number;
  order: number;
  identifier: string;
}

/**
 * Create test task data with unique identifier
 */
export function createTestTaskData(
  projectId: number | string,
  createdById: number | string,
  projectPrefix: string,
  overrides: Partial<TestTaskData> = {}
): TestTaskData {
  const numericProjectId = typeof projectId === 'string' ? parseInt(projectId, 10) : projectId;
  const numericCreatedById = typeof createdById === 'string' ? parseInt(createdById, 10) : createdById;
  const taskNumber = generateUniqueId();
  return {
    name: `Test Task ${generateUniqueSuffix()}`,
    description: 'Test task created by integration tests',
    createdById: numericCreatedById,
    assigneeId: null,
    projectId: numericProjectId,
    projectColumnId: null,
    order: 1,
    identifier: `${projectPrefix}-${taskNumber}`,
    ...overrides,
  };
}

/**
 * Comment creation data template
 */
export interface TestCommentData {
  taskId: number;
  userId: number;
  content: string;
}

/**
 * Create test comment data
 */
export function createTestCommentData(
  taskId: number,
  userId: number,
  overrides: Partial<TestCommentData> = {}
): TestCommentData {
  return {
    taskId,
    userId,
    content: `Test comment ${generateUniqueSuffix()}`,
    ...overrides,
  };
}

/**
 * Project membership data template
 */
export interface TestProjectUserData {
  userId: number;
  projectId: number;
  role: string;
}

/**
 * Create test project membership data
 */
export function createTestProjectUserData(
  userId: number,
  projectId: number,
  role: string = 'Viewer',
  overrides: Partial<TestProjectUserData> = {}
): TestProjectUserData {
  return {
    userId,
    projectId,
    role,
    ...overrides,
  };
}

// =====================
// API RESPONSE TYPES
// =====================

/**
 * Standard API user response
 */
export interface ApiUserResponse {
  id: number;
  name: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * Standard API login response
 */
export interface ApiLoginResponse {
  token: string;
  user: ApiUserResponse;
}

/**
 * Standard API project response
 */
export interface ApiProjectResponse {
  id: number;
  name: string;
  description: string | null;
  prefix: string;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Standard API column response
 */
export interface ApiColumnResponse {
  id: number;
  name: string;
  projectId: number;
  order: number;
  color: string | null;
  type: string | null;
  description: string | null;
}

/**
 * Standard API task response
 */
export interface ApiTaskResponse {
  id: number;
  name: string;
  description: string | null;
  createdById: number;
  assigneeId: number | null;
  projectId: number;
  projectColumnId: number | null;
  order: number;
  identifier: string;
  createdAt: string;
  updatedAt: string;
}

// =====================
// TEST DATA TEMPLATES
// =====================

/**
 * Template for creating users directly in tests
 * Use with createTestUser helper function
 */
export const TEST_USER_TEMPLATE = {
  password: 'TestPass123!',
  name: 'Integration',
  surname: 'TestUser',
  generateEmail: () => generateUniqueEmail('test'),
};

/**
 * Template for creating projects directly in tests
 * Use with createTestProject helper function
 */
export const TEST_PROJECT_TEMPLATE = {
  description: 'Integration test project',
  generateName: () => `Test Project ${generateUniqueSuffix()}`,
  generatePrefix: () => generateUniquePrefix(),
};

/**
 * Template for creating tasks directly in tests
 * Use with createTestTask helper function
 */
export const TEST_TASK_TEMPLATE = {
  description: 'Integration test task',
  order: 1,
  generateName: () => `Test Task ${generateUniqueSuffix()}`,
};

export default {
  EXISTING_USERS,
  EXISTING_USER,
  EXISTING_PROJECT_IDS,
  EXISTING_TASK_IDS,
  generateUniqueId,
  generateUniqueSuffix,
  generateUniqueEmail,
  generateUniquePrefix,
  createTestUserData,
  createTestProjectData,
  createTestColumnData,
  createTestTaskData,
  createTestCommentData,
  createTestProjectUserData,
  TEST_USER_TEMPLATE,
  TEST_PROJECT_TEMPLATE,
  TEST_TASK_TEMPLATE,
};
