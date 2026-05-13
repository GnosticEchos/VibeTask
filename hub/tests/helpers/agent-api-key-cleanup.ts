/**
 * Remove all API keys flagged as agents for a user (integration / dev DB hygiene).
 * Keeps logic in sync with GET /api/agents filtering.
 */
import { testPrisma } from '../integration/setup/test-db.js';
import { MIN_TEST_ID } from '../integration/setup/test-db.js';

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
  } else {
    return false;
  }
  const flag = obj.isAgent;
  return flag === true || flag === 'true';
}

type AgentCleanupOptions = {
  createdAfter?: Date;
  includeExistingUser?: boolean;
};

/** Deletes agent api keys and related delegations / audit rows for the given user id. */
export async function deleteAllAgentApiKeysForUser(userId: number, options: AgentCleanupOptions = {}): Promise<void> {
  const { createdAfter, includeExistingUser = false } = options;

  // Safety rail: integration tests run against the same DB in this workspace.
  // Never purge keys for seed / real users (id <= MIN_TEST_ID) unless explicitly allowed.
  if (
    userId <= MIN_TEST_ID &&
    !includeExistingUser &&
    process.env.ALLOW_EXISTING_USER_AGENT_KEY_CLEANUP !== 'true'
  ) {
    return;
  }

  const referenceId = String(userId);
  const keys = await testPrisma.apikey.findMany({
    where: { referenceId },
    select: { id: true, metadata: true, createdAt: true },
  });
  const agentIds = keys
    .filter((k) => isAgentKeyMetadata(k.metadata))
    .filter((k) => !createdAfter || k.createdAt >= createdAfter)
    .map((k) => k.id);
  if (agentIds.length === 0) return;

  await testPrisma.agentDelegation.deleteMany({ where: { apiKeyId: { in: agentIds } } });
  await testPrisma.agentLifecycleAuditLog.deleteMany({ where: { apiKeyId: { in: agentIds } } });
  await testPrisma.apikey.deleteMany({ where: { id: { in: agentIds } } });
}
