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

function readPlatformSessionHeader(req: Request): string | undefined {
  const headerVal = req.headers[PLATFORM_SESSION_HEADER];
  return Array.isArray(headerVal) ? headerVal[0] : headerVal;
}

async function resolvePlatformSession(
  req: Request,
  options: { logPrefix: string; methodPath: string; agentName: string },
): Promise<{ apiKeyId: string; targetUserId: number } | null> {
  const token = readPlatformSessionHeader(req);
  if (!token) {
    return null;
  }

  const payload = verifyPlatformSession(token);
  if (!payload) {
    console.log(
      `[PlatformSession] ${options.logPrefix} ${options.methodPath} by agent "${options.agentName}": JWT invalid/expired`,
    );
    return null;
  }

  const platformKey = await prisma.apikey.findUnique({
    where: { id: payload.sub },
    select: { enabled: true, expiresAt: true, metadata: true },
  });

  if (!platformKey || !platformKey.enabled) {
    console.log(
      `[PlatformSession] ${options.logPrefix} ${options.methodPath} by agent "${options.agentName}": platform agent ${payload.sub} disabled`,
    );
    return null;
  }

  if (platformKey.expiresAt && platformKey.expiresAt <= new Date()) {
    console.log(
      `[PlatformSession] ${options.logPrefix} ${options.methodPath} by agent "${options.agentName}": platform agent ${payload.sub} key expired`,
    );
    return null;
  }

  return {
    apiKeyId: payload.sub,
    targetUserId: payload.targetUserId,
  };
}

/**
 * Parse and attach platform session when present; never blocks the request.
 * Used for read routes where a user-scoped session expands agent visibility (e.g. fleet summary).
 */
export async function attachOptionalPlatformSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = (req as any).auth;
  if (!auth || auth.type !== 'agent' || req.platformSession) {
    return next();
  }

  const agentName = auth.agent?.name || 'unknown';
  const methodPath = `${req.method} ${req.originalUrl || req.path}`;
  const session = await resolvePlatformSession(req, {
    logPrefix: 'ATTACHED',
    methodPath,
    agentName,
  });

  if (session) {
    req.platformSession = session;
  }

  next();
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

  const agentName = auth.agent?.name || 'unknown';
  const methodPath = `${req.method} ${req.originalUrl || req.path}`;

  if (!readPlatformSessionHeader(req)) {
    console.log(`[PlatformSession] BLOCKED ${methodPath} by agent "${agentName}": no x-platform-session header`);
    return res.status(403).json({
      error: 'Platform session required',
      detail: 'Send x-platform-session JWT obtained from POST /api/agent/session',
    });
  }

  const session = await resolvePlatformSession(req, {
    logPrefix: 'BLOCKED',
    methodPath,
    agentName,
  });

  if (!session) {
    return res.status(403).json({
      error: 'Platform session invalid or expired',
      detail: 'Reauthenticate your platform agent via POST /api/agent/session',
    });
  }

  console.log(`[PlatformSession] ALLOWED ${methodPath} by agent "${agentName}" via platform session ${session.apiKeyId}`);
  res.setHeader('X-Platform-Session-Status', 'valid');

  req.platformSession = session;

  next();
}
