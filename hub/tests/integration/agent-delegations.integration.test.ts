/**
 * POST /api/agents/:agentId/delegations integration smoke test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import {
  authenticateExistingUser,
  cleanupTestData,
  createTestProject,
} from '../helpers/integration-helpers.js';
import { deleteAllAgentApiKeysForUser } from '../helpers/agent-api-key-cleanup.js';

describe('Agent delegations POST', () => {
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

  it('returns 201 when delegating to a project the user belongs to', async () => {
    const createAgent = await request(testApp)
      .post('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'DelegationSmoke', description: 'd' });

    expect(createAgent.status).toBe(201);
    const agentId = createAgent.body.agent.id as string;

    const project = await createTestProject(userId, {
      name: 'Agent Delegation Project',
      prefix: 'ADP',
    });
    const projectId = project.id;

    const res = await request(testApp)
      .post(`/api/agents/${agentId}/delegations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, permissionLevel: 'VIEWER' });

    expect(res.status).toBe(201);
    expect(res.body.delegation).toBeDefined();
    expect(res.body.delegation.projectId).toBe(projectId);
  });
});
