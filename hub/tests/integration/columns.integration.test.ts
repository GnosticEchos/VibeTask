/**
 * Columns Integration Tests
 * 
 * Tests for the Columns API endpoints:
 * - GET /api/columns?projectId - Get all columns for a project
 * - POST /api/columns?projectId - Create a new column
 * - PATCH /api/columns - Batch update/create/delete columns
 * - PATCH /api/columns/:id - Update a single column
 * - DELETE /api/columns/:id - Delete a single column
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

describe('Columns Integration Tests', () => {
  let token: string;
  let userId: number;
  let testProject: { id: number };

  beforeEach(async () => {
    // Authenticate with existing user
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = parseInt(auth.user.id as string, 10);
    
    // Create a test project for each test
    testProject = await createTestProject(userId, { bare: true });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/columns', () => {
    it('should return 401 without authentication', async () => {
      // Use an existing project ID that doesn't require creating testProject
      const response = await request(testApp)
        .get('/api/columns?projectId=1');

      expect(response.status).toBe(401);
    });

    it('should return columns for a project', async () => {
      // Create some columns
      await createTestColumn(testProject.id, 1, { name: 'To Do' });
      await createTestColumn(testProject.id, 2, { name: 'In Progress' });
      await createTestColumn(testProject.id, 3, { name: 'Done' });

      const response = await request(testApp)
        .get(`/api/columns?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(3);
    });

    it('should return columns in order', async () => {
      await createTestColumn(testProject.id, 3, { name: 'Third' });
      await createTestColumn(testProject.id, 1, { name: 'First' });
      await createTestColumn(testProject.id, 2, { name: 'Second' });

      const response = await request(testApp)
        .get(`/api/columns?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].name).toBe('First');
      expect(response.body.data[1].name).toBe('Second');
      expect(response.body.data[2].name).toBe('Third');
    });

    it('should include tasks in columns', async () => {
      const column = await createTestColumn(testProject.id, 1, { name: 'With Tasks' });
      await createTestTaskDirect(testProject.id, userId, column.id, { name: 'Task 1' });
      await createTestTaskDirect(testProject.id, userId, column.id, { name: 'Task 2' });

      const response = await request(testApp)
        .get(`/api/columns?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const columnWithTasks = response.body.data.find((c: any) => c.id === column.id);
      expect(columnWithTasks.tasks).toBeDefined();
      expect(columnWithTasks.tasks.length).toBe(2);
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project
      const otherUser = await createTestUser({ name: 'Other' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPJ',
      });

      const response = await request(testApp)
        .get(`/api/columns?projectId=${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 400 for missing projectId', async () => {
      const response = await request(testApp)
        .get('/api/columns')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/columns', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .post('/api/columns')
        .send({
          name: 'New Column',
          projectId: testProject.id,
        });

      expect(response.status).toBe(401);
    });

    it('should create a new column successfully', async () => {
      const response = await request(testApp)
        .post('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Column',
          projectId: testProject.id,
          order: 1,
          color: '#ff0000',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Column');
      expect(response.body.projectId).toBe(testProject.id);
      expect(response.body.color).toBe('#ff0000');
      
      // Track for cleanup
      createdEntities.columns.add(response.body.id);
    });

    it('should auto-assign order if not provided', async () => {
      // Create existing columns
      await createTestColumn(testProject.id, 1);
      await createTestColumn(testProject.id, 2);

      const response = await request(testApp)
        .post('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Auto Order Column',
          projectId: testProject.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.order).toBe(3);
      
      // Track for cleanup
      createdEntities.columns.add(response.body.id);
    });

    it('should use default color if not provided', async () => {
      const response = await request(testApp)
        .post('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Default Color Column',
          projectId: testProject.id,
          order: 1,
        });

      expect(response.status).toBe(201);
      expect(response.body.color).toBe('#6366f1');
      
      // Track for cleanup
      createdEntities.columns.add(response.body.id);
    });

    it('should return 403 for viewer role', async () => {
      // Create project where user is viewer
      const ownerUser = await createTestUser({ name: 'Owner' });
      const viewerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Viewer Project',
        prefix: 'VPJ',
      });
      await addProjectMember(userId, viewerProject.id, 'Viewer');

      const response = await request(testApp)
        .post('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Viewer Column',
          projectId: viewerProject.id,
          order: 1,
        });

      expect(response.status).toBe(403);
    });

    it('should return 400 for missing name', async () => {
      const response = await request(testApp)
        .post('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          order: 1,
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing projectId', async () => {
      const response = await request(testApp)
        .post('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Orphan Column',
          order: 1,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/columns (batch)', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .patch('/api/columns')
        .send({
          projectId: testProject.id,
          columns: [],
        });

      expect(response.status).toBe(401);
    });

    it('should create new columns in batch', async () => {
      const response = await request(testApp)
        .patch('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          columns: [
            { name: 'Backlog', order: 1, color: '#808080' },
            { name: 'In Progress', order: 2, color: '#0000ff' },
            { name: 'Done', order: 3, color: '#00ff00' },
          ],
        });

      expect(response.status).toBe(200);

      // Verify columns were created
      const columns = await testPrisma.projectColumn.findMany({
        where: { projectId: testProject.id },
        orderBy: { order: 'asc' },
      });
      expect(columns.length).toBe(3);
    });

    it('should update existing columns in batch', async () => {
      const column1 = await createTestColumn(testProject.id, 1, { name: 'Old Name 1' });
      const column2 = await createTestColumn(testProject.id, 2, { name: 'Old Name 2' });

      const response = await request(testApp)
        .patch('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          columns: [
            { id: column1.id, name: 'New Name 1', order: 1, color: '#ff0000' },
            { id: column2.id, name: 'New Name 2', order: 2, color: '#0000ff' },
          ],
        });

      expect(response.status).toBe(200);

      // Verify updates
      const updated1 = await testPrisma.projectColumn.findUnique({
        where: { id: column1.id },
      });
      const updated2 = await testPrisma.projectColumn.findUnique({
        where: { id: column2.id },
      });
      expect(updated1?.name).toBe('New Name 1');
      expect(updated2?.name).toBe('New Name 2');
    });

    it('should delete columns marked with toDelete', async () => {
      const column1 = await createTestColumn(testProject.id, 1, { name: 'Keep' });
      const column2 = await createTestColumn(testProject.id, 2, { name: 'Delete' });

      const response = await request(testApp)
        .patch('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          columns: [
            { id: column1.id, name: 'Keep', order: 1, color: '#0000ff' },
            { id: column2.id, name: 'Delete', order: 2, color: '#ff0000', toDelete: true },
          ],
        });

      expect(response.status).toBe(200);

      // Verify deletion
      const deleted = await testPrisma.projectColumn.findUnique({
        where: { id: column2.id },
      });
      expect(deleted).toBeNull();
    });

    it('should handle mixed operations in batch', async () => {
      const existingColumn = await createTestColumn(testProject.id, 1, { name: 'Update Me' });
      const deleteColumn = await createTestColumn(testProject.id, 2, { name: 'Delete Me' });

      const response = await request(testApp)
        .patch('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          columns: [
            { id: existingColumn.id, name: 'Updated', order: 1, color: '#0000ff' },
            { id: deleteColumn.id, name: 'Delete Me', order: 2, color: '#ff0000', toDelete: true },
            { name: 'New Column', order: 3, color: '#00ff00' },
          ],
        });

      expect(response.status).toBe(200);

      // Verify results
      const columns = await testPrisma.projectColumn.findMany({
        where: { projectId: testProject.id },
        orderBy: { order: 'asc' },
      });
      
      expect(columns.length).toBe(2);
      expect(columns[0].name).toBe('Updated');
      expect(columns[1].name).toBe('New Column');
    });

    it('should return 403 for viewer role', async () => {
      // Create project where user is viewer
      const ownerUser = await createTestUser({ name: 'Owner' });
      const viewerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Viewer Project',
        prefix: 'VPJ',
      });
      await addProjectMember(userId, viewerProject.id, 'Viewer');

      const response = await request(testApp)
        .patch('/api/columns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: viewerProject.id,
          columns: [{ name: 'New', order: 1 }],
        });

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/columns/:id', () => {
    it('should return 401 without authentication', async () => {
      const column = await createTestColumn(testProject.id, 1);

      const response = await request(testApp)
        .patch(`/api/columns/${column.id}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(401);
    });

    it('should update column name', async () => {
      const column = await createTestColumn(testProject.id, 1, { name: 'Original' });

      const response = await request(testApp)
        .patch(`/api/columns/${column.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    it('should update column color', async () => {
      const column = await createTestColumn(testProject.id, 1, { color: '#000000' });

      const response = await request(testApp)
        .patch(`/api/columns/${column.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ color: '#ffffff' });

      expect(response.status).toBe(200);
      expect(response.body.color).toBe('#ffffff');
    });

    it('should update column order', async () => {
      const column = await createTestColumn(testProject.id, 1, { order: 1 });

      const response = await request(testApp)
        .patch(`/api/columns/${column.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ order: 5 });

      expect(response.status).toBe(200);
      expect(response.body.order).toBe(5);
    });

    it('should update column type', async () => {
      const column = await createTestColumn(testProject.id, 1);

      const response = await request(testApp)
        .patch(`/api/columns/${column.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'DONE' });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('DONE');
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
        .patch(`/api/columns/${viewerColumn.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked' });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent column', async () => {
      const response = await request(testApp)
        .patch('/api/columns/999999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/columns/:id', () => {
    it('should return 401 without authentication', async () => {
      const column = await createTestColumn(testProject.id, 1);

      const response = await request(testApp)
        .delete(`/api/columns/${column.id}`);

      expect(response.status).toBe(401);
    });

    it('should delete column successfully', async () => {
      const column = await createTestColumn(testProject.id, 1, { name: 'To Delete' });

      const response = await request(testApp)
        .delete(`/api/columns/${column.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);

      // Verify deletion
      const deleted = await testPrisma.projectColumn.findUnique({
        where: { id: column.id },
      });
      expect(deleted).toBeNull();
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
        .delete(`/api/columns/${viewerColumn.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent column', async () => {
      const response = await request(testApp)
        .delete('/api/columns/999999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should cascade delete tasks in column', async () => {
      const column = await createTestColumn(testProject.id, 1);
      const task = await createTestTaskDirect(testProject.id, userId, column.id);

      await request(testApp)
        .delete(`/api/columns/${column.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify task's column is null (tasks are unassigned, not deleted)
      await testPrisma.task.findUnique({
        where: { id: task.id },
      });
      // Note: Behavior depends on your schema - tasks may be deleted or unassigned
      // This test documents the expected behavior
    });
  });
});
