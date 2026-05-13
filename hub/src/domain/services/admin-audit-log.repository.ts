/**
 * AdminAuditLog access via raw SQL so it works even when the Prisma client
 * singleton was created from an older generated client (missing `adminAuditLog` delegate).
 */
import type { PrismaClient } from '../../../prisma/generated/prisma/client.js';

export type AdminAuditLogListRow = {
  id: number;
  createdAt: Date;
  actorUserId: number;
  action: string;
  targetUserId: number | null;
  metadata: unknown;
};

export async function insertAdminAuditLogEntry(
  db: PrismaClient,
  entry: {
    actorUserId: number;
    action: string;
    targetUserId: number | null;
    metadata: unknown;
  },
): Promise<void> {
  await db.$executeRawUnsafe(
    `INSERT INTO "AdminAuditLog" ("actorUserId", "action", "targetUserId", "metadata")
     VALUES ($1, $2, $3, $4::jsonb)`,
    entry.actorUserId,
    entry.action,
    entry.targetUserId,
    JSON.stringify(entry.metadata ?? null),
  );
}

export async function listAdminAuditLogEntries(
  db: PrismaClient,
  limit: number,
  offset: number,
): Promise<{ rows: AdminAuditLogListRow[]; total: number }> {
  const rows = await db.$queryRawUnsafe<AdminAuditLogListRow[]>(
    `SELECT id, "createdAt", "actorUserId", action, "targetUserId", metadata
     FROM "AdminAuditLog"
     ORDER BY "createdAt" DESC
     LIMIT $1 OFFSET $2`,
    limit,
    offset,
  );
  const countResult = await db.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*)::bigint AS c FROM "AdminAuditLog"`,
  );
  const total = Number(countResult[0]?.c ?? 0);
  return { rows, total };
}
