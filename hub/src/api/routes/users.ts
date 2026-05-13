import { Router } from 'express';
import { z } from 'zod';
import { auth, prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { sanitize } from '../../infrastructure/http/middleware/sanitize.js';
import { asyncHandler } from '../../infrastructure/http/middleware/error-handler.js';
import { getValidatedBody, getValidatedParams, validateBody, validateParams } from '../../infrastructure/http/validation.js';
import { UserRole } from '../../infrastructure/auth/prisma.js';
import {
  parseSettingsLayoutPayload,
  SettingsLayoutValidationError,
} from '../../domain/services/settings-layout.service.js';
import {
  deleteSettingsLayout,
  findSettingsLayoutPayload,
  upsertSettingsLayoutPayload,
} from '../../domain/services/settings-layout.repository.js';
import {
  applyPreferencesPatch,
  getOrCreatePreferences,
  mapPreferencesResponse,
} from '../../domain/services/user-preference.service.js';
import { getBroadcaster } from '../../infrastructure/websocket/broadcaster.js';

const router = Router();

function emitSettingsLayoutWs(userId: number, layout: unknown | null) {
  try {
    getBroadcaster().notifySettingsLayoutUpdated(userId, layout);
  } catch {
    /* Broadcaster not initialized (e.g. tests without WS) */
  }
}

interface UserPermissions {
  isAdmin: boolean;
  canManageRateLimits: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

function computePermissions(role: UserRole | null): UserPermissions {
  const isAdmin = role === UserRole.ADMIN;
  return {
    isAdmin,
    canManageRateLimits: isAdmin,
    canManageUsers: isAdmin,
    canManageSystem: isAdmin,
  };
}

function mapUserToResponse(user: { id: number; name: string | null; email: string; avatarUrl: string | null; image: string | null }, role: UserRole | null) {
  return {
    id: user.id,
    name: user.name || '',
    fullName: user.name || '',
    email: user.email,
    avatarUrl: user.avatarUrl || user.image || null,
    role: role || UserRole.USER,
    permissions: computePermissions(role),
  };
}

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  avatarUrl: z.string().trim().url().nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const preferencesSchema = z.object({
  locale: z.string().trim().min(2).max(10).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  emailNotifications: z.object({
    taskAssigned: z.boolean().optional(),
    taskCommented: z.boolean().optional(),
    dailyDigest: z.boolean().optional(),
  }).optional(),
});

const sessionIdParamSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

function getTokenFromRequest(req: any): string | null {
  return req.headers.authorization?.replace('Bearer ', '') || null;
}

const settingsLayoutPutSchema = z.object({
  layout: z.unknown(),
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, avatarUrl: true, image: true, role: true },
  });

  if (!userRecord) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user: mapUserToResponse(userRecord, userRecord.role) });
}));

router.patch('/me', requireAuth, validateBody(updateMeSchema), sanitize(['name', 'avatarUrl']), asyncHandler(async (req, res) => {
  const user = req.user!;
  const body = getValidatedBody<{ name: string; avatarUrl?: string | null }>(req);
  if (!body) {
    return res.status(400).json({ error: 'Missing or invalid body' });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name.trim(),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
    },
    select: { id: true, name: true, email: true, avatarUrl: true, image: true, role: true },
  });

  return res.json({ user: mapUserToResponse(updated, updated.role) });
}));

router.post('/me/password', requireAuth, validateBody(changePasswordSchema), asyncHandler(async (req, res) => {
  const body = getValidatedBody<{ currentPassword: string; newPassword: string }>(req);
  if (!body) {
    return res.status(400).json({ error: 'Missing or invalid body' });
  }

  const changePassword = (auth.api as Record<string, unknown>).changePassword;
  if (typeof changePassword !== 'function') {
    return res.status(501).json({ error: 'Password change is not available' });
  }

  try {
    await (changePassword as (args: { body: { currentPassword: string; newPassword: string }; headers: Record<string, string> }) => Promise<unknown>)({
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      },
      headers: req.headers as Record<string, string>,
    });
    return res.status(204).send();
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Unable to change password';
    const status = /invalid|incorrect|current password/i.test(message) ? 401 : 400;
    return res.status(status).json({ error: message });
  }
}));

router.get('/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const row = await getOrCreatePreferences(user.id);
  return res.json({ preferences: mapPreferencesResponse(row) });
}));

router.patch('/me/preferences', requireAuth, validateBody(preferencesSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const body = getValidatedBody<{
    locale?: string;
    timezone?: string;
    emailNotifications?: {
      taskAssigned?: boolean;
      taskCommented?: boolean;
      dailyDigest?: boolean;
    };
  }>(req);
  if (!body) {
    return res.status(400).json({ error: 'Missing or invalid body' });
  }

  await applyPreferencesPatch(user.id, body);

  const row = await getOrCreatePreferences(user.id);
  return res.json({ preferences: mapPreferencesResponse(row) });
}));

router.get('/me/settings-layout', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const payload = await findSettingsLayoutPayload(user.id);
  if (payload == null) {
    return res.json({ layout: null });
  }
  return res.json({ layout: payload });
}));

router.put('/me/settings-layout', requireAuth, validateBody(settingsLayoutPutSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const body = getValidatedBody<{ layout: unknown }>(req);
  if (!body) {
    return res.status(400).json({ error: 'Missing or invalid body' });
  }
  let normalized;
  try {
    normalized = parseSettingsLayoutPayload(body.layout, user.id);
  } catch (e) {
    if (e instanceof SettingsLayoutValidationError) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }

  await upsertSettingsLayoutPayload(user.id, normalized);

  emitSettingsLayoutWs(user.id, normalized);

  return res.json({ layout: normalized });
}));

router.delete('/me/settings-layout', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  await deleteSettingsLayout(user.id);
  emitSettingsLayoutWs(user.id, null);
  return res.status(204).send();
}));

router.get('/me/sessions', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const currentToken = getTokenFromRequest(req);
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      userId: user.id,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return res.json({
    sessions: sessions.map((session) => ({
      id: String(session.id),
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.updatedAt.toISOString(),
      ip: session.ipAddress || null,
      userAgent: session.userAgent || null,
      isCurrent: Boolean(currentToken && session.token === currentToken),
    })),
  });
}));

router.get('/me/sessions/:sessionId', requireAuth, validateParams(sessionIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ sessionId: number }>(req);
  if (!params) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  const currentToken = getTokenFromRequest(req);
  const session = await prisma.session.findFirst({
    where: {
      id: params.sessionId,
      userId: user.id,
    },
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.json({
    session: {
      id: String(session.id),
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      ip: session.ipAddress || null,
      userAgent: session.userAgent || null,
      isCurrent: Boolean(currentToken && session.token === currentToken),
      isExpired: session.expiresAt <= new Date(),
    },
  });
}));

router.delete('/me/sessions/:sessionId', requireAuth, validateParams(sessionIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;
  const params = getValidatedParams<{ sessionId: number }>(req);
  if (!params) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  const deletion = await prisma.session.deleteMany({
    where: {
      id: params.sessionId,
      userId: user.id,
    },
  });

  if (deletion.count === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.status(204).send();
}));

router.post('/me/sessions/revoke-others', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const currentToken = getTokenFromRequest(req);
  if (!currentToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await prisma.session.deleteMany({
    where: {
      userId: user.id,
      token: {
        not: currentToken,
      },
    },
  });

  return res.status(204).send();
}));

export default router;
