/**
 * Built-in agent avatar art lives in `src/assets/agent-avatars/*.svg`.
 * Add or remove SVGs there; this module discovers files at build time via Vite glob.
 */

export interface AgentAvatarOption {
  /** Filename without `.svg` */
  slug: string
  url: string
}

function slugFromGlobPath(path: string): string {
  const file = path.split('/').pop() ?? ''
  return file.replace(/\.svg$/i, '')
}

const avatarUrlByPath = import.meta.glob<string>('@/assets/agent-avatars/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const AGENT_AVATAR_OPTIONS: AgentAvatarOption[] = Object.entries(avatarUrlByPath)
  .map(([path, url]) => ({ slug: slugFromGlobPath(path), url }))
  .filter((o) => o.slug.length > 0)
  .sort((a, b) => a.slug.localeCompare(b.slug))

const bySlug = new Map(AGENT_AVATAR_OPTIONS.map((o) => [o.slug, o.url]))

/** Resolve bundled URL for a stored metadata slug, or null if unknown / empty. */
export function resolveAgentAvatarUrl(avatarSlug: string | null | undefined): string | null {
  if (avatarSlug == null || avatarSlug === '') return null
  return bySlug.get(avatarSlug) ?? null
}
