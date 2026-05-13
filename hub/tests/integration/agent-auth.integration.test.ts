import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import {
  authenticateExistingUser,
  cleanupTestData,
  createTestProject,
} from '../helpers/integration-helpers.js';
import { deleteAllAgentApiKeysForUser } from '../helpers/agent-api-key-cleanup.js';

describe('Agent API key authentication', () => {
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

  it('authenticates /api/agent/projects with x-agent-api-key', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const createAgent = await request(testApp)
      .post('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'HeaderAuthAgent', description: 'integration' });

    expect(createAgent.status).toBe(201);
    const agentId = createAgent.body.agent.id as string;
    const rawKey = createAgent.body.apiKey as string;
    expect(typeof rawKey).toBe('string');
    expect(rawKey.length).toBeGreaterThan(10);

    const project = await createTestProject(userId, {
      name: 'Agent Auth Delegation Project',
      prefix: 'AAD',
    });
    const projectId = project.id;

    const delegate = await request(testApp)
      .post(`/api/agents/${agentId}/delegations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, permissionLevel: 'VIEWER' });

    expect(delegate.status).toBe(201);

    const response = await request(testApp)
      .get('/api/agent/projects')
      .set('x-agent-api-key', rawKey);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.projects)).toBe(true);
    expect(response.body.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectId,
          permissionLevel: 'VIEWER',
        }),
      ]),
    );

    const emittedErrors = consoleErrorSpy.mock.calls.map((args) => args.map((arg) => String(arg)).join(' '));
    expect(emittedErrors.some((entry) => entry.includes('Argument `id` is missing'))).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it('returns 401 for missing credentials on /api/agent/projects', async () => {
    const response = await request(testApp).get('/api/agent/projects');
    expect(response.status).toBe(401);
  });

  it('returns 401 for invalid x-agent-api-key', async () => {
    const response = await request(testApp)
      .get('/api/agent/projects')
      .set('x-agent-api-key', 'ag_invalid_key_for_test_only');

    expect(response.status).toBe(401);
  });

  it('still supports user bearer sessions on /api/agent/projects', async () => {
    const response = await request(testApp)
      .get('/api/agent/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.projects)).toBe(true);
  });
});
