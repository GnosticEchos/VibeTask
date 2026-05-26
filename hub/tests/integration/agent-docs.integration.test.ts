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

    it('returns scoped counts for main and all task scopes', async () => {
      const project = await createTestProject(userId, { name: 'Scoped Summary', prefix: 'SCP' });
      const todo = await testPrisma.projectColumn.create({
        data: { projectId: project.id, name: 'To Do', order: 1 },
      });
      const done = await testPrisma.projectColumn.create({
        data: { projectId: project.id, name: 'Done', order: 2 },
      });

      const container = await createTestTask(project.id, userId, 'SCP', { projectColumnId: todo.id });
      await testPrisma.task.update({
        where: { id: container.id },
        data: { isContainer: true },
      });

      await createTestTask(project.id, userId, 'SCP', { projectColumnId: todo.id });
      const workspaceChild = await createTestTask(project.id, userId, 'SCP', { projectColumnId: done.id });
      await testPrisma.task.update({
        where: { id: workspaceChild.id },
        data: { parentId: container.id },
      });

      const mainRes = await request(testApp)
        .get('/api/agent/projects/summary?scope=main&projectId=' + project.id)
        .set('Authorization', `Bearer ${token}`);

      expect(mainRes.status).toBe(200);
      const mainProject = (mainRes.body.projects as Array<any>)[0];
      expect(mainProject.totalTasks).toBe(3);
      expect(mainProject.mainBoardTasks).toBe(2);
      expect(mainProject.workspaceContainers).toBe(1);
      expect(mainProject.workspaceChildTasks).toBe(1);
      expect(mainProject.summaryLine).toContain('on main board');

      const mainTodo = mainProject.columns.find((c: any) => c.id === todo.id);
      const mainDone = mainProject.columns.find((c: any) => c.id === done.id);
      expect(mainTodo.taskCountMain).toBe(2);
      expect(mainTodo.taskCountAll).toBe(2);
      expect(mainTodo.taskCount).toBe(2);
      expect(mainDone.taskCountMain).toBe(0);
      expect(mainDone.taskCountAll).toBe(1);
      expect(mainDone.taskCount).toBe(0);

      const allRes = await request(testApp)
        .get('/api/agent/projects/summary?scope=all&projectId=' + project.id)
        .set('Authorization', `Bearer ${token}`);

      expect(allRes.status).toBe(200);
      const allProject = (allRes.body.projects as Array<any>)[0];
      const allDone = allProject.columns.find((c: any) => c.id === done.id);
      expect(allProject.totalTasks).toBe(3);
      expect(allProject.mainBoardTasks).toBe(2);
      expect(allDone.taskCountMain).toBe(0);
      expect(allDone.taskCountAll).toBe(1);
      expect(allDone.taskCount).toBe(1);
    });

    it('supports include buckets for documents, agent review, blocked, help requests, and workspaces', async () => {
      const project = await createTestProject(userId, { name: 'Include Summary', prefix: 'INC' });
      const todo = await testPrisma.projectColumn.create({
        data: { projectId: project.id, name: 'To Do', order: 1 },
      });
      const review = await testPrisma.projectColumn.create({
        data: { projectId: project.id, name: 'Agent Review', order: 2, roleType: 'AGENT_REVIEW' },
      });

      const container = await createTestTask(project.id, userId, 'INC', { projectColumnId: todo.id });
      await testPrisma.task.update({
        where: { id: container.id },
        data: { isContainer: true },
      });
      const child = await createTestTask(project.id, userId, 'INC', { projectColumnId: todo.id });
      await testPrisma.task.update({
        where: { id: child.id },
        data: { parentId: container.id },
      });
      const blocked = await createTestTask(project.id, userId, 'INC', { projectColumnId: todo.id });
      await testPrisma.task.update({
        where: { id: blocked.id },
        data: { relationMode: 'blocked-by', relationId: child.id },
      });
      await createTestTask(project.id, userId, 'INC', { projectColumnId: review.id });

      await testPrisma.projectDocument.create({
        data: {
          projectId: project.id,
          title: 'Spec Doc',
          content: 'Spec content',
          docType: 'SPECIFICATION',
          createdById: userId,
        },
      });
      await testPrisma.projectDocument.create({
        data: {
          projectId: project.id,
          title: 'Plan Doc',
          content: 'Plan content',
          docType: 'IMPLEMENTATION_PLAN',
          createdById: userId,
        },
      });

      await testPrisma.taskComment.create({
        data: {
          taskId: blocked.id,
          userId,
          content: '🆘 **Help Request (TECHNICAL)**\nNeed review',
        },
      });

      const res = await request(testApp)
        .get(`/api/agent/projects/summary?projectId=${project.id}&include=documents,agentReview,helpRequests,blocked,workspaces`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const summary = (res.body.projects as Array<any>)[0];
      expect(summary.documents.total).toBe(2);
      expect(summary.documents.byType.SPECIFICATION).toBe(1);
      expect(summary.documents.byType.IMPLEMENTATION_PLAN).toBe(1);
      expect(summary.agentReview.taskCount).toBe(1);
      expect(summary.agentReview.identifiers.length).toBeGreaterThan(0);
      expect(summary.helpRequests.open).toBe(1);
      expect(summary.blocked.taskCount).toBe(1);
      expect(summary.workspaces.activeCount).toBe(1);
      expect(summary.workspaces.items).toHaveLength(1);
      expect(summary.workspaces.items[0].childCount).toBe(1);
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
