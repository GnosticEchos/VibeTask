/**
 * Test Helper Utilities
 * 
 * Shared utilities and mock factories for testing.
 */

import { vi } from 'vitest';
import type { Request } from 'express';

// ============= Mock Data Factories =============

/**
 * Create a mock user object
 */
export function createMockUser(overrides: Partial<{
  id: number;
  email: string;
  name: string;
  surname: string;
  role: string;
}> = {}): {
  id: number;
  email: string;
  name: string;
  surname: string;
  role: string;
} {
  return {
    id: 1,
    email: 'test@example.com',
    name: 'Test',
    surname: 'User',
    role: 'USER',
    ...overrides,
  };
}

/**
 * Create a mock session object
 */
export function createMockSession(overrides: Partial<{
  user: ReturnType<typeof createMockUser>;
  token: string;
  expiresAt: Date;
}> = {}): {
  user: ReturnType<typeof createMockUser>;
  token: string;
  expiresAt: Date;
} {
  return {
    user: createMockUser(),
    token: 'mock-session-token-' + Math.random().toString(36),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

/**
 * Create a mock project object
 */
export function createMockProject(overrides: Partial<{
  id: number;
  name: string;
  prefix: string;
  description: string;
  ownerId: number;
}> = {}): {
  id: number;
  name: string;
  prefix: string;
  description: string;
  ownerId: number;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: 1,
    name: 'Test Project',
    prefix: 'TEST',
    description: 'A test project',
    ownerId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock task object
 */
export function createMockTask(overrides: Partial<{
  id: number;
  name: string;
  description: string;
  projectId: number;
  projectColumnId: number;
  identifier: string;
  assigneeId: number | null;
}> = {}): {
  id: number;
  name: string;
  description: string;
  projectId: number;
  projectColumnId: number;
  identifier: string;
  assigneeId: number | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: 1,
    name: 'Test Task',
    description: 'A test task',
    projectId: 1,
    projectColumnId: 1,
    identifier: 'TEST-1',
    assigneeId: null,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock column object
 */
export function createMockColumn(overrides: Partial<{
  id: number;
  name: string;
  projectId: number;
  order: number;
}> = {}): {
  id: number;
  name: string;
  projectId: number;
  order: number;
  color: string;
  type: string | null;
  description: string | null;
} {
  return {
    id: 1,
    name: 'To Do',
    projectId: 1,
    order: 1,
    color: '#6366f1',
    type: null,
    description: null,
    ...overrides,
  };
}

/**
 * Create a mock agent object
 */
export function createMockAgent(overrides: Partial<{
  id: string;
  name: string;
  description: string;
  createdBy: number;
  expiresAt: Date | null;
}> = {}): {
  id: string;
  name: string;
  description: string;
  createdBy: number;
  expiresAt: Date | null;
  createdAt: Date;
  isActive: boolean;
} {
  return {
    id: 'agent-' + Math.random().toString(36),
    name: 'Test Agent',
    description: 'A test agent',
    createdBy: 1,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

/**
 * Create a mock delegation object
 */
export function createMockDelegation(overrides: Partial<{
  id: number;
  apiKeyId: string;
  projectId: number;
  delegatedById: number;
  permissionLevel: 'VIEWER' | 'USER';
  isActive: boolean;
}> = {}): {
  id: number;
  apiKeyId: string;
  projectId: number;
  delegatedById: number;
  permissionLevel: 'VIEWER' | 'USER';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: 1,
    apiKeyId: 'agent-key-1',
    projectId: 1,
    delegatedById: 1,
    permissionLevel: 'VIEWER',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============= Mock Express Objects =============

/**
 * Create a mock Express request object
 */
export function createMockRequest(overrides: Partial<{
  headers: Record<string, string | undefined>;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  ip: string;
  socket: { remoteAddress: string };
}> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: undefined,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as Request;
}

/**
 * Create a mock Express response object
 */
export function createMockResponse(): {
  req: Request;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.req = {};
  return res;
}

/**
 * Create a mock Express next function
 */
export function createMockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

// ============= Mock Prisma =============

/**
 * Create a mock Prisma client for testing
 */
export function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    projectUser: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    projectColumn: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rateLimitConfig: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    agentDelegation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    agentLifecycleAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

// ============= Test Utilities =============

/**
 * Wait for a specified duration
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random test email
 */
export function generateTestEmail(): string {
  return `test-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate a random test password
 */
export function generateTestPassword(): string {
  return `TestPass${Math.random().toString(36).substring(7)}!`;
}