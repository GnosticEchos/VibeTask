import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { testApp, prisma } from './setup/test-server.js';
import { connectTestDatabase, disconnectTestDatabase } from './setup/test-db.js';
import {
  authenticateUser,
  createTestUser,
} from '../helpers/integration-helpers.js';
import { EXISTING_USER } from './setup/fixtures.js';

describe('Admin actions (temporary password, audit, health)', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('POST /api/admin/users/:id/temporary-password issues password and target can login; audit row created', async () => {
    const { token: adminToken } = await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
    const victim = await createTestUser({ name: 'TempPwdVictim' });

    const oldLogin = await authenticateUser(victim.email, 'TestPass123!');
    expect(oldLogin.token).toBeTruthy();

    const issue = await request(testApp)
      .post(`/api/admin/users/${victim.id}/temporary-password`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(issue.status).toBe(200);
    expect(issue.body.temporaryPassword).toBeTruthy();
    expect(typeof issue.body.temporaryPassword).toBe('string');
    expect(issue.body.user?.id).toBe(victim.id);
    expect(issue.body.message).toBeTruthy();

    const newLogin = await authenticateUser(victim.email, issue.body.temporaryPassword);
    expect(newLogin.token).toBeTruthy();

    const audit = await prisma.adminAuditLog.findFirst({
      where: { action: 'ISSUE_TEMPORARY_PASSWORD', targetUserId: victim.id },
      orderBy: { id: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect(audit?.actorUserId).toBeGreaterThan(0);
  });

  it('POST temporary-password returns 403 when targeting self', async () => {
    const { token: adminToken, user } = await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
    const res = await request(testApp)
      .post(`/api/admin/users/${user.id}/temporary-password`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/admin/audit-log returns data for admin', async () => {
    const { token: adminToken } = await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
    const res = await request(testApp)
      .get('/api/admin/audit-log?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination?.total).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/admin/health returns services shape', async () => {
    const { token: adminToken } = await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);
    const res = await request(testApp)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.services?.database?.status).toBe('ok');
    expect(res.body.services?.websocket).toBeTruthy();
  });
});
