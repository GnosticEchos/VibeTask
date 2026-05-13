import type { Server } from 'socket.io';
import type { PrismaClient } from '../../../prisma/generated/prisma/client';

type ServiceStatus = {
  status: 'ok' | 'error' | 'unknown';
  message?: string;
  connectedClients?: number;
  port?: number;
};

export type SystemHealthBody = {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceStatus;
    websocket: ServiceStatus;
  };
};

/**
 * Shared health payload for `GET /health` and `GET /api/admin/health`.
 */
export async function runSystemHealthCheck(
  prisma: PrismaClient,
  ws: { server: Server; port: number } | null,
): Promise<{ body: SystemHealthBody; statusCode: number }> {
  const body: SystemHealthBody = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'unknown' },
      websocket: { status: 'unknown' },
    },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    body.services.database = { status: 'ok' };
  } catch {
    body.services.database = { status: 'error', message: 'Database connection failed' };
    body.status = 'degraded';
  }

  if (ws) {
    try {
      const connectedClients = ws.server.sockets.sockets.size;
      body.services.websocket = {
        status: 'ok',
        connectedClients,
        port: ws.port,
      };
    } catch {
      body.services.websocket = { status: 'error', message: 'WebSocket unavailable' };
      body.status = 'degraded';
    }
  } else {
    body.services.websocket = {
      status: 'unknown',
      message: 'WebSocket server not registered in this process',
    };
  }

  const statusCode = body.status === 'ok' ? 200 : 503;
  return { body, statusCode };
}
