/**
 * Shared rules for recognizing agent API keys stored on `apikey.metadata`.
 * Keep in sync with any UI or route that filters agent keys — unified auth must use the same checks.
 */
export function parseAgentKeyMetadata(metadata: unknown): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata === 'string') {
    try {
      const parsed: unknown = JSON.parse(metadata);
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return null;
}

export function isAgentKeyMetadata(metadata: unknown): boolean {
  const obj = parseAgentKeyMetadata(metadata);
  if (!obj) return false;
  const flag = obj.isAgent;
  return flag === true || flag === 'true';
}

export function isPlatformAgentMetadata(metadata: unknown): boolean {
  const obj = parseAgentKeyMetadata(metadata);
  if (!obj) return false;
  const flag = obj.isPlatformAgent;
  return flag === true || flag === 'true';
}

export function getAllowedReadEndpoints(metadata: unknown): string[] {
  const obj = parseAgentKeyMetadata(metadata);
  if (!obj) return [];
  const value = obj.allowedReadEndpoints;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
