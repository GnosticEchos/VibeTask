import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { testPrisma } from './setup/test-db.js';
import {
  authenticateExistingUser,
  cleanupTestData,
  createTestProject,
  createTestTask,
} from '../helpers/integration-helpers.js';
import { deleteAllAgentApiKeysForUser } from '../helpers/agent-api-key-cleanup.js';

describe('Agent docs/doc-links/summary endpoints', () => {
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

  async function createAgentWithDelegation(projectId: number): Promise<{ rawKey: string }> {
    const createAgent = await request(testApp)
      .post('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'DocsAgent', description: 'integration' });

    expect(createAgent.status).toBe(201);
    const agentId = createAgent.body.agent.id as string;
    const rawKey = createAgent.body.apiKey as string;

    await request(testApp)
      .post(`/api/agents/${agentId}/delegations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, permissionLevel: 'VIEWER' });

    return { rawKey };
  }

  describe('GET /api/agent/projects/summary', () => {
    it('returns 401 without credentials', async () => {
      const res = await request(testApp).get('/api/agent/projects/summary');
      expect(res.status).toBe(401);
    });

    it('returns summaries for user projects', async () => {
      const project = await createTestProject(userId, { name: 'Summary Test', prefix: 'ST1' });
      const res = await request(testApp)
        .get('/api/agent/projects/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.projects)).toBe(true);
      const summaries = res.body.projects as Array<{ id: number; name: string; totalTasks: number }>;
      const summary = summaries.find((s) => s.id === project.id);
      expect(summary).toBeDefined();
      expect(summary.name).toBe('Summary Test');
    });

    it('returns summaries for delegated agent projects', async () => {
      const project = await createTestProject(userId, { name: 'Agent Summary', prefix: 'AGS' });
      const { rawKey } = await createAgentWithDelegation(project.id);

      const res = await request(testApp)
        .get('/api/agent/projects/summary')
        .set('x-agent-api-key', rawKey);

      expect(res.status).toBe(200);
      const summaries = res.body.projects as Array<{ id: number; formalityLevel: string; totalTasks: number }>;
      const summary = summaries.find((s) => s.id === project.id);
      expect(summary).toBeDefined();
      expect(summary.formalityLevel).toBeDefined();
      expect(typeof summary.totalTasks).toBe('number');
    });

    it('filters summaries by projectId query param', async () => {
      const project = await createTestProject(userId, { name: 'Filtered Summary', prefix: 'FSM' });
      await createTestProject(userId, { name: 'Other Summary', prefix: 'OTH' });

      const res = await request(testApp)
        .get(`/api/agent/projects/summary?projectId=${project.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const summaries = res.body.projects as Array<{ id: number }>;
      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe(project.id);
    });
  });

  describe('GET /api/agent/projects/:projectId/docs', () => {
    it('returns 401 without credentials', async () => {
      const res = await request(testApp).get('/api/agent/projects/1/docs');
      expect(res.status).toBe(401);
    });

    it('returns 403 when agent has no delegation', async () => {
      const project = await createTestProject(userId, { name: 'No Access Docs', prefix: 'NAD' });
      const { rawKey } = await createAgentWithDelegation(project.id + 9999);

      const res = await request(testApp)
        .get(`/api/agent/projects/${project.id}/docs`)
        .set('x-agent-api-key', rawKey);

      expect(res.status).toBe(403);
    });

    it('returns documents for delegated project', async () => {
      const project = await createTestProject(userId, { name: 'Docs Project', prefix: 'DPR' });
      const { rawKey } = await createAgentWithDelegation(project.id);

      const doc = await testPrisma.projectDocument.create({
        data: {
          projectId: project.id,
          title: 'Test Doc',
          content: 'Test content',
          docType: 'SPECIFICATION',
          createdById: userId,
        },
      });

      const res = await request(testApp)
        .get(`/api/agent/projects/${project.id}/docs`)
        .set('x-agent-api-key', rawKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((d: any) => d.id === doc.id)).toBe(true);
    });
  });

  describe('GET /api/agent/projects/:projectId/tasks/:taskId/doc-links', () => {
    it('returns 401 without credentials', async () => {
      const res = await request(testApp).get('/api/agent/projects/1/tasks/1/doc-links');
      expect(res.status).toBe(401);
    });

    it('returns doc links for delegated project task', async () => {
      const project = await createTestProject(userId, { name: 'Links Project', prefix: 'LPR' });
      const { rawKey } = await createAgentWithDelegation(project.id);

      const column = await testPrisma.projectColumn.create({
        data: { projectId: project.id, name: 'To Do', order: 1 },
      });
      const task = await createTestTask(project.id, userId, 'LPR', { projectColumnId: column.id });
      const doc = await testPrisma.projectDocument.create({
        data: {
          projectId: project.id,
          title: 'Linked Doc',
          content: 'Content',
          docType: 'SPECIFICATION',
          createdById: userId,
        },
      });
      const link = await testPrisma.taskDocumentLink.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          documentId: doc.id,
          role: 'REFERENCE',
          createdBy: userId,
        },
      });

      const res = await request(testApp)
        .get(`/api/agent/projects/${project.id}/tasks/${task.id}/doc-links`)
        .set('x-agent-api-key', rawKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((l: any) => l.id === link.id)).toBe(true);
    });
  });
});
