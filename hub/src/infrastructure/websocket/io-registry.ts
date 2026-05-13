import type { Server } from 'socket.io';

let socketIoServer: Server | null = null;

export function setSocketIOServer(io: Server): void {
  socketIoServer = io;
}

export function getSocketIOServer(): Server | null {
  return socketIoServer;
}
