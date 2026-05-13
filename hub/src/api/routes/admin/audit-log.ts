import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/auth/index.js';
import { requireAdmin } from '../../../infrastructure/http/middleware/auth.js';
import { validateQuery, getValidatedQuery } from '../../../infrastructure/http/validation.js';
import { listAdminAuditLogEntries } from '../../../domain/services/admin-audit-log.repository.js';
import { asyncHandler, BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';

const router = Router();
router.use(requireAdmin);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

router.get('/', validateQuery(listQuerySchema), asyncHandler(async (req, res) => {
  const q = getValidatedQuery<{ limit: number; offset: number }>(req);
  if (!q) {
    throw new BadRequestError('Invalid query');
  }
  const { limit, offset } = q;

  const { rows: items, total } = await listAdminAuditLogEntries(prisma, limit, offset);

  return res.json({
    data: items.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    })),
    pagination: { total, limit, offset },
  });
}));

export default router;
