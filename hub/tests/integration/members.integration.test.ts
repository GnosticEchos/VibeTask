/**
 * Members Integration Tests
 * 
 * Tests for the Members API endpoints:
 * - GET /api/members?projectId - Get project members
 * - GET /api/members/:id?projectId - Get specific member details
 * - PATCH /api/members/:id - Update member role
 * - DELETE /api/members/:id - Remove member from project
 * - GET /api/members/check_email?projectId&email - Check if user can be invited
 * - POST /api/members/invite - Invite members to project
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { testPrisma } from './setup/test-db.js';
import {
  authenticateExistingUser,
  createTestUser,
  createTestProject,
  createTestProjectDirect,
  addProjectMember,
  cleanupTestData,
  EXISTING_USER,
} from '../helpers/integration-helpers.js';

describe('Members Integration Tests', () => {
  let token: string;
  let userId: number;
  let testProject: { id: number };

  beforeEach(async () => {
    // Authenticate with existing user
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = parseInt(auth.user.id as string, 10);

    // Create a test project for member tests
    const project = await createTestProject(userId, {
      name: 'Member Test Project',
      prefix: 'MTP',
    });
    testProject = project;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/members', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/members?projectId=${testProject.id}`);

      expect(response.status).toBe(401);
    });

    it('should return project members', async () => {
      const response = await request(testApp)
        .get(`/api/members?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should include owner in members list', async () => {
      const response = await request(testApp)
        .get(`/api/members?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const owner = response.body.find((m: any) => m.role === 'Owner');
      expect(owner).toBeDefined();
      expect(owner.userId).toBe(userId);
    });

    it('should include member details', async () => {
      const response = await request(testApp)
        .get(`/api/members?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const member = response.body[0];
      expect(member).toHaveProperty('id');
      expect(member).toHaveProperty('userId');
      expect(member).toHaveProperty('name');
      expect(member).toHaveProperty('email');
      expect(member).toHaveProperty('role');
    });

    it('should return 403 for non-member', async () => {
      // Create another user's project
      const otherUser = await createTestUser({ name: 'Other' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPJ',
      });

      const response = await request(testApp)
        .get(`/api/members?projectId=${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 400 for missing projectId', async () => {
      const response = await request(testApp)
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/members/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/members/${userId}?projectId=${testProject.id}`);

      expect(response.status).toBe(401);
    });

    it('should return specific member details', async () => {
      const response = await request(testApp)
        .get(`/api/members/${userId}?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(userId);
      expect(response.body.role).toBe('Owner');
    });

    it('should return 404 for non-member', async () => {
      // Create a user who is not a member
      const nonMember = await createTestUser({ name: 'Non Member' });

      const response = await request(testApp)
        .get(`/api/members/${nonMember.id}?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 if requester is not a member', async () => {
      // Create another user's project
      const otherUser = await createTestUser({ name: 'Owner' });
      const otherProject = await createTestProjectDirect(otherUser.id, {
        name: 'Private Project',
        prefix: 'PPJ',
      });

      const response = await request(testApp)
        .get(`/api/members/${otherUser.id}?projectId=${otherProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/members/check_email', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get(`/api/members/check_email?projectId=${testProject.id}&email=test@example.com`);

      expect(response.status).toBe(401);
    });

    it('should return user info for invitable user', async () => {
      // Create a user who is not a member
      const newUser = await createTestUser({ name: 'Invitable User' });

      const response = await request(testApp)
        .get(`/api/members/check_email?projectId=${testProject.id}&email=${newUser.email}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(newUser.email);
      // API returns number ID, newUser.id is string from Better Auth - convert for comparison
      expect(response.body.id).toBe(Number(newUser.id));
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(testApp)
        .get(`/api/members/check_email?projectId=${testProject.id}&email=nonexistent@example.com`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 409 if user is already a member', async () => {
      const response = await request(testApp)
        .get(`/api/members/check_email?projectId=${testProject.id}&email=${EXISTING_USER.email}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already belong');
    });

    it('should return 403 for viewer role', async () => {
      // Create project where user is viewer
      const ownerUser = await createTestUser({ name: 'Owner' });
      const viewerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Viewer Project',
        prefix: 'VPJ',
      });
      await addProjectMember(userId, viewerProject.id, 'Viewer');

      const newUser = await createTestUser({ name: 'To Invite' });

      const response = await request(testApp)
        .get(`/api/members/check_email?projectId=${viewerProject.id}&email=${newUser.email}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 400 for missing parameters', async () => {
      const response = await request(testApp)
        .get(`/api/members/check_email?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/members/invite', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .post('/api/members/invite')
        .send({
          projectId: testProject.id,
          users: [{ id: 999, role: 'Viewer' }],
        });

      expect(response.status).toBe(401);
    });

    it('should invite users to project', async () => {
      // Create users to invite
      const user1 = await createTestUser({ name: 'Invite 1' });
      const user2 = await createTestUser({ name: 'Invite 2' });

      const response = await request(testApp)
        .post('/api/members/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          users: [
            { id: Number(user1.id), role: 'Editor' },
            { id: Number(user2.id), role: 'Viewer' },
          ],
        });

      expect(response.status).toBe(200);

      // Verify memberships - convert string IDs to numbers for Prisma
      const membership1 = await testPrisma.projectUser.findFirst({
        where: { projectId: testProject.id, userId: Number(user1.id) },
      });
      const membership2 = await testPrisma.projectUser.findFirst({
        where: { projectId: testProject.id, userId: Number(user2.id) },
      });

      expect(membership1?.role).toBe('Editor');
      expect(membership2?.role).toBe('Viewer');
    });

    it('should return 403 for viewer role', async () => {
      // Create project where user is viewer
      const ownerUser = await createTestUser({ name: 'Owner' });
      const viewerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Viewer Project',
        prefix: 'VPJ',
      });
      await addProjectMember(userId, viewerProject.id, 'Viewer');

      const newUser = await createTestUser({ name: 'To Invite' });

      const response = await request(testApp)
        .post('/api/members/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: viewerProject.id,
          users: [{ id: Number(newUser.id), role: 'Viewer' }],
        });

      expect(response.status).toBe(403);
    });

    it('should return 400 for missing projectId', async () => {
      const newUser = await createTestUser({ name: 'To Invite' });

      const response = await request(testApp)
        .post('/api/members/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({
          users: [{ id: Number(newUser.id), role: 'Viewer' }],
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing users array', async () => {
      const response = await request(testApp)
        .post('/api/members/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/members/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .patch(`/api/members/${userId}`)
        .send({
          projectId: testProject.id,
          role: 'Editor',
        });

      expect(response.status).toBe(401);
    });

    it('should update member role for owner', async () => {
      // Add a member to update
      const member = await createTestUser({ name: 'Member' });
      await addProjectMember(member.id, testProject.id, 'Viewer');

      const response = await request(testApp)
        .patch(`/api/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          role: 'Editor',
        });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('Editor');
    });

    it('should return 403 for non-owner', async () => {
      // Create project where user is maintainer (not owner)
      const ownerUser = await createTestUser({ name: 'Owner' });
      const maintainerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Maintainer Project',
        prefix: 'MPJ',
      });
      await addProjectMember(userId, maintainerProject.id, 'Maintainer');

      const member = await createTestUser({ name: 'Member' });
      await addProjectMember(member.id, maintainerProject.id, 'Viewer');

      const response = await request(testApp)
        .patch(`/api/members/${member.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: maintainerProject.id,
          role: 'Editor',
        });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-member', async () => {
      const nonMember = await createTestUser({ name: 'Non Member' });

      const response = await request(testApp)
        .patch(`/api/members/${nonMember.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
          role: 'Editor',
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 for missing role', async () => {
      const response = await request(testApp)
        .patch(`/api/members/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: testProject.id,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/members/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .delete(`/api/members/${userId}?projectId=${testProject.id}`);

      expect(response.status).toBe(401);
    });

    it('should remove member for owner', async () => {
      // Add a member to remove
      const member = await createTestUser({ name: 'To Remove' });
      await addProjectMember(member.id, testProject.id, 'Viewer');

      const response = await request(testApp)
        .delete(`/api/members/${member.id}?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify removal - convert string ID to number for Prisma
      const membership = await testPrisma.projectUser.findFirst({
        where: { projectId: testProject.id, userId: Number(member.id) },
      });
      expect(membership).toBeNull();
    });

    it('should allow member to remove themselves', async () => {
      // Create project where user is a member (not owner)
      const ownerUser = await createTestUser({ name: 'Owner' });
      const memberProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Member Project',
        prefix: 'MPJ',
      });
      await addProjectMember(userId, memberProject.id, 'Editor');

      const response = await request(testApp)
        .delete(`/api/members/${userId}?projectId=${memberProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify removal
      const membership = await testPrisma.projectUser.findFirst({
        where: { projectId: memberProject.id, userId: userId },
      });
      expect(membership).toBeNull();
    });

    it('should return 403 when trying to remove owner', async () => {
      const response = await request(testApp)
        .delete(`/api/members/${userId}?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Cannot remove project owner');
    });

    it('should return 403 for non-owner trying to remove others', async () => {
      // Create project where user is maintainer (not owner)
      const ownerUser = await createTestUser({ name: 'Owner' });
      const maintainerProject = await createTestProjectDirect(ownerUser.id, {
        name: 'Maintainer Project',
        prefix: 'MPJ',
      });
      await addProjectMember(userId, maintainerProject.id, 'Maintainer');

      const member = await createTestUser({ name: 'Member' });
      await addProjectMember(member.id, maintainerProject.id, 'Viewer');

      const response = await request(testApp)
        .delete(`/api/members/${member.id}?projectId=${maintainerProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-member', async () => {
      const nonMember = await createTestUser({ name: 'Non Member' });

      const response = await request(testApp)
        .delete(`/api/members/${nonMember.id}?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return removed member info', async () => {
      const member = await createTestUser({ name: 'To Remove' });
      await addProjectMember(member.id, testProject.id, 'Editor');

      const response = await request(testApp)
        .delete(`/api/members/${member.id}?projectId=${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // API returns userId as number, member.id is string from Better Auth - convert both for comparison
      expect(response.body.userId).toBe(Number(member.id));
      expect(response.body.role).toBe('Editor');
    });
  });
});
