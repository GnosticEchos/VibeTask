import { Request, Response, NextFunction } from 'express';
import { verifyPlatformSession } from '../../../infrastructure/auth/platform-session.js';
import { prisma } from '../../../infrastructure/auth/prisma.js';

const PLATFORM_SESSION_HEADER = 'x-platform-session';

declare global {
  namespace Express {
    interface Request {
      platformSession?: { apiKeyId: string; targetUserId: number };
    }
  }
}

export async function requirePlatformSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  const auth = (req as any).auth;

  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (auth.type !== 'agent') {
    return next();
  }

  if (req.method === 'GET') {
    return next();
  }

  const headerVal = req.headers[PLATFORM_SESSION_HEADER];
  const token = Array.isArray(headerVal) ? headerVal[0] : headerVal;

  const agentName = auth.agent?.name || 'unknown';
  const methodPath = `${req.method} ${req.originalUrl || req.path}`;

  if (!token) {
    console.log(`[PlatformSession] BLOCKED ${methodPath} by agent "${agentName}": no x-platform-session header`);
    return res.status(403).json({
      error: 'Platform session required',
      detail: 'Send x-platform-session JWT obtained from POST /api/agent/session',
    });
  }

  const payload = verifyPlatformSession(token);
  if (!payload) {
    console.log(`[PlatformSession] BLOCKED ${methodPath} by agent "${agentName}": JWT invalid/expired`);
    return res.status(403).json({
      error: 'Platform session invalid or expired',
      detail: 'Reauthenticate your platform agent via POST /api/agent/session',
    });
  }

  const platformKey = await prisma.apikey.findUnique({
    where: { id: payload.sub },
    select: { enabled: true, expiresAt: true, metadata: true },
  });

  if (!platformKey || !platformKey.enabled) {
    console.log(`[PlatformSession] BLOCKED ${methodPath} by agent "${agentName}": platform agent ${payload.sub} disabled`);
    return res.status(403).json({
      error: 'Platform agent revoked or disabled',
    });
  }

  if (platformKey.expiresAt && platformKey.expiresAt <= new Date()) {
    console.log(`[PlatformSession] BLOCKED ${methodPath} by agent "${agentName}": platform agent ${payload.sub} key expired`);
    return res.status(403).json({
      error: 'Platform agent key has expired',
    });
  }

  console.log(`[PlatformSession] ALLOWED ${methodPath} by agent "${agentName}" via platform session ${payload.sub}`);
  res.setHeader('X-Platform-Session-Status', 'valid');

  req.platformSession = {
    apiKeyId: payload.sub,
    targetUserId: payload.targetUserId,
  };

  next();
}
