import { axiosApi } from '../axios'
import type { components } from '@/api/generated/openapi-types'

export type PlanningSkillSummary = components['schemas']['PlanningSkillSummary']
export type PlanningSkill = components['schemas']['PlanningSkill']
export type EffectivePlanningSkill = components['schemas']['EffectivePlanningSkill']
/** @deprecated Use {@link EffectivePlanningSkill} — renamed to avoid OpenAPI/progenitor type collision */
export type PlanningSkillContent = EffectivePlanningSkill
export type PlanningSkillRevision = components['schemas']['PlanningSkillRevision']
export type PlanningSkillCatalogEntry = components['schemas']['PlanningSkillCatalogEntry']
export type ProjectPlanningSkillIndexEntry = components['schemas']['ProjectPlanningSkillIndexEntry']
export type ProjectPlanningSkillOverride = components['schemas']['ProjectPlanningSkillOverride']

export const PLANNING_SKILL_MAX_BYTES = 32_000

function rateLimitAdminBypassHeaders(): Record<string, string> {
  const key = import.meta.env.VITE_RATE_LIMIT_ADMIN_BYPASS_KEY as string | undefined
  if (key && String(key).trim()) {
    return { 'X-Admin-Bypass-Key': String(key).trim() }
  }
  return {}
}

export function extractPlanningSkillApiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  return data?.message || data?.error || (error as Error).message || fallback
}

export async function listAdminPlanningSkills(): Promise<PlanningSkillSummary[]> {
  const response = await axiosApi.get<{ skills: PlanningSkillSummary[] }>('admin/planning-skills', {
    headers: rateLimitAdminBypassHeaders(),
  })
  return response.data?.skills ?? []
}

export async function syncAdminPlanningSkills(): Promise<number> {
  const response = await axiosApi.post<{ synced: number }>(
    'admin/planning-skills/sync',
    undefined,
    { headers: rateLimitAdminBypassHeaders() },
  )
  return response.data?.synced ?? 0
}

export async function getAdminPlanningSkillCatalog(): Promise<PlanningSkillCatalogEntry[]> {
  const response = await axiosApi.get<{ catalog: PlanningSkillCatalogEntry[] }>(
    'admin/planning-skills/catalog',
    { headers: rateLimitAdminBypassHeaders() },
  )
  return response.data?.catalog ?? []
}

export async function getAdminPlanningSkill(slug: string): Promise<PlanningSkillContent> {
  const response = await axiosApi.get<PlanningSkillContent>(
    `admin/planning-skills/${encodeURIComponent(slug)}`,
    { headers: rateLimitAdminBypassHeaders() },
  )
  return response.data
}

export async function upsertAdminPlanningSkill(
  slug: string,
  content: string,
): Promise<PlanningSkill> {
  const response = await axiosApi.put<{ skill: PlanningSkill }>(
    `admin/planning-skills/${encodeURIComponent(slug)}`,
    { content },
    { headers: rateLimitAdminBypassHeaders() },
  )
  const skill = response.data?.skill
  if (!skill) throw new Error('Invalid planning skill upsert response')
  return skill
}

export async function listAdminPlanningSkillRevisions(slug: string): Promise<PlanningSkillRevision[]> {
  const response = await axiosApi.get<{ revisions: PlanningSkillRevision[] }>(
    `admin/planning-skills/${encodeURIComponent(slug)}/revisions`,
    { headers: rateLimitAdminBypassHeaders() },
  )
  return response.data?.revisions ?? []
}

export async function revertAdminPlanningSkill(
  slug: string,
  revisionId: string,
): Promise<PlanningSkill> {
  const response = await axiosApi.post<{ skill: PlanningSkill }>(
    `admin/planning-skills/${encodeURIComponent(slug)}/revert`,
    { revisionId },
    { headers: rateLimitAdminBypassHeaders() },
  )
  const skill = response.data?.skill
  if (!skill) throw new Error('Invalid planning skill revert response')
  return skill
}

export async function listProjectPlanningSkills(
  projectId: number,
): Promise<ProjectPlanningSkillIndexEntry[]> {
  const response = await axiosApi.get<{ skills: ProjectPlanningSkillIndexEntry[] }>(
    `projects/${projectId}/planning/skills`,
  )
  return response.data?.skills ?? []
}

export async function getProjectPlanningSkill(
  projectId: number,
  slug: string,
): Promise<PlanningSkillContent> {
  const response = await axiosApi.get<PlanningSkillContent>(
    `projects/${projectId}/planning/skills/${encodeURIComponent(slug)}`,
  )
  return response.data
}

export async function upsertProjectPlanningSkill(
  projectId: number,
  slug: string,
  content: string,
): Promise<ProjectPlanningSkillOverride> {
  const response = await axiosApi.put<{ override: ProjectPlanningSkillOverride }>(
    `projects/${projectId}/planning/skills/${encodeURIComponent(slug)}`,
    { content },
  )
  const override = response.data?.override
  if (!override) throw new Error('Invalid project planning skill override response')
  return override
}

export async function deleteProjectPlanningSkillOverride(
  projectId: number,
  slug: string,
): Promise<void> {
  await axiosApi.delete(
    `projects/${projectId}/planning/skills/${encodeURIComponent(slug)}`,
  )
}
