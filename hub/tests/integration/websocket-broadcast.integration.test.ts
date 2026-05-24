import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { initializeBroadcaster } from '@/infrastructure/websocket/broadcaster.js';
import { getRoomName, CHANNELS } from '@/infrastructure/websocket/channels.js';
import { cleanupTestData, createTestColumn, createTestProjectDirect, createTestTaskDirect, createTestUser } from '../helpers/integration-helpers.js';

describe('WebSocket broadcaster integration', () => {
  let httpServer: HttpServer;
  let ioServer: Server;
  let client: ClientSocket;
  let wsPort = 0;

  beforeEach(async () => {
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: { origin: '*' },
    });

    ioServer.on('connection', (socket) => {
      const rawUserId = socket.handshake.query.userId;
      socket.data.user = { id: Number(rawUserId) };

      socket.on('subscribe', ({ channel, params }) => {
        socket.join(getRoomName(channel, params ?? {}));
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    wsPort = Number((httpServer.address() as any).port);
    initializeBroadcaster(ioServer);
  });

  afterEach(async () => {
    if (client?.connected) client.disconnect();
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupTestData();
  });

  it('delivers task update to subscribed project member', async () => {
    const user = await createTestUser({ name: 'WsMember' });
    const project = await createTestProjectDirect(user.id, { name: 'WS Project', prefix: 'WSP' });
    const column = await createTestColumn(project.id, 1, { name: 'Todo' });
    const task = await createTestTaskDirect(project.id, user.id, column.id, { name: 'WS Task', description: 'Before' });

    client = clientIo(`http://127.0.0.1:${wsPort}`, {
      transports: ['websocket'],
      query: { userId: String(user.id) },
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });

    client.emit('subscribe', {
      channel: CHANNELS.TASKS_INDEX,
      params: { projectId: project.id },
    });

    const received = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket message')), 3000);
      client.on('message', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    const updatedDescription = 'After move/update';
    const payload = {
      table: 'Task',
      action: 'UPDATE',
      id: task.id,
      projectId: project.id,
      data: {
        ...task,
        projectColumnId: column.id,
        description: updatedDescription,
      },
    } as any;

    const broadcaster = initializeBroadcaster(ioServer);
    await broadcaster.broadcastDatabaseEvent(payload);

    const message = await received;
    expect(message?.identifier?.channel).toBe(CHANNELS.TASKS_INDEX);
    expect(message?.message?.actionType).toBe('update');
    expect(message?.message?.data?.id).toBe(task.id);
    expect(message?.message?.data?.description).toBe(updatedDescription);
  });
});

