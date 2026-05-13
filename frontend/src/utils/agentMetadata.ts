import type { Agent } from '@/types/agentTypes'

/** API may return JSON `metadata` as object or (edge cases) a string. */
export function parseAgentMetadata(agent: Pick<Agent, 'metadata'>): Record<string, unknown> {
  const raw = agent.metadata
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* ignore */
    }
    return {}
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}
