/**
 * Projects Integration Tests
 * 
 * Tests for the Projects API endpoints:
 * - GET /api/projects - Get list of user's projects
 * - POST /api/projects - Create a new project
 * - GET /api/projects/:id - Get project data with columns and tasks
 * - GET /api/projects/:id/summary - Get project summary
 * - PATCH /api/projects/:id - Update project data
 * - DELETE /api/projects/:id - Delete a project
 * - GET /api/projects/:id/board - Get complete board data
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
  EXISTING_PROJECT_IDS,
  createTestProjectData,
} from '../helpers/integration-helpers.js';

describe('Projects Integration Tests', () => {
  let token: string;
  let userId: number;

  beforeEach(async () => {
    // Authenticate with existing user
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = parseInt(auth.user.id as string, 10);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/projects', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp).get('/api/projects');
      expect(response.status).toBe(401);
    });

    it('should return list of projects for authenticated user', async () => {
      const response = await request(testApp)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should include newly created project in list', async () => {
      // Create a new project
      await createTestProject(userId, { 
        name: 'New Test Project',
        prefix: 'NTP' 
      });

      const response = await request(testApp)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const projectNames = response.body.data.map((p: any) => p.name);
      expect(projectNames).toContain('New Test Project');
    });

    it('should only return projects where user is a member', async () => {
      // Create another user
      const otherUser = await createTestUser({ name: 'Other User' });
      
      // Create project owned by other user (user is not a member)
      await createTestProjectDirect(otherUser.id, { 
        name: 'Other User Project',
        prefix: 'OUP' 
      });

      const response = await request(testApp)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const projectNames = response.body.data.map((p: any) => p.name);
      expect(projectNames).not.toContain('Other User Project');
    });

    it('should include columns in project response', async () => {
      // Create project with columns
      const project = await createTestProject(userId, { 
        name: 'Project With Columns',
        prefix: 'PWC' 
      });
      
      // Add columns
      await createTestColumn(project.id, 1, { name: 'To Do' });
      await createTestColumn(project.id, 2, { name: 'Done' });

      const response = await request(testApp)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      
      const projectData = response.body.data.find((p: any) => p.id === project.id);
      expect(projectData).toBeDefined();
      expect(projectData.columns).toBeDefined();
      expect(projectData.columns.length).toBe(2);
    });
  });

  describe('POST /api/projects', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .post('/api/projects')
        .send({ name: 'Test', prefix: 'TST' });

      expect(response.status).toBe(401);
    });

    it('should create a new project successfully', async () => {
      const projectData = createTestProjectData(userId, {
        name: 'Brand New Project',
        prefix: 'BNP',
        description: 'A test project',
      });

      const response = await request(testApp)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send(projectData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Brand New Project');
      expect(response.body.prefix).toBe('BNP');
      expect(response.body.description).toBe('A test project');
      
      // Track for cleanup
      createdEntities.projects.add(response.body.id);
    });

    it('should automatically add creator as owner member', async () => {
      const projectData = createTestProjectData(userId, {
        name: 'Owner Test Project',
        prefix: 'OTP',
      });

      const response = await request(testApp)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send(projectData);

      expect(response.status).toBe(201);
      
      // Verify membership
      const membership = await testPrisma.projectUser.findFirst({
        where: {
          projectId: response.body.id,
          userId: userId,
        },
      });

      expect(membership).toBeDefined();
      expect(membership?.role).toBe('Owner');
      
      // Track for cleanup
      createdEntities.projects.add(response.body.id);
    });

    it('should return 400 for missing name', async () => {
      const response = await request(testApp)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ prefix: 'TST' });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing prefix', async () => {
      const response = await request(testApp)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Project' });

      expect(response.status).toBe(400);
    });

    it('should create project with initial columns', async () => {
      const response = await request(testApp)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Project With Columns',
          prefix: 'PWC',
          columns: [
            { name: 'Backlog', order: 1 },
            { name: 'In Progress', order: 2 },
            { name: 'Done', order: 3 },
          ],
        });

      expect(response.status).toBe(201);
      
      // Verify columns were created
      const columns = await testPrisma.projectColumn.findMany({
        where: { projectId: response.body.id },
        orderBy: { order: 'asc' },
      });

      expect(columns.length).toBe(3);
      expect(columns[0].name).toBe('Backlog');
      expect(columns[1].name).toBe('In Progress');
      expect(columns[2].name).toBe('Done');
      
      // Track for cleanup
      createdEntities.projects.add(response.body.id);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/projects/${EXISTING_PROJECT_IDS[0]}`);

      expect(response.status).toBe(401);
    });

    it('should return project data for member', async () => {
      // Create a project as member
      const project = await createTestProject(userId, {
        name: 'Detail Test Project',
        prefix: 'DTP',
      });

      const response = await request(testApp)
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(project.id);
      expect(response.body.name).toBe('Detail Test Project');
      expect(response.body.columns).toBeDefined();
      expect(response.body.members).toBeDefined();
    });

    it('should return 403 for non-member', async () => {
      // Create another user and project
      const otherUser = await createTestUser({ name: 'Other' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPR',
      });

      const response = await request(testApp)
        .get(`/api/projects/${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(testApp)
        .get('/api/projects/999999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should include tasks in columns', async () => {
      const project = await createTestProject(userId, {
        name: 'Project With Tasks',
        prefix: 'PWT',
      });
      
      const column = await createTestColumn(project.id, 1, { name: 'To Do' });
      await createTestTaskDirect(project.id, userId, column.id, {
        name: 'Test Task',
      });

      const response = await request(testApp)
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.columns[0].tasks).toBeDefined();
      expect(response.body.columns[0].tasks.length).toBe(1);
      expect(response.body.columns[0].tasks[0].name).toBe('Test Task');
    });
  });

  describe('GET /api/projects/:id/summary', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/projects/${EXISTING_PROJECT_IDS[0]}/summary`);

      expect(response.status).toBe(401);
    });

    it('should return project summary', async () => {
      const project = await createTestProject(userId, {
        name: 'Summary Test Project',
        prefix: 'STP',
      });
      
      await createTestColumn(project.id, 1, { name: 'To Do' });
      await createTestColumn(project.id, 2, { name: 'Done' });

      const response = await request(testApp)
        .get(`/api/projects/${project.id}/summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.projectName).toBe('Summary Test Project');
      expect(response.body.columnSummary).toBeDefined();
      expect(response.body.columnSummary.length).toBe(2);
    });

    it('should include member information', async () => {
      const project = await createTestProject(userId, {
        name: 'Member Summary Project',
        prefix: 'MSP',
      });

      const response = await request(testApp)
        .get(`/api/projects/${project.id}/summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.members).toBeDefined();
      expect(response.body.members.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(testApp)
        .get('/api/projects/999999/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .patch(`/api/projects/${EXISTING_PROJECT_IDS[0]}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(401);
    });

    it('should update project name for owner', async () => {
      const project = await createTestProject(userId, {
        name: 'Original Name',
        prefix: 'ORN',
      });

      const response = await request(testApp)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    it('should update project description for owner', async () => {
      const project = await createTestProject(userId, {
        name: 'Desc Test',
        prefix: 'DSC',
        description: 'Original description',
      });

      const response = await request(testApp)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Updated description' });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Updated description');
    });

    it('should return 403 for non-owner', async () => {
      // Create another user and project
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Other Project',
        prefix: 'OPR',
      });
      
      // Add test user as member (not owner)
      await addProjectMember(userId, otherProject.id, 'Editor');

      const response = await request(testApp)
        .patch(`/api/projects/${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(testApp)
        .patch('/api/projects/999999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .delete(`/api/projects/${EXISTING_PROJECT_IDS[0]}`);

      expect(response.status).toBe(401);
    });

    it('should delete project for owner', async () => {
      const project = await createTestProject(userId, {
        name: 'To Be Deleted',
        prefix: 'TBD',
      });

      const response = await request(testApp)
        .delete(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify project is deleted
      const deletedProject = await testPrisma.project.findUnique({
        where: { id: project.id },
      });
      expect(deletedProject).toBeNull();
    });

    it('should return 403 for non-owner', async () => {
      // Create another user and project
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Protected Project',
        prefix: 'PPJ',
      });
      
      // Add test user as member (not owner)
      await addProjectMember(userId, otherProject.id, 'Editor');

      const response = await request(testApp)
        .delete(`/api/projects/${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should cascade delete columns and tasks', async () => {
      const project = await createTestProject(userId, {
        name: 'Cascade Delete Test',
        prefix: 'CDT',
      });
      
      const column = await createTestColumn(project.id, 1);
      const task = await createTestTaskDirect(project.id, userId, column.id);

      await request(testApp)
        .delete(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify cascade
      const deletedColumn = await testPrisma.projectColumn.findUnique({
        where: { id: column.id },
      });
      const deletedTask = await testPrisma.task.findUnique({
        where: { id: task.id },
      });

      expect(deletedColumn).toBeNull();
      expect(deletedTask).toBeNull();
    });
  });

  describe('GET /api/projects/:id/board', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/projects/${EXISTING_PROJECT_IDS[0]}/board`);

      expect(response.status).toBe(401);
    });

    it('should return board data for member', async () => {
      const project = await createTestProject(userId, {
        name: 'Board Test Project',
        prefix: 'BTP',
      });
      
      await createTestColumn(project.id, 1, { name: 'To Do' });
      await createTestColumn(project.id, 2, { name: 'Done' });

      const response = await request(testApp)
        .get(`/api/projects/${project.id}/board`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.board).toBeDefined();
      expect(response.body.board.name).toBe('Board Test Project');
      expect(response.body.columns).toBeDefined();
      expect(response.body.columns.length).toBe(2);
      expect(response.body.members).toBeDefined();
      expect(response.body.permissions).toBeDefined();
    });

    it('should return correct permissions for owner', async () => {
      const project = await createTestProject(userId, {
        name: 'Owner Board',
        prefix: 'OBD',
      });

      const response = await request(testApp)
        .get(`/api/projects/${project.id}/board`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.permissions.canEdit).toBe(true);
      expect(response.body.permissions.canAddColumn).toBe(true);
      expect(response.body.permissions.canMoveTask).toBe(true);
    });

    it('should return correct permissions for viewer', async () => {
      // Create another user's project
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Viewer Board',
        prefix: 'VBD',
      });
      
      // Add test user as viewer
      await addProjectMember(userId, otherProject.id, 'Viewer');

      const response = await request(testApp)
        .get(`/api/projects/${otherProject.id}/board`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.permissions.canEdit).toBe(false);
      expect(response.body.permissions.canAddColumn).toBe(false);
      expect(response.body.permissions.canMoveTask).toBe(false);
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Board',
        prefix: 'PVB',
      });

      const response = await request(testApp)
        .get(`/api/projects/${otherProject.id}/board`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(testApp)
        .get('/api/projects/999999/board')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });
});
