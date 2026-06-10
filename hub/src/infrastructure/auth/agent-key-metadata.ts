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

/** Scout read templates used when `allowedReadEndpoints` is unset or empty (platform MCP tool parity). */
export const DEFAULT_PLATFORM_SCOUT_READ_ENDPOINTS = [
  '/api/agent/projects',
  '/api/agent/projects/:projectId/tasks',
  '/api/agent/projects/:projectId/docs',
] as const;

export function getAllowedReadEndpoints(metadata: unknown): string[] {
  const obj = parseAgentKeyMetadata(metadata);
  if (!obj) return [];
  const value = obj.allowedReadEndpoints;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Configured allowlist, or default scout reads when the platform agent has no explicit entries. */
export function getEffectiveAllowedReadEndpoints(metadata: unknown): string[] {
  const configured = getAllowedReadEndpoints(metadata);
  if (configured.length > 0) {
    return configured;
  }
  return [...DEFAULT_PLATFORM_SCOUT_READ_ENDPOINTS];
}

function matchesTemplatePath(template: string, actualPath: string): boolean {
  const templateParts = template.split('/').filter(Boolean);
  const actualParts = actualPath.split('/').filter(Boolean);
  if (templateParts.length !== actualParts.length) return false;
  return templateParts.every((part, index) => part.startsWith(':') || part === actualParts[index]);
}

/** Whether a platform agent read template covers the requested API path. */
export function platformAgentReadEndpointAllowed(allowed: string[], requestPath: string): boolean {
  return allowed.some((template) => {
    if (matchesTemplatePath(template, requestPath)) return true;
    if (!template.includes(':') && requestPath.startsWith(`${template}/`)) return true;
    return false;
  });
}
