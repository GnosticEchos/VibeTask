/** Server-accepted task relation modes (hub taskRelationModeEnum). */
export const API_TASK_RELATION_MODES = [
  'blocks',
  'blocked-by',
  'relates-to',
  'duplicate-of',
  'spec',
] as const

export type ApiTaskRelationMode = (typeof API_TASK_RELATION_MODES)[number]

/** Legacy / invalid values stored in DB or old UI — map to API enum before PATCH. */
const RELATION_MODE_ALIASES: Record<string, ApiTaskRelationMode> = {
  'duplicated-by': 'duplicate-of',
}

export const RELATION_UI_OPTIONS = [
  { label: 'Related to', value: 'Related to' },
  { label: 'Blocked by', value: 'Blocked by' },
  { label: 'Blocks', value: 'Blocks' },
  { label: 'Duplicate of', value: 'Duplicate of' },
] as const

const RELATION_MODE_TO_LABEL: Record<string, string> = {
  'relates-to': 'Related to',
  'blocked-by': 'Blocked by',
  blocks: 'Blocks',
  'duplicate-of': 'Duplicate of',
  spec: 'Spec',
  'duplicated-by': 'Duplicate of',
}

const RELATION_LABEL_TO_MODE: Record<string, ApiTaskRelationMode> = {
  'Related to': 'relates-to',
  'Blocked by': 'blocked-by',
  Blocks: 'blocks',
  'Duplicate of': 'duplicate-of',
}

export function normalizeRelationModeForApi(mode: string | null | undefined): ApiTaskRelationMode | null {
  if (mode == null || mode === '') return null
  const trimmed = mode.trim()
  const fromLabel = RELATION_LABEL_TO_MODE[trimmed]
  const kebab = fromLabel ?? trimmed.toLowerCase().replace(/\s+/g, '-')
  const aliased = (RELATION_MODE_ALIASES[kebab] ?? kebab) as string
  return (API_TASK_RELATION_MODES as readonly string[]).includes(aliased) ? (aliased as ApiTaskRelationMode) : null
}

export function relationModeToUiLabel(mode: string | null | undefined): string {
  if (!mode) return ''
  const apiMode = normalizeRelationModeForApi(mode)
  if (apiMode) return RELATION_MODE_TO_LABEL[apiMode] ?? apiMode
  return RELATION_MODE_TO_LABEL[mode] ?? mode
}

export function relationUiLabelToApiMode(label: string): ApiTaskRelationMode | null {
  if (!label) return null
  return normalizeRelationModeForApi(RELATION_LABEL_TO_MODE[label] ?? label)
}
