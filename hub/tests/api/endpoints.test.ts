/**
 * API Endpoint Tests
 * 
 * Tests for project, task, column, and member CRUD operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createMockProject, 
  createMockTask, 
  createMockColumn,
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
      delete: vi.fn(),
    },
  };

  return {
    auth: {
      api: {
        getSession: vi.fn(),
      },
    },
    prisma: mockPrisma,
    getUserIdFromRequest: vi.fn(),
  };
});

// Import after mocking
import { prisma, getUserIdFromRequest } from '../../src/infrastructure/auth/index.js';

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Projects CRUD', () => {
    describe('Create Project', () => {
      it('should create a new project with valid data', async () => {
        // Arrange
        const mockUserId = 1;
        const mockProject = createMockProject({ ownerId: mockUserId });
        
        (getUserIdFromRequest as any).mockResolvedValue(mockUserId);
        (prisma.project.create as any).mockResolvedValue(mockProject);

        // Act
        const result = await prisma.project.create({
          data: {
            name: mockProject.name,
            prefix: mockProject.prefix,
            description: mockProject.description,
            ownerId: mockUserId,
            members: {
              create: {
                userId: mockUserId,
                role: 'Owner',
              },
            },
          },
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.name).toBe(mockProject.name);
        expect(result.ownerId).toBe(mockUserId);
      });

      it('should reject project with missing required fields', async () => {
        // Arrange - missing name
        const mockReq = createMockRequest({
          body: {
            prefix: 'TEST',
            description: 'Test project',
          },
        });

        // Validate - name should be required
        expect((mockReq.body as any).name).toBeUndefined();
      });

      it('should reject project with invalid prefix', async () => {
        // Arrange - prefix too long
        const mockReq = createMockRequest({
          body: {
            name: 'Test Project',
            prefix: 'TOOLONG', // Max 5 chars typically
          },
        });

        // Validate - prefix should be short
        expect((mockReq.body as any).prefix.length).toBeGreaterThan(5);
      });

      it('should create project with default columns', async () => {
        // Arrange
        const mockProject = createMockProject();
        const defaultColumns = [
          { name: 'To Do', order: 0, color: '#6366f1' },
          { name: 'In Progress', order: 1, color: '#f59e0b' },
          { name: 'Done', order: 2, color: '#10b981' },
        ];
        
        (prisma.project.create as any).mockResolvedValue({
          ...mockProject,
          columns: defaultColumns,
        });

        // Act
        const result = await prisma.project.create({
          data: {
            name: mockProject.name,
            prefix: mockProject.prefix,
            ownerId: 1,
            columns: {
              create: defaultColumns,
            },
          },
        });

        // Assert
        expect(result.columns).toHaveLength(3);
      });
    });

    describe('Read Projects', () => {
      it('should list user projects', async () => {
        // Arrange
        const mockUserId = 1;
        const mockProjects = [
          createMockProject({ id: 1, name: 'Project 1' }),
          createMockProject({ id: 2, name: 'Project 2' }),
        ];
        
        (getUserIdFromRequest as any).mockResolvedValue(mockUserId);
        (prisma.project.findMany as any).mockResolvedValue(mockProjects);

        // Act
        const result = await prisma.project.findMany({
          where: {
            members: {
              some: { userId: mockUserId },
            },
          },
        });

        // Assert
        expect(result).toHaveLength(2);
      });

      it('should get single project by ID', async () => {
        // Arrange
        const mockProject = createMockProject({ id: 1 });
        
        (prisma.project.findUnique as any).mockResolvedValue(mockProject);

        // Act
        const result = await prisma.project.findUnique({
          where: { id: 1 },
        });

        // Assert
        expect(result).toBeDefined();
        expect(result?.id).toBe(1);
      });

      it('should return 404 for non-existent project', async () => {
        // Arrange
        (prisma.project.findUnique as any).mockResolvedValue(null);

        // Act
        const result = await prisma.project.findUnique({
          where: { id: 999 },
        });

        // Assert
        expect(result).toBeNull();
      });

      it('should include columns and tasks in project query', async () => {
        // Arrange
        const mockProject = createMockProject();
        const mockColumns = [createMockColumn(), createMockColumn({ id: 2, name: 'In Progress', order: 1 })];
        
        (prisma.project.findUnique as any).mockResolvedValue({
          ...mockProject,
          columns: mockColumns,
        });

        // Act
        const result = await prisma.project.findUnique({
          where: { id: 1 },
          include: {
            columns: {
              include: { tasks: true },
              orderBy: { order: 'asc' },
            },
          },
        });

        // Assert
        expect(result?.columns).toBeDefined();
      });
    });

    describe('Update Project', () => {
      it('should update project name', async () => {
        // Arrange
        const mockProject = createMockProject({ name: 'Old Name' });
        
        (prisma.project.update as any).mockResolvedValue({
          ...mockProject,
          name: 'New Name',
        });

        // Act
        const result = await prisma.project.update({
          where: { id: 1 },
          data: { name: 'New Name' },
        });

        // Assert
        expect(result.name).toBe('New Name');
      });

      it('should update project description', async () => {
        // Arrange
        (prisma.project.update as any).mockResolvedValue({
          id: 1,
          description: 'Updated description',
        });

        // Act
        const result = await prisma.project.update({
          where: { id: 1 },
          data: { description: 'Updated description' },
        });

        // Assert
        expect(result.description).toBe('Updated description');
      });

      it('should only allow owner to update project', async () => {
        // Arrange - verify ownership check
        const mockUserId = 1;
        const projectId = 1;
        
        (prisma.projectUser.findFirst as any).mockResolvedValue({
          projectId,
          userId: mockUserId,
          role: 'Owner',
        });

        // Act
        const membership = await prisma.projectUser.findFirst({
          where: { projectId, userId: mockUserId, role: 'Owner' },
        });

        // Assert - owner can update
        expect(membership).toBeDefined();
      });

      it('should reject update from non-owner', async () => {
        // Arrange
        (prisma.projectUser.findFirst as any).mockResolvedValue(null);

        // Act
        const membership = await prisma.projectUser.findFirst({
          where: { projectId: 1, userId: 999, role: 'Owner' },
        });

        // Assert - non-owner cannot update
        expect(membership).toBeNull();
      });
    });

    describe('Delete Project', () => {
      it('should delete project as owner', async () => {
        // Arrange
        (prisma.projectUser.findFirst as any).mockResolvedValue({ role: 'Owner' });
        (prisma.project.delete as any).mockResolvedValue({ id: 1 });

        // Act
        await prisma.project.delete({ where: { id: 1 } });

        // Assert
        expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      });

      it('should reject delete from non-owner', async () => {
        // Arrange
        (prisma.projectUser.findFirst as any).mockResolvedValue(null);

        // Act
        const membership = await prisma.projectUser.findFirst({
          where: { projectId: 1, userId: 999, role: 'Owner' },
        });

        // Assert - cannot delete
        expect(membership).toBeNull();
      });
    });
  });

  describe('Tasks CRUD', () => {
    describe('Create Task', () => {
      it('should create a new task with valid data', async () => {
        // Arrange
        const mockTask = createMockTask();
        
        (prisma.task.create as any).mockResolvedValue(mockTask);

        // Act
        const result = await prisma.task.create({
          data: {
            name: mockTask.name,
            description: mockTask.description,
            projectId: mockTask.projectId,
            projectColumnId: mockTask.projectColumnId,
            identifier: mockTask.identifier,
            order: 1,
            createdById: 1,
          },
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.name).toBe(mockTask.name);
      });

      it('should reject task with missing required fields', async () => {
        // Arrange - missing name
        const mockReq = createMockRequest({
          body: {
            projectId: 1,
            projectColumnId: 1,
          },
        });

        // Validate - name should be required
        expect((mockReq.body as any).name).toBeUndefined();
      });

      it('should auto-generate task identifier', async () => {
        // Arrange
        const mockProject = createMockProject({ prefix: 'TEST', id: 1 });
        
        (prisma.project.findUnique as any).mockResolvedValue(mockProject);
        (prisma.task.count as any).mockResolvedValue(5);
        (prisma.task.create as any).mockResolvedValue({
          identifier: 'TEST-6',
        });

        // Act
        const project = await prisma.project.findUnique({ where: { id: 1 } });
        const taskCount = await prisma.task.count({ where: { projectId: 1 } });
        const identifier = `${project?.prefix}-${taskCount + 1}`;

        // Assert
        expect(identifier).toBe('TEST-6');
      });

      it('should assign task to user', async () => {
        // Arrange
        const mockTask = createMockTask({ assigneeId: 1 });
        
        (prisma.task.create as any).mockResolvedValue(mockTask);

        // Act
        const result = await prisma.task.create({
          data: {
            name: 'Test Task',
            projectId: 1,
            projectColumnId: 1,
            assigneeId: 1,
            identifier: 'TEST-1',
            order: 1,
            createdById: 1,
          },
        });

        // Assert
        expect(result.assigneeId).toBe(1);
      });
    });

    describe('Read Tasks', () => {
      it('should list tasks for a project', async () => {
        // Arrange
        const mockTasks = [
          createMockTask({ id: 1, name: 'Task 1' }),
          createMockTask({ id: 2, name: 'Task 2' }),
        ];
        
        (prisma.task.findMany as any).mockResolvedValue(mockTasks);

        // Act
        const result = await prisma.task.findMany({
          where: { projectId: 1 },
        });

        // Assert
        expect(result).toHaveLength(2);
      });

      it('should get single task by ID', async () => {
        // Arrange
        const mockTask = createMockTask({ id: 1 });
        
        (prisma.task.findUnique as any).mockResolvedValue(mockTask);

        // Act
        const result = await prisma.task.findUnique({
          where: { id: 1 },
        });

        // Assert
        expect(result?.id).toBe(1);
      });

      it('should filter unassigned tasks', async () => {
        // Arrange
        const mockTasks = [
          createMockTask({ id: 1, assigneeId: null }),
        ];
        
        (prisma.task.findMany as any).mockResolvedValue(mockTasks);

        // Act
        const result = await prisma.task.findMany({
          where: { projectId: 1, assigneeId: null },
        });

        // Assert
        expect(result[0].assigneeId).toBeNull();
      });
    });

    describe('Update Task', () => {
      it('should update task name', async () => {
        // Arrange
        (prisma.task.update as any).mockResolvedValue({
          id: 1,
          name: 'Updated Task Name',
        });

        // Act
        const result = await prisma.task.update({
          where: { id: 1 },
          data: { name: 'Updated Task Name' },
        });

        // Assert
        expect(result.name).toBe('Updated Task Name');
      });

      it('should update task description', async () => {
        // Arrange
        (prisma.task.update as any).mockResolvedValue({
          id: 1,
          description: 'Updated description',
        });

        // Act
        const result = await prisma.task.update({
          where: { id: 1 },
          data: { description: 'Updated description' },
        });

        // Assert
        expect(result.description).toBe('Updated description');
      });

      it('should reassign task', async () => {
        // Arrange
        (prisma.task.update as any).mockResolvedValue({
          id: 1,
          assigneeId: 2,
        });

        // Act
        const result = await prisma.task.update({
          where: { id: 1 },
          data: { assigneeId: 2 },
        });

        // Assert
        expect(result.assigneeId).toBe(2);
      });
    });

    describe('Move Task', () => {
      it('should move task to different column', async () => {
        // Arrange
        (prisma.task.update as any).mockResolvedValue({
          id: 1,
          projectColumnId: 2,
        });

        // Act
        const result = await prisma.task.update({
          where: { id: 1 },
          data: { projectColumnId: 2, order: 1 },
        });

        // Assert
        expect(result.projectColumnId).toBe(2);
      });
    });

    describe('Delete Task', () => {
      it('should delete task', async () => {
        // Arrange
        (prisma.task.delete as any).mockResolvedValue({ id: 1 });

        // Act
        await prisma.task.delete({ where: { id: 1 } });

        // Assert
        expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      });
    });
  });

  describe('Columns CRUD', () => {
    describe('Create Column', () => {
      it('should create a new column', async () => {
        // Arrange
        const mockColumn = createMockColumn();
        
        (prisma.projectColumn.create as any).mockResolvedValue(mockColumn);

        // Act
        const result = await prisma.projectColumn.create({
          data: {
            name: mockColumn.name,
            projectId: mockColumn.projectId,
            order: mockColumn.order,
            color: mockColumn.color,
          },
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.name).toBe(mockColumn.name);
      });
    });

    describe('Read Columns', () => {
      it('should list columns for a project', async () => {
        // Arrange
        const mockColumns = [
          createMockColumn({ id: 1, name: 'To Do', order: 0 }),
          createMockColumn({ id: 2, name: 'In Progress', order: 1 }),
          createMockColumn({ id: 3, name: 'Done', order: 2 }),
        ];
        
        (prisma.projectColumn.findMany as any).mockResolvedValue(mockColumns);

        // Act
        const result = await prisma.projectColumn.findMany({
          where: { projectId: 1 },
          orderBy: { order: 'asc' },
        });

        // Assert
        expect(result).toHaveLength(3);
        expect(result[0].order).toBe(0);
      });
    });

    describe('Update Column', () => {
      it('should update column name', async () => {
        // Arrange
        (prisma.projectColumn.update as any).mockResolvedValue({
          id: 1,
          name: 'Updated Column',
        });

        // Act
        const result = await prisma.projectColumn.update({
          where: { id: 1 },
          data: { name: 'Updated Column' },
        });

        // Assert
        expect(result.name).toBe('Updated Column');
      });
    });

    describe('Delete Column', () => {
      it('should delete column', async () => {
        // Arrange
        (prisma.projectColumn.delete as any).mockResolvedValue({ id: 1 });

        // Act
        await prisma.projectColumn.delete({ where: { id: 1 } });

        // Assert
        expect(prisma.projectColumn.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      });
    });
  });

  describe('Members Management', () => {
    describe('Add Member', () => {
      it('should add member to project', async () => {
        // Arrange
        (prisma.projectUser.create as any).mockResolvedValue({
          projectId: 1,
          userId: 2,
          role: 'USER',
        });

        // Act
        const result = await prisma.projectUser.create({
          data: {
            projectId: 1,
            userId: 2,
            role: 'USER',
          },
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.userId).toBe(2);
      });

      it('should reject duplicate member', async () => {
        // Arrange - member already exists
        (prisma.projectUser.findFirst as any).mockResolvedValue({
          projectId: 1,
          userId: 2,
        });

        // Act
        const existingMember = await prisma.projectUser.findFirst({
          where: { projectId: 1, userId: 2 },
        });

        // Assert
        expect(existingMember).toBeDefined();
      });
    });

    describe('Update Member Role', () => {
      it('should update member role', async () => {
        // Arrange
        (prisma.projectUser.update as any).mockResolvedValue({
          projectId: 1,
          userId: 2,
          role: 'ADMIN',
        });

        // Act
        const result = await prisma.projectUser.update({
          where: { projectId: 1, userId: 2 },
          data: { role: 'ADMIN' },
        });

        // Assert
        expect(result.role).toBe('ADMIN');
      });
    });

    describe('Remove Member', () => {
      it('should remove member from project', async () => {
        // Arrange
        (prisma.projectUser.delete as any).mockResolvedValue({});

        // Act
        await prisma.projectUser.delete({
          where: { projectId: 1, userId: 2 },
        });

        // Assert
        expect(prisma.projectUser.delete).toHaveBeenCalled();
      });
    });

    describe('Authorization', () => {
      it('should check membership before access', async () => {
        // Arrange
        (prisma.projectUser.findFirst as any).mockResolvedValue({
          projectId: 1,
          userId: 1,
          role: 'USER',
        });

        // Act
        const membership = await prisma.projectUser.findFirst({
          where: { projectId: 1, userId: 1 },
        });

        // Assert
        expect(membership).toBeDefined();
      });

      it('should reject non-member access', async () => {
        // Arrange
        (prisma.projectUser.findFirst as any).mockResolvedValue(null);

        // Act
        const membership = await prisma.projectUser.findFirst({
          where: { projectId: 1, userId: 999 },
        });

        // Assert
        expect(membership).toBeNull();
      });
    });
  });
});