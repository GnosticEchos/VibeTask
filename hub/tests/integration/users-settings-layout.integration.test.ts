/**
 * GET/PUT/DELETE /api/users/me/settings-layout
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { authenticateExistingUser } from '../helpers/integration-helpers.js';

describe('User settings layout API', () => {
  it('GET returns null then PUT round-trips', async () => {
    const { token, user } = await authenticateExistingUser();

    // Same DB as dev: clear any persisted layout so this test is not order- or manual-UI-dependent.
    await request(testApp)
      .delete('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`);

    const empty = await request(testApp)
      .get('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.layout).toBeNull();

    const layout = {
      version: 1 as const,
      userId: String(user.id),
      lastUpdatedAt: new Date().toISOString(),
      pages: {
        account: {
          grid: { columns: 12 },
          cards: [{ id: 'account.profile', x: 0, y: 0, w: 6, h: 5 }],
        },
      },
    };

    const put = await request(testApp)
      .put('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({ layout });
    expect(put.status).toBe(200);
    expect(put.body.layout).toMatchObject({
      version: 1,
      userId: String(user.id),
      pages: layout.pages,
    });

    const again = await request(testApp)
      .get('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(200);
    expect(again.body.layout).toMatchObject({
      version: 1,
      userId: String(user.id),
      pages: layout.pages,
    });

    const del = await request(testApp)
      .delete('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const cleared = await request(testApp)
      .get('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.layout).toBeNull();
  });

  it('PUT rejects unknown card id', async () => {
    const { token, user } = await authenticateExistingUser();
    const res = await request(testApp)
      .put('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        layout: {
          version: 1,
          userId: String(user.id),
          lastUpdatedAt: new Date().toISOString(),
          pages: {
            account: {
              grid: { columns: 12 },
              cards: [{ id: 'bogus.card', x: 0, y: 0, w: 6, h: 5 }],
            },
          },
        },
      });
    expect(res.status).toBe(400);
  });

  it('PUT accepts admin hub cards (allowlist parity with SPA)', async () => {
    const { token, user } = await authenticateExistingUser();
    await request(testApp)
      .delete('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(testApp)
      .put('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        layout: {
          version: 1,
          userId: String(user.id),
          lastUpdatedAt: new Date().toISOString(),
          pages: {
            admin: {
              grid: { columns: 12 },
              cards: [
                { id: 'admin.users', x: 0, y: 0, w: 8, h: 7 },
                { id: 'admin.systemHealth', x: 8, y: 0, w: 4, h: 4 },
                { id: 'admin.roadmapSecurity', x: 0, y: 7, w: 4, h: 5 },
              ],
            },
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.layout?.pages?.admin?.cards).toHaveLength(3);
  });

  it('PUT rejects w/h outside SETTINGS_CARD_CONSTRAINTS', async () => {
    const { token, user } = await authenticateExistingUser();
    const res = await request(testApp)
      .put('/api/users/me/settings-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        layout: {
          version: 1,
          userId: String(user.id),
          lastUpdatedAt: new Date().toISOString(),
          pages: {
            agents: {
              grid: { columns: 12 },
              cards: [{ id: 'agents.list', x: 0, y: 0, w: 3, h: 6 }],
            },
          },
        },
      });
    expect(res.status).toBe(400);
    expect(String(res.body?.error || '')).toMatch(/w must be between/i);
  });
});
