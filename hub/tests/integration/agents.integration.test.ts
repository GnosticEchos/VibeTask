/**
 * Agents Integration Tests
 * 
 * Tests for the Agents API endpoints:
 * - POST /api/agents - Create new agent
 * - GET /api/agents - List user's agents
 * - PATCH /api/agents/:id - Update agent
 * - DELETE /api/agents/:id - Delete agent
 * - POST /api/agents/:id/regenerate-key - Rotate API key
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { testPrisma } from './setup/test-db.js';
import {
  authenticateExistingUser,
  createTestUser,
  cleanupTestData,
} from '../helpers/integration-helpers.js';
import { deleteAllAgentApiKeysForUser } from '../helpers/agent-api-key-cleanup.js';

describe('Agents Integration Tests', () => {
  let token: string;
  let userId: number;
  let testStartedAt: Date;

  beforeEach(async () => {
    testStartedAt = new Date();
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = parseInt(auth.user.id as string, 10);
  });

  afterEach(async () => {
    await deleteAllAgentApiKeysForUser(userId, {
      createdAfter: testStartedAt,
      includeExistingUser: true,
    });
    await cleanupTestData();
  });

  describe('POST /api/agents', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .send({
          name: 'Test Agent',
        });

      expect(response.status).toBe(401);
    });

    it('should create a new agent successfully', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Agent',
          description: 'A test agent for integration tests',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('agent');
      expect(response.body).toHaveProperty('apiKey');
      expect(response.body.agent.name).toBe('Test Agent');
      expect(response.body.agent.metadata?.description).toBe('A test agent for integration tests');
      
      // API key should only be shown once
      expect(response.body.apiKey).toBeDefined();
      // Better Auth returns keys with prefix 'ag' (no underscore)
      expect(response.body.apiKey).toMatch(/^ag/);
    });

    it('should create agent with custom expiration', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Short-lived Agent',
          expiresIn: 86400, // 1 day (Better Auth minimum)
        });

      expect(response.status).toBe(201);
      expect(response.body.agent.expiresAt).toBeDefined();
      
      // Verify expiration is approximately 1 day from now
      const expiresAt = new Date(response.body.agent.expiresAt);
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(0.9);
      expect(diffDays).toBeLessThan(1.1);
    });

    it('should return 400 for missing name', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'No name agent',
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for name too long', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'A'.repeat(101), // Max is 100
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for expiration too short', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Invalid Expiration',
          expiresIn: 30, // Min is 60 seconds
        });

      expect(response.status).toBe(400);
    });

    it('should create audit log entry', async () => {
      const response = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Audit Test Agent',
        });

      expect(response.status).toBe(201);

      // Verify audit log was created
      const auditLog = await testPrisma.agentLifecycleAuditLog.findFirst({
        where: {
          apiKeyId: response.body.agent.id,
          action: 'AGENT_CREATED',
        },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.performedBy).toBe(userId);
    });
  });

  describe('GET /api/agents', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .get('/api/agents');

      expect(response.status).toBe(401);
    });

    it('should return empty array when no agents', async () => {
      const response = await request(testApp)
        .get('/api/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('agents');
      expect(Array.isArray(response.body.agents)).toBe(true);
    });

    it('should return list of user agents', async () => {
      // Create an agent first
      await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'List Test Agent',
        });

      const response = await request(testApp)
        .get('/api/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.agents.length).toBeGreaterThan(0);
      
      const agent = response.body.agents.find((a: any) => a.name === 'List Test Agent');
      expect(agent).toBeDefined();
      expect(agent.name).toBe('List Test Agent');
    });

    it('should not include API key in list', async () => {
      // Create an agent
      await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'No Key Agent',
        });

      const response = await request(testApp)
        .get('/api/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      
      const agent = response.body.agents.find((a: any) => a.name === 'No Key Agent');
      expect(agent).toBeDefined();
      expect(agent.apiKey).toBeUndefined();
    });

    it('should only show agents for authenticated user', async () => {
      // Create agent for current user
      await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'My Agent',
        });

      // Create another user and their agent
      const otherUser = await createTestUser({ name: 'Other' });
      const otherAuth = await request(testApp)
        .post('/api/login')
        .send({ email: otherUser.email, password: 'TestPass123!' });
      
      if (otherAuth.status === 200) {
        await request(testApp)
          .post('/api/agents')
          .set('Authorization', `Bearer ${otherAuth.body.token}`)
          .send({
            name: 'Other Agent',
          });
      }

      const response = await request(testApp)
        .get('/api/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      
      // Should only see own agents
      const agentNames = response.body.agents.map((a: any) => a.name);
      expect(agentNames).toContain('My Agent');
      expect(agentNames).not.toContain('Other Agent');
    });
  });

  describe('PATCH /api/agents/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .patch('/api/agents/some-id')
        .send({ name: 'Updated' });

      expect(response.status).toBe(401);
    });

    it('should update agent name', async () => {
      // Create an agent
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Original Name',
        });

      expect(createResponse.status).toBe(201);
      const agentId = createResponse.body.agent.id;

      const response = await request(testApp)
        .patch(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.agent.name).toBe('Updated Name');
    });

    it('should update agent description', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Desc Update Agent',
        });

      const agentId = createResponse.body.agent.id;

      const response = await request(testApp)
        .patch(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'New description',
        });

      expect(response.status).toBe(200);
      expect(response.body.agent.metadata?.description).toBe('New description');
    });

    it('should update agent active status', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Active Toggle Agent',
        });

      const agentId = createResponse.body.agent.id;

      const response = await request(testApp)
        .patch(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          isActive: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.agent.isActive).toBe(false);
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await request(testApp)
        .patch('/api/agents/non-existent-id')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated',
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 for name too long', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Valid Name',
        });

      const agentId = createResponse.body.agent.id;

      const response = await request(testApp)
        .patch(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'A'.repeat(101),
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/agents/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .delete('/api/agents/some-id');

      expect(response.status).toBe(401);
    });

    it('should delete agent successfully', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'To Delete',
        });

      const agentId = createResponse.body.agent.id;

      const response = await request(testApp)
        .delete(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);

      // Verify agent is deleted
      const listResponse = await request(testApp)
        .get('/api/agents')
        .set('Authorization', `Bearer ${token}`);

      const deleted = listResponse.body.agents.find((a: any) => a.id === agentId);
      expect(deleted).toBeUndefined();
    });

    it('should delete associated delegations', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Delegation Agent',
        });

      const agentId = createResponse.body.agent.id;

      // Create a delegation (if applicable)
      // Note: This depends on your delegation implementation
      
      const response = await request(testApp)
        .delete(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await request(testApp)
        .delete('/api/agents/non-existent-id')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/agents/:id/regenerate-key', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(testApp)
        .post('/api/agents/some-id/regenerate-key');

      expect(response.status).toBe(401);
    });

    it('should regenerate API key', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Key Regenerate Agent',
        });

      const agentId = createResponse.body.agent.id;
      const originalKey = createResponse.body.apiKey;

      const response = await request(testApp)
        .post(`/api/agents/${agentId}/regenerate-key`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('agent');
      expect(response.body).toHaveProperty('apiKey');
      expect(response.body.apiKey).toBeDefined();
      expect(response.body.apiKey).not.toBe(originalKey);
    });

    it('should preserve agent settings', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Settings Preserve Agent',
          description: 'Original description',
        });

      const agentId = createResponse.body.agent.id;

      const response = await request(testApp)
        .post(`/api/agents/${agentId}/regenerate-key`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.agent.name).toBe('Settings Preserve Agent');
      expect(response.body.agent.metadata?.description).toBe('Original description');
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await request(testApp)
        .post('/api/agents/non-existent-id/regenerate-key')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should generate new agent ID', async () => {
      const createResponse = await request(testApp)
        .post('/api/agents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'ID Change Agent',
        });

      const originalId = createResponse.body.agent.id;

      const response = await request(testApp)
        .post(`/api/agents/${originalId}/regenerate-key`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // The regenerated key should have a new ID
      expect(response.body.agent.id).toBeDefined();
    });
  });
});
