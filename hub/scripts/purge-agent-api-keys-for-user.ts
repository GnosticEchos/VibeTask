/**
 * One-off dev helper: delete all API agent keys (metadata.isAgent) for a user by id.
 * Usage: npx tsx scripts/purge-agent-api-keys-for-user.ts [userId]
 * Default userId: 1 (fixture / primary dev user).
 */
import 'dotenv/config';
import { prisma } from '../src/infrastructure/auth/prisma.js';

function isAgentKeyMetadata(metadata: unknown): boolean {
  if (metadata == null) return false;
  let obj: Record<string, unknown> | null = null;
  if (typeof metadata === 'string') {
    try {
      const parsed: unknown = JSON.parse(metadata);
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      obj = parsed as Record<string, unknown>;
    } catch {
      return false;
    }
  } else if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    obj = metadata as Record<string, unknown> | null;
    if (obj == null) return false;
  } else return false;
  const flag = obj.isAgent;
  return flag === true || flag === 'true';
}

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  if (!Number.isFinite(userId)) {
    console.error('Invalid user id');
    process.exit(1);
  }
  const referenceId = String(userId);
  const keys = await prisma.apikey.findMany({
    where: { referenceId },
    select: { id: true, metadata: true },
  });
  const agentIds = keys.filter((k) => isAgentKeyMetadata(k.metadata)).map((k) => k.id);
  console.log(`Found ${agentIds.length} agent api keys for user ${userId}`);
  if (agentIds.length === 0) {
    await prisma.$disconnect();
    return;
  }
  await prisma.agentDelegation.deleteMany({ where: { apiKeyId: { in: agentIds } } });
  await prisma.agentLifecycleAuditLog.deleteMany({ where: { apiKeyId: { in: agentIds } } });
  const del = await prisma.apikey.deleteMany({ where: { id: { in: agentIds } } });
  console.log(`Deleted ${del.count} api keys.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
