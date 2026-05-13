/**
 * Persistence for UserSettingsLayout (Prisma delegate).
 */
import type { Prisma } from '../../../prisma/generated/prisma/client.js';
import { prisma } from '../../infrastructure/auth/index.js';

export async function findSettingsLayoutPayload(userId: number): Promise<unknown | null> {
  const row = await prisma.userSettingsLayout.findUnique({
    where: { userId },
    select: { payload: true },
  });
  return row?.payload ?? null;
}

export async function upsertSettingsLayoutPayload(userId: number, payload: object): Promise<void> {
  const data = payload as Prisma.InputJsonValue;
  await prisma.userSettingsLayout.upsert({
    where: { userId },
    create: { userId, payload: data },
    update: { payload: data },
  });
}

export async function deleteSettingsLayout(userId: number): Promise<void> {
  await prisma.userSettingsLayout.deleteMany({ where: { userId } });
}
