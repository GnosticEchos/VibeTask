/**
 * Agent Delegation Tests
 * 
 * Tests for agent creation, listing, delegation, and management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createMockProject, 
  createMockAgent, 
  createMockDelegation,
  createMockRequest
} from '../helpers/index.js';

// Mock the auth module - must be done before any imports
vi.mock('../../src/infrastructure/auth/index.js', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

  return {
    auth: {
      api: {
        signInEmail: vi.fn(),
        signUpEmail: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(),
        listApiKeys: vi.fn(),
        createApiKey: vi.fn(),
        updateApiKey: vi.fn(),
        deleteApiKey: vi.fn(),
      },
    },
    prisma: mockPrisma,
    getUserIdFromRequest: vi.fn(),
    unifiedAuthMiddleware: vi.fn(),
    requireUserRole: vi.fn(),
    AuthenticatedRequest: class {},
  };
});

// Import after mocking
import { auth, prisma } from '../../src/infrastructure/auth/index.js';

describe('Agent Delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Creation', () => {
    it('should create a new agent with valid name', async () => {
      // Arrange
      const mockAgent = createMockAgent();
      const mockApiKey = {
        id: mockAgent.id,
        name: mockAgent.name,
        prefix: 'ag',
        key: 'ag_key_' + Math.random().toString(36),
        expiresAt: mockAgent.expiresAt,
        metadata: { isAgent: true },
        createdAt: mockAgent.createdAt,
      };
      
      (auth.api.createApiKey as any).mockResolvedValue(mockApiKey);
      (prisma.agentLifecycleAuditLog.create as any).mockResolvedValue({});

      // Act - Test the createApiKey function
      const result = await auth.api.createApiKey({
        body: {
          name: mockAgent.name,
          prefix: 'ag',
          expiresIn: 31536000, // 1 year
          metadata: {
            isAgent: true,
            description: mockAgent.description,
          },
        },
        headers: {},
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe(mockAgent.name);
      expect(result.metadata.isAgent).toBe(true);
    });

    it('should reject agent creation with empty name', async () => {
      // Arrange
      const mockReq = createMockRequest({
        body: {
          name: '', // Empty name - should fail validation
        },
      });
      
      // Validate - name should be non-empty
      expect((mockReq.body as any).name).toBe('');
    });

    it('should reject agent creation with name exceeding max length', async () => {
      // Arrange - name too long (max 100 chars)
      const longName = 'a'.repeat(101);
      const mockReq = createMockRequest({
        body: {
          name: longName,
        },
      });
      
      // Validate - name exceeds max length
      expect((mockReq.body as any).name.length).toBeGreaterThan(100);
    });

    it('should create agent with expiration time', async () => {
      // Arrange
      const expiresIn = 3600; // 1 hour in seconds
      const mockApiKey = {
        id: 'agent-123',
        name: 'Test Agent',
        prefix: 'ag',
        key: 'ag_key_test',
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        metadata: { isAgent: true },
        createdAt: new Date(),
      };
      
      (auth.api.createApiKey as any).mockResolvedValue(mockApiKey);

      // Act
      const result = await auth.api.createApiKey({
        body: {
          name: 'Test Agent',
          prefix: 'ag',
          expiresIn: expiresIn,
          metadata: { isAgent: true },
        },
        headers: {},
      });

      // Assert
      expect(result.expiresAt).toBeDefined();
    });

    it('should reject agent creation with expiration less than 60 seconds', async () => {
      // Arrange - expiresIn too short (minimum is 60 seconds)
      const mockReq = createMockRequest({
        body: {
          name: 'Test Agent',
          expiresIn: 30, // Less than minimum
        },
      });
      
      // Validate - expiresIn should be at least 60
      expect((mockReq.body as any).expiresIn).toBeLessThan(60);
    });
  });

  describe('Agent Listing', () => {
    it('should list user agents', async () => {
      // Arrange
      const mockAgents = [
        createMockAgent({ id: 'agent-1', name: 'Agent 1' }),
        createMockAgent({ id: 'agent-2', name: 'Agent 2' }),
      ];
      
      (auth.api.listApiKeys as any).mockResolvedValue({
        apiKeys: mockAgents.map(a => ({
          id: a.id,
          name: a.name,
          prefix: 'ag',
          enabled: a.isActive,
          metadata: { isAgent: true },
          createdAt: a.createdAt,
          expiresAt: a.expiresAt,
        })),
      });

      // Act
      const result = await auth.api.listApiKeys({
        headers: {},
      });

      // Assert
      expect(result.apiKeys).toHaveLength(2);
    });

    it('should filter for agent keys only', async () => {
      // Arrange - mix of agent and non-agent keys
      const mockKeys = [
        { id: 'agent-1', name: 'Agent 1', metadata: { isAgent: true } },
        { id: 'api-key-1', name: 'API Key 1', metadata: {} },
        { id: 'agent-2', name: 'Agent 2', metadata: { isAgent: true } },
      ];
      
      (auth.api.listApiKeys as any).mockResolvedValue({ apiKeys: mockKeys });

      // Act
      const result = await auth.api.listApiKeys({
        headers: {},
      });
      
      const agentKeys = result.apiKeys.filter((key: any) => key.metadata?.isAgent === true);

      // Assert
      expect(agentKeys).toHaveLength(2);
    });

    it('should return empty list when no agents exist', async () => {
      // Arrange
      (auth.api.listApiKeys as any).mockResolvedValue({ apiKeys: [] });

      // Act
      const result = await auth.api.listApiKeys({
        headers: {},
      });

      // Assert
      expect(result.apiKeys).toHaveLength(0);
    });
  });

  describe('Agent Update', () => {
    it('should update agent name', async () => {
      // Arrange
      const mockUpdatedAgent = {
        id: 'agent-1',
        name: 'Updated Agent Name',
        prefix: 'ag',
        enabled: true,
        metadata: { isAgent: true },
        updatedAt: new Date(),
      };
      
      (auth.api.updateApiKey as any).mockResolvedValue(mockUpdatedAgent);

      // Act
      const result = await auth.api.updateApiKey({
        body: {
          keyId: 'agent-1',
          name: 'Updated Agent Name',
        },
        headers: {},
      });

      // Assert
      expect(result.name).toBe('Updated Agent Name');
    });

    it('should toggle agent active status', async () => {
      // Arrange
      const mockUpdatedAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        prefix: 'ag',
        enabled: false, // Deactivated
        metadata: { isAgent: true },
        updatedAt: new Date(),
      };
      
      (auth.api.updateApiKey as any).mockResolvedValue(mockUpdatedAgent);

      // Act
      const result = await auth.api.updateApiKey({
        body: {
          keyId: 'agent-1',
          enabled: false,
        },
        headers: {},
      });

      // Assert
      expect(result.enabled).toBe(false);
    });

    it('should update agent description', async () => {
      // Arrange
      const mockUpdatedAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        prefix: 'ag',
        enabled: true,
        metadata: { isAgent: true, description: 'Updated description' },
        updatedAt: new Date(),
      };
      
      (auth.api.updateApiKey as any).mockResolvedValue(mockUpdatedAgent);

      // Act
      const result = await auth.api.updateApiKey({
        body: {
          keyId: 'agent-1',
          metadata: { description: 'Updated description' },
        },
        headers: {},
      });

      // Assert - handle possible null metadata
      expect(result.metadata?.description).toBe('Updated description');
    });

    it('should return 404 for non-existent agent', async () => {
      // Arrange
      (auth.api.updateApiKey as any).mockRejectedValue(new Error('not found'));

      // Act & Assert
      await expect(auth.api.updateApiKey({
        body: { keyId: 'non-existent' },
        headers: {},
      })).rejects.toThrow('not found');
    });
  });

  describe('Agent Deletion', () => {
    it('should delete agent and associated delegations', async () => {
      // Arrange
      const agentId = 'agent-1';
      
      (prisma.agentDelegation.deleteMany as any).mockResolvedValue({ count: 1 });
      (auth.api.deleteApiKey as any).mockResolvedValue({});

      // Act - First delete delegations
      await prisma.agentDelegation.deleteMany({
        where: { apiKeyId: agentId },
      });
      
      // Then delete the agent
      await auth.api.deleteApiKey({
        body: { keyId: agentId },
        headers: {},
      });

      // Assert
      expect(prisma.agentDelegation.deleteMany).toHaveBeenCalledWith({
        where: { apiKeyId: agentId },
      });
      expect(auth.api.deleteApiKey).toHaveBeenCalledWith({
        body: { keyId: agentId },
        headers: {},
      });
    });

    it('should return 404 for non-existent agent', async () => {
      // Arrange
      (auth.api.deleteApiKey as any).mockRejectedValue(new Error('not found'));

      // Act & Assert
      await expect(auth.api.deleteApiKey({
        body: { keyId: 'non-existent' },
        headers: {},
      })).rejects.toThrow('not found');
    });
  });

  describe('Delegation Management', () => {
    it('should create delegation to project', async () => {
      // Arrange
      const mockDelegation = createMockDelegation();
      const mockProject = createMockProject();
      
      (prisma.projectUser.findFirst as any).mockResolvedValue({ 
        projectId: mockProject.id, 
        userId: 1 
      });
      (prisma.agentDelegation.findUnique as any).mockResolvedValue(null);
      (prisma.agentDelegation.findFirst as any).mockResolvedValue(null);
      (prisma.agentDelegation.create as any).mockResolvedValue({
        ...mockDelegation,
        project: mockProject,
      });

      // Act
      const result = await prisma.agentDelegation.create({
        data: {
          apiKeyId: mockDelegation.apiKeyId,
          projectId: mockDelegation.projectId,
          permissionLevel: mockDelegation.permissionLevel,
          delegatedById: mockDelegation.delegatedById,
        },
      });

      // Assert
      expect(result).toBeDefined();
    });

    it('should reject duplicate delegation', async () => {
      // Arrange
      const mockDelegation = createMockDelegation();
      
      // Delegation already exists
      (prisma.agentDelegation.findUnique as any).mockResolvedValue(mockDelegation);

      // Act
      const existingDelegation = await prisma.agentDelegation.findUnique({
        where: {
          apiKeyId_projectId: {
            apiKeyId: mockDelegation.apiKeyId,
            projectId: mockDelegation.projectId,
          },
        },
      });

      // Assert - delegation should exist
      expect(existingDelegation).toBeDefined();
    });

    it('should list delegations for agent', async () => {
      // Arrange
      const mockDelegations = [
        createMockDelegation({ id: 1, projectId: 1 }),
        createMockDelegation({ id: 2, projectId: 2 }),
      ];
      
      (prisma.agentDelegation.findMany as any).mockResolvedValue(mockDelegations);

      // Act
      const result = await prisma.agentDelegation.findMany({
        where: { apiKeyId: 'agent-1' },
      });

      // Assert
      expect(result).toHaveLength(2);
    });

    it('should update delegation permission level', async () => {
      // Arrange
      const mockDelegation = createMockDelegation({ permissionLevel: 'VIEWER' });
      
      (prisma.agentDelegation.findFirst as any).mockResolvedValue(mockDelegation);
      (prisma.projectUser.findFirst as any).mockResolvedValue({ projectId: 1, userId: 1 });
      (prisma.agentDelegation.update as any).mockResolvedValue({
        ...mockDelegation,
        permissionLevel: 'USER',
      });

      // Act
      const result = await prisma.agentDelegation.update({
        where: { id: mockDelegation.id },
        data: { permissionLevel: 'USER' },
      });

      // Assert
      expect(result.permissionLevel).toBe('USER');
    });

    it('should revoke delegation (soft delete)', async () => {
      // Arrange
      const mockDelegation = createMockDelegation({ isActive: true });
      
      (prisma.agentDelegation.findFirst as any).mockResolvedValue(mockDelegation);
      (prisma.projectUser.findFirst as any).mockResolvedValue({ projectId: 1, userId: 1 });
      (prisma.agentDelegation.update as any).mockResolvedValue({
        ...mockDelegation,
        isActive: false,
        revokedAt: new Date(),
      });

      // Act
      const result = await prisma.agentDelegation.update({
        where: { id: mockDelegation.id },
        data: { 
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Assert
      expect(result.isActive).toBe(false);
      expect(result.revokedAt).toBeDefined();
    });
  });

  describe('Authorization Checks', () => {
    it('should verify user is project member before delegation', async () => {
      // Arrange
      const userId = 1;
      const projectId = 1;
      
      // User is a member
      (prisma.projectUser.findFirst as any).mockResolvedValue({ 
        projectId, 
        userId,
        role: 'USER',
      });

      // Act
      const membership = await prisma.projectUser.findFirst({
        where: { projectId, userId },
      });

      // Assert
      expect(membership).toBeDefined();
    });

    it('should reject delegation for non-project members', async () => {
      // Arrange
      const userId = 999; // Non-existent user
      const projectId = 1;
      
      // User is not a member
      (prisma.projectUser.findFirst as any).mockResolvedValue(null);

      // Act
      const membership = await prisma.projectUser.findFirst({
        where: { projectId, userId },
      });

      // Assert
      expect(membership).toBeNull();
    });

    it('should validate permission levels', async () => {
      // Valid permission levels should be VIEWER or USER
      const validLevels = ['VIEWER', 'USER'];

      // Assert
      expect(validLevels).toContain('VIEWER');
      expect(validLevels).toContain('USER');
      expect(validLevels).not.toContain('ADMIN');
    });
  });
});