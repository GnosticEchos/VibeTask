import { randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../../infrastructure/auth/index.js';
import { insertAdminAuditLogEntry } from './admin-audit-log.repository.js';

const TEMP_PASSWORD_BYTES = 18;

function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = randomBytes(TEMP_PASSWORD_BYTES);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += alphabet[buf[i] % alphabet.length];
  }
  return out;
}

export class AdminTemporaryPasswordError extends Error {
  constructor(
    public readonly code: 'USER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AdminTemporaryPasswordError';
  }
}

/**
 * Sets a random credential password (Better Auth scrypt format) on the user's credential account,
 * revokes all of their sessions, and records an admin audit row.
 * Plaintext is returned once for the admin to relay manually (no email).
 */
export async function adminIssueTemporaryPassword(
  actorUserId: number,
  targetUserId: number,
): Promise<{ temporaryPassword: string; user: { id: number; email: string } }> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new AdminTemporaryPasswordError('USER_NOT_FOUND', 'User not found');
  }

  const temporaryPassword = generateTemporaryPassword();
  const hashed = await hashPassword(temporaryPassword);

  const account = await prisma.account.findFirst({
    where: { userId: targetUserId, providerId: 'credential' },
  });

  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: targetUserId,
        accountId: String(targetUserId),
        providerId: 'credential',
        password: hashed,
      },
    });
  }

  await prisma.session.deleteMany({ where: { userId: targetUserId } });

  await insertAdminAuditLogEntry(prisma, {
    actorUserId,
    action: 'ISSUE_TEMPORARY_PASSWORD',
    targetUserId,
    metadata: { channel: 'manual' },
  });

  return { temporaryPassword, user };
}
