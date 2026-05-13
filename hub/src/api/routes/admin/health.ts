import { Router } from 'express';
import { prisma } from '../../../infrastructure/auth/index.js';
import { requireAdmin } from '../../../infrastructure/http/middleware/auth.js';
import { runSystemHealthCheck } from '../../../infrastructure/http/system-health.js';
import { getSocketIOServer } from '../../../infrastructure/websocket/io-registry.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (req, res) => {
  const io = getSocketIOServer();
  const ws = io
    ? { server: io, port: parseInt(process.env.WS_PORT || '8080', 10) }
    : null;
  const { body, statusCode } = await runSystemHealthCheck(prisma, ws);
  res.status(statusCode).json(body);
});

export default router;
