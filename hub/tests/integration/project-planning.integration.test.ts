/**
 * Project planning lifecycle integration tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { testPrisma } from './setup/test-db.js';
import {
  authenticateExistingUser,
  cleanupTestData,
  createTestProject,
  generateUniquePrefix,
} from '../helpers/integration-helpers.js';
import { createProjectRecord } from '../../src/services/project-create.js';

describe('Project planning lifecycle', () => {
  let token: string;
  let userId: number;

  beforeEach(async () => {
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = parseInt(auth.user.id as string, 10);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('rejects duplicate prefix on create', async () => {
    const prefix = generateUniquePrefix();
    await createTestProject(userId, { name: 'First', prefix, bare: true });

    const response = await request(testApp)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second', prefix, template: 'ADHOC_OPS' });

    expect(response.status).toBe(409);
  });

  it('persists template roleType on LIFECYCLE_EPIC create', async () => {
    const prefix = generateUniquePrefix();
    const response = await request(testApp)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Epic Template', prefix, template: 'LIFECYCLE_EPIC' });

    expect(response.status).toBe(201);
    const projectId = response.body.id;
    const completeCol = await testPrisma.projectColumn.findFirst({
      where: { projectId, roleType: 'COMPLETE' },
    });
    expect(completeCol).toBeTruthy();
    expect(completeCol?.name).toBe('5. Finalized');
  });

  it('preview, accept, and exclude draft from default list', async () => {
    const prefix = generateUniquePrefix();
    const draft = await createProjectRecord({
      name: 'Draft Planning',
      prefix,
      template: 'ADHOC_OPS',
      columnsSpecified: false,
      lifecycleStatus: 'DRAFT',
      ownerId: userId,
      planningMeta: { source: 'test', templateId: 'ADHOC_OPS' },
    });

    const previewRes = await request(testApp)
      .get(`/api/projects/${draft.id}/planning/preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.lifecycleStatus).toBe('DRAFT');
    expect(previewRes.body.checklist.every((c: { passed: boolean }) => c.passed)).toBe(true);

    const listRes = await request(testApp)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const defaultIds = listRes.body.data.map((p: { id: number }) => p.id);
    expect(defaultIds).not.toContain(draft.id);

    const draftListRes = await request(testApp)
      .get('/api/projects?lifecycleStatus=DRAFT')
      .set('Authorization', `Bearer ${token}`);
    expect(draftListRes.body.data.some((p: { id: number }) => p.id === draft.id)).toBe(true);

    const acceptRes = await request(testApp)
      .post(`/api/projects/${draft.id}/planning/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(acceptRes.status).toBe(200);

    const updated = await testPrisma.project.findUnique({ where: { id: draft.id } });
    expect(updated?.lifecycleStatus).toBe('ACTIVE');
  });

  it('blocks column-assigned tasks on DRAFT projects', async () => {
    const prefix = generateUniquePrefix();
    const draft = await createProjectRecord({
      name: 'Draft Tasks',
      prefix,
      template: 'ADHOC_OPS',
      columnsSpecified: false,
      lifecycleStatus: 'DRAFT',
      ownerId: userId,
    });
    const column = draft.columns[0];

    const backlogOk = await request(testApp)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: draft.id, name: 'Backlog item' });
    expect(backlogOk.status).toBe(201);

    const columnBlocked = await request(testApp)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: draft.id, name: 'Column item', projectColumnId: column.id });
    expect(columnBlocked.status).toBe(400);
  });
});
