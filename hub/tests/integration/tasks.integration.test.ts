/**
 * Tasks Integration Tests
 * 
 * Tests for the Tasks API endpoints:
 * - GET /api/tasks?projectId - Get tasks for a project
 * - GET /api/tasks (no params) - Get all tasks user has access to (My Tasks)
 * - GET /api/tasks/:id - Get single task details
 * - POST /api/tasks - Create a new task
 * - PATCH /api/tasks/:id - Update a task
 * - POST /api/tasks/:id/move - Move task to different column/position
 * - POST /api/tasks/:id/comments - Add comment to task
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { testPrisma, createdEntities } from './setup/test-db.js';
import {
  authenticateExistingUser,
  createTestUser,
  createTestProject,
  createTestProjectDirect,
  createTestColumn,
  createTestTaskDirect,
  addProjectMember,
  cleanupTestData,
} from '../helpers/integration-helpers.js';

describe('Tasks Integration Tests', () => {
  let token: string;
  let userId: number;
  let testProject: { id: number; prefix: string };
  let testColumn: { id: number };

  beforeEach(async () => {
    // Authenticate with existing user
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = parseInt(auth.user.id as string, 10);

    // Create a test project and column for task tests
    const project = await createTestProject(userId, {
      name: 'Task Test Project',
      prefix: 'TTP',
    });
    testProject = project;

    const column = await createTestColumn(project.id, 1, { name: 'To Do' });
    testColumn = column;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/tasks', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/tasks?projectId=${testProject.id}`);

      expect(response.status).toBe(401);
    });

    it('should return tasks for a specific project', async () => {
      // Create some tasks
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Task 1',
      });
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Task 2',
      });

      const response = await request(testApp)
        .get(`/api/tasks?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project
      const otherUser = await createTestUser({ name: 'Other' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Other Project',
        prefix: 'OPJ',
      });

      const response = await request(testApp)
        .get(`/api/tasks?projectId=${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should filter by unassigned=true', async () => {
      // Create assigned and unassigned tasks
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Assigned Task',
        assigneeId: userId,
      });
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Unassigned Task',
        assigneeId: undefined,
      });

      const response = await request(testApp)
        .get(`/api/tasks?projectId=${testProject.id}&unassigned=true`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every((t: any) => t.assigneeId === null)).toBe(true);
    });

    it('should filter by assigneeIds', async () => {
      // Create another user
      const otherUser = await createTestUser({ name: 'Assignee' });
      await addProjectMember(otherUser.id, testProject.id, 'Viewer');

      // Create tasks with different assignees
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'My Task',
        assigneeId: userId,
      });
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Other Task',
        assigneeId: otherUser.id,
      });

      const response = await request(testApp)
        .get(`/api/tasks?projectId=${testProject.id}&assigneeIds=${userId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every((t: any) => t.assigneeId === userId)).toBe(true);
    });

    it('should search by query string', async () => {
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Find This Task',
        description: 'Unique description',
      });
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Other Task',
        description: 'Different content',
      });

      const response = await request(testApp)
        .get(`/api/tasks?projectId=${testProject.id}&query=Find`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Find This Task');
    });

    it('should return My Tasks when no projectId provided', async () => {
      // Create task assigned to user
      await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'My Assigned Task',
        assigneeId: userId,
      });

      const response = await request(testApp)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Should include tasks assigned to or created by user
      const myTasks = response.body.data.filter(
        (t: any) => t.assigneeId === userId || t.createdById === userId
      );
      expect(myTasks.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return 401 without authentication', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .get(`/api/tasks/${task.id}`);

      expect(response.status).toBe(401);
    });

    it('should return task details for member', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Detail Task',
        description: 'Task description',
      });

      const response = await request(testApp)
        .get(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(task.id);
      expect(response.body.name).toBe('Detail Task');
      expect(response.body.description).toBe('Task description');
      expect(response.body.comments).toBeDefined();
      expect(response.body.history).toBeDefined();
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project and task
      const otherUser = await createTestUser({ name: 'Other' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPJ',
      });
      const otherColumn = await createTestColumn(otherProject.id, 1);
      const otherTask = await createTestTaskDirect(otherProject.id, otherUser.id, otherColumn.id);

      const response = await request(testApp)
        .get(`/api/tasks/${otherTask.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(testApp)
        .get('/api/tasks/999999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should include comments in response', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);
      
      // Add a comment
      await testPrisma.taskComment.create({
        data: {
          taskId: task.id,
          userId: userId,
          content: 'Test comment',
        },
      });

      const response = await request(testApp)
        .get(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.comments.length).toBe(1);
      expect(response.body.comments[0].content).toBe('Test comment');
    });
  });

  describe('POST /api/tasks', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .post('/api/tasks')
        .send({
          projectId: testProject.id,
          name: 'New Task',
          projectColumnId: testColumn.id,
        });

      expect(response.status).toBe(401);
    });

    it('should create a new task successfully', async () => {
      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          name: 'Brand New Task',
          description: 'Task description',
          projectColumnId: testColumn.id,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Brand New Task');
      expect(response.body.identifier).toBeDefined();
      expect(response.body.projectId).toBe(testProject.id);
      
      // Track for cleanup
      createdEntities.tasks.add(response.body.id);
    });

    it('should auto-generate task identifier', async () => {
      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          name: 'Task With Identifier',
          projectColumnId: testColumn.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.identifier).toMatch(/^TTP-\d+$/);
      
      // Track for cleanup
      createdEntities.tasks.add(response.body.id);
    });

    it('should set createdById to authenticated user', async () => {
      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          name: 'Creator Task',
          projectColumnId: testColumn.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.createdById).toBe(userId);
      
      // Track for cleanup
      createdEntities.tasks.add(response.body.id);
    });

    it('should assign task to specified user', async () => {
      const otherUser = await createTestUser({ name: 'Assignee' });
      await addProjectMember(otherUser.id, testProject.id, 'Viewer');

      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          name: 'Assigned Task',
          projectColumnId: testColumn.id,
          assigneeId: Number(otherUser.id),
        });

      expect(response.status).toBe(201);
      expect(response.body.assigneeId).toBe(Number(otherUser.id));
      
      // Track for cleanup
      createdEntities.tasks.add(response.body.id);
    });

    it('should return 403 for viewer role', async () => {
      // Create project where user is viewer
      const ownerUser = await createTestUser({ name: 'Owner' });
      const viewerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Viewer Project',
        prefix: 'VPJ',
      });
      const viewerColumn = await createTestColumn(viewerProject.id, 1);
      await addProjectMember(userId, viewerProject.id, 'Viewer');

      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: viewerProject.id,
          name: 'Viewer Task',
          projectColumnId: viewerColumn.id,
        });

      expect(response.status).toBe(403);
    });

    it('should return 400 for missing name', async () => {
      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          projectColumnId: testColumn.id,
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing projectId', async () => {
      const response = await request(testApp)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Orphan Task',
          projectColumnId: testColumn.id,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should return 401 without authentication', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .patch(`/api/tasks/${task.id}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(401);
    });

    it('should update task name', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        name: 'Original Name',
      });

      const response = await request(testApp)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    it('should update task description', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'New description' });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('New description');
    });

    it('should update task assignee', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);
      const otherUser = await createTestUser({ name: 'New Assignee' });
      await addProjectMember(otherUser.id, testProject.id, 'Viewer');

      const response = await request(testApp)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assigneeId: Number(otherUser.id) });

      expect(response.status).toBe(200);
      expect(response.body.assigneeId).toBe(Number(otherUser.id));
    });

    it('should unassign task with null assigneeId', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id, {
        assigneeId: userId,
      });

      const response = await request(testApp)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assigneeId: null });

      expect(response.status).toBe(200);
      expect(response.body.assigneeId).toBeNull();
    });

    it('should move task to different column', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);
      const newColumn = await createTestColumn(testProject.id, 2, { name: 'Done' });

      const response = await request(testApp)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectColumnId: newColumn.id });

      expect(response.status).toBe(200);
      expect(response.body.projectColumnId).toBe(newColumn.id);
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project and task
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPJ',
      });
      const otherColumn = await createTestColumn(otherProject.id, 1);
      const otherTask = await createTestTaskDirect(otherProject.id, otherUser.id, otherColumn.id);

      const response = await request(testApp)
        .patch(`/api/tasks/${otherTask.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked' });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(testApp)
        .patch('/api/tasks/999999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/move', () => {
    it('should return 401 without authentication', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .post(`/api/tasks/${task.id}/move`)
        .send({ targetColumnId: testColumn.id, targetIndex: 0 });

      expect(response.status).toBe(401);
    });

    it('should move task to different column', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);
      const newColumn = await createTestColumn(testProject.id, 2, { name: 'Done' });

      const response = await request(testApp)
        .post(`/api/tasks/${task.id}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetColumnId: newColumn.id,
          targetIndex: 0,
        });

      expect(response.status).toBe(200);

      // Verify task was moved
      const movedTask = await testPrisma.task.findUnique({
        where: { id: task.id },
      });
      expect(movedTask?.projectColumnId).toBe(newColumn.id);
    });

    it('should reorder tasks in column', async () => {
      await createTestTaskDirect(testProject.id, userId, testColumn.id, { order: 1 });
      await createTestTaskDirect(testProject.id, userId, testColumn.id, { order: 2 });
      const task3 = await createTestTaskDirect(testProject.id, userId, testColumn.id, { order: 3 });

      // Move task3 to position 0
      const response = await request(testApp)
        .post(`/api/tasks/${task3.id}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetColumnId: testColumn.id,
          targetIndex: 0,
        });

      expect(response.status).toBe(200);

      // Verify order changed
      const movedTask = await testPrisma.task.findUnique({
        where: { id: task3.id },
      });
      expect(movedTask?.order).toBe(0);
    });

    it('should return 403 for viewer role', async () => {
      // Create project where user is viewer
      const ownerUser = await createTestUser({ name: 'Owner' });
      const viewerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Viewer Project',
        prefix: 'VPJ',
      });
      const viewerColumn = await createTestColumn(viewerProject.id, 1);
      const viewerTask = await createTestTaskDirect(viewerProject.id, ownerUser.id, viewerColumn.id);
      await addProjectMember(userId, viewerProject.id, 'Viewer');

      const response = await request(testApp)
        .post(`/api/tasks/${viewerTask.id}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetColumnId: viewerColumn.id,
          targetIndex: 0,
        });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(testApp)
        .post('/api/tasks/999999/move')
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetColumnId: testColumn.id,
          targetIndex: 0,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/comments', () => {
    it('should return 401 without authentication', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .post(`/api/tasks/${task.id}/comments`)
        .send({ content: 'Test comment' });

      expect(response.status).toBe(401);
    });

    it('should add comment to task', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .post(`/api/tasks/${task.id}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'This is a test comment' });

      expect(response.status).toBe(200);
      expect(response.body.content).toBe('This is a test comment');
      expect(response.body.userId).toBe(userId);
      
      // Track for cleanup
      createdEntities.comments.add(response.body.id);
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project and task
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPJ',
      });
      const otherColumn = await createTestColumn(otherProject.id, 1);
      const otherTask = await createTestTaskDirect(otherProject.id, otherUser.id, otherColumn.id);

      const response = await request(testApp)
        .post(`/api/tasks/${otherTask.id}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Unauthorized comment' });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(testApp)
        .post('/api/tasks/999999/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Test comment' });

      expect(response.status).toBe(404);
    });

    it('should return 400 for missing content', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .post(`/api/tasks/${task.id}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/tasks/comment/:id', () => {
    it('should add comment via alternate endpoint', async () => {
      const task = await createTestTaskDirect(testProject.id, userId, testColumn.id);

      const response = await request(testApp)
        .patch(`/api/tasks/comment/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Comment via alternate endpoint' });

      expect(response.status).toBe(200);
      expect(response.body.content).toBe('Comment via alternate endpoint');
      
      // Track for cleanup
      createdEntities.comments.add(response.body.id);
    });
  });
});
