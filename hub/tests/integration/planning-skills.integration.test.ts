/**
 * Planning skills — admin platform + project override integration tests
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { connectTestDatabase, disconnectTestDatabase, testPrisma } from './setup/test-db.js';
import {
  authenticateUser,
  authenticateExistingUser,
  createTestProject,
  createTestUser,
  addProjectMember,
  cleanupTestData,
  ensureCiBootstrapExistingUser,
} from '../helpers/integration-helpers.js';
import { EXISTING_USER } from './setup/fixtures.js';

const SKILL_SLUG = 'project-planning-grill';

async function resetPlatformSkill(slug: string): Promise<void> {
  await testPrisma.planningSkillRevision.deleteMany({
    where: { skill: { slug } },
  });
  await testPrisma.planningSkill.deleteMany({ where: { slug } });
}

describe('Planning skills integration', () => {
  beforeAll(async () => {
    await connectTestDatabase();
    await ensureCiBootstrapExistingUser();
  });

  afterEach(async () => {
    await testPrisma.projectPlanningSkillOverride.deleteMany({});
    await resetPlatformSkill(SKILL_SLUG);
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe('Admin /api/admin/planning-skills', () => {
    it('returns 403 for non-admin user', async () => {
      const user = await createTestUser({ name: 'SkillNonAdmin' });
      const { token } = await authenticateUser(user.email, 'TestPass123!', { retries: 3 });

      const res = await request(testApp)
        .get('/api/admin/planning-skills')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('syncs from filesystem, lists, upserts, lists revisions, and reverts', async () => {
      const { token: adminToken } = await authenticateUser(
        EXISTING_USER.email,
        EXISTING_USER.password,
      );

      const syncRes = await request(testApp)
        .post('/api/admin/planning-skills/sync')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(syncRes.status).toBe(200);
      expect(syncRes.body.synced).toBeGreaterThanOrEqual(1);

      const listRes = await request(testApp)
        .get('/api/admin/planning-skills')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.skills.some((s: { slug: string }) => s.slug === SKILL_SLUG)).toBe(true);

      const getRes = await request(testApp)
        .get(`/api/admin/planning-skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.slug).toBe(SKILL_SLUG);
      expect(getRes.body.content).toContain('Project planning grill');

      const v1 = '# Test skill v1\n\nOne question per turn.\n';
      const putV1 = await request(testApp)
        .put(`/api/admin/planning-skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: v1 });
      expect(putV1.status).toBe(200);
      expect(putV1.body.skill.content).toBe(v1);

      const v2 = '# Test skill v2\n\nUpdated copy.\n';
      const putV2 = await request(testApp)
        .put(`/api/admin/planning-skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: v2 });
      expect(putV2.status).toBe(200);

      const revisionsRes = await request(testApp)
        .get(`/api/admin/planning-skills/${SKILL_SLUG}/revisions`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(revisionsRes.status).toBe(200);
      expect(revisionsRes.body.revisions.length).toBeGreaterThanOrEqual(2);

      const v1Revision = revisionsRes.body.revisions.find(
        (r: { content: string }) => r.content === v1,
      );
      expect(v1Revision).toBeTruthy();

      const revertRes = await request(testApp)
        .post(`/api/admin/planning-skills/${SKILL_SLUG}/revert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ revisionId: v1Revision.id });
      expect(revertRes.status).toBe(200);
      expect(revertRes.body.skill.content).toBe(v1);
    });

    it('returns catalog with filesystem source and rejects unknown slug on PUT', async () => {
      const { token: adminToken } = await authenticateUser(
        EXISTING_USER.email,
        EXISTING_USER.password,
      );

      const catalogRes = await request(testApp)
        .get('/api/admin/planning-skills/catalog')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(catalogRes.status).toBe(200);
      const grill = catalogRes.body.catalog.find((e: { slug: string }) => e.slug === SKILL_SLUG);
      expect(grill).toBeTruthy();
      expect(['filesystem', 'both']).toContain(grill.source);

      const unknownPut = await request(testApp)
        .put('/api/admin/planning-skills/not-in-catalog')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: '# Orphan\n' });
      expect(unknownPut.status).toBe(400);
      expect(unknownPut.body.message ?? unknownPut.body.error).toMatch(/catalog/i);
    });
  });

  describe('Project /api/projects/:projectId/planning/skills', () => {
    it('returns platform content then project override on GET', async () => {
      const { token: adminToken } = await authenticateUser(
        EXISTING_USER.email,
        EXISTING_USER.password,
      );
      await request(testApp)
        .post('/api/admin/planning-skills/sync')
        .set('Authorization', `Bearer ${adminToken}`);

      const platformContent = '# Platform default\n';
      await request(testApp)
        .put(`/api/admin/planning-skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: platformContent });

      const auth = await authenticateExistingUser();
      const userId = parseInt(auth.user.id as string, 10);
      const project = await createTestProject(userId, { bare: true });

      const beforeOverride = await request(testApp)
        .get(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${auth.token}`);
      expect(beforeOverride.status).toBe(200);
      expect(beforeOverride.body.content).toBe(platformContent);

      const overrideContent = '# Project override\n';
      const putOverride = await request(testApp)
        .put(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ content: overrideContent });
      expect(putOverride.status).toBe(200);
      expect(putOverride.body.override.content).toBe(overrideContent);

      const afterOverride = await request(testApp)
        .get(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${auth.token}`);
      expect(afterOverride.status).toBe(200);
      expect(afterOverride.body.content).toBe(overrideContent);

      const adminGet = await request(testApp)
        .get(`/api/admin/planning-skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminGet.body.content).toBe(platformContent);
    });

    it('returns 403 when Viewer tries to upsert override', async () => {
      const ownerAuth = await authenticateExistingUser();
      const ownerId = parseInt(ownerAuth.user.id as string, 10);
      const project = await createTestProject(ownerId, { bare: true });

      const viewer = await createTestUser({ name: 'SkillViewer' });
      await addProjectMember(viewer.id, project.id, 'Viewer');

      const viewerAuth = await authenticateUser(viewer.email, 'TestPass123!', { retries: 3 });
      const res = await request(testApp)
        .put(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${viewerAuth.token}`)
        .send({ content: '# Nope\n' });

      expect(res.status).toBe(403);
    });

    it('lists override status, deletes override, and falls back to platform content', async () => {
      const { token: adminToken } = await authenticateUser(
        EXISTING_USER.email,
        EXISTING_USER.password,
      );
      const platformContent = '# Platform for delete test\n';
      await request(testApp)
        .put(`/api/admin/planning-skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: platformContent });

      const auth = await authenticateExistingUser();
      const userId = parseInt(auth.user.id as string, 10);
      const project = await createTestProject(userId, { bare: true });

      const indexBefore = await request(testApp)
        .get(`/api/projects/${project.id}/planning/skills`)
        .set('Authorization', `Bearer ${auth.token}`);
      expect(indexBefore.status).toBe(200);
      const rowBefore = indexBefore.body.skills.find((s: { slug: string }) => s.slug === SKILL_SLUG);
      expect(rowBefore.hasOverride).toBe(false);

      const overrideContent = '# Temporary override\n';
      await request(testApp)
        .put(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ content: overrideContent });

      const indexDuring = await request(testApp)
        .get(`/api/projects/${project.id}/planning/skills`)
        .set('Authorization', `Bearer ${auth.token}`);
      const rowDuring = indexDuring.body.skills.find((s: { slug: string }) => s.slug === SKILL_SLUG);
      expect(rowDuring.hasOverride).toBe(true);
      expect(rowDuring.overrideUpdatedAt).toBeTruthy();

      const deleteRes = await request(testApp)
        .delete(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${auth.token}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.deleted).toBe(true);

      const effective = await request(testApp)
        .get(`/api/projects/${project.id}/planning/skills/${SKILL_SLUG}`)
        .set('Authorization', `Bearer ${auth.token}`);
      expect(effective.body.content).toBe(platformContent);

      const indexAfter = await request(testApp)
        .get(`/api/projects/${project.id}/planning/skills`)
        .set('Authorization', `Bearer ${auth.token}`);
      const rowAfter = indexAfter.body.skills.find((s: { slug: string }) => s.slug === SKILL_SLUG);
      expect(rowAfter.hasOverride).toBe(false);
    });
  });
});
