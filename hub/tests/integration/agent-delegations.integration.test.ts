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

  it('persists COLUMN_BOUND lattice fields on create and returns them on list', async () => {
    const createAgent = await request(testApp)
      .post('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ColumnBoundSmoke', description: 'd' });

    expect(createAgent.status).toBe(201);
    const agentId = createAgent.body.agent.id as string;

    const project = await createTestProject(userId, {
      name: 'Column Bound Project',
      prefix: 'CBP',
    });
    const projectId = project.id;

    const column = await request(testApp)
      .get(`/api/columns?projectId=${projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(column.status).toBe(200);
    const verifyColumn = (column.body as { data?: { id: number; name: string }[] }).data?.[0];
    expect(verifyColumn?.id).toBeTruthy();

    const create = await request(testApp)
      .post(`/api/agents/${agentId}/delegations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId,
        permissionLevel: 'USER',
        delegationMode: 'COLUMN_BOUND',
        restrictedColumnId: verifyColumn!.id,
        allowedMoveRange: 1,
      });

    expect(create.status).toBe(201);
    expect(create.body.delegation.delegationMode).toBe('COLUMN_BOUND');
    expect(create.body.delegation.restrictedColumnId).toBe(verifyColumn!.id);
    expect(create.body.delegation.allowedMoveRange).toBe(1);

    const list = await request(testApp)
      .get(`/api/agents/${agentId}/delegations`)
      .set('Authorization', `Bearer ${token}`);

    expect(list.status).toBe(200);
    expect(list.body.delegations).toHaveLength(1);
    expect(list.body.delegations[0].delegationMode).toBe('COLUMN_BOUND');
    expect(list.body.delegations[0].restrictedColumnId).toBe(verifyColumn!.id);
  });
});
