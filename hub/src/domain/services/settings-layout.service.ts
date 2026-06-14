/**
 * Validates and normalizes Settings Hub layout payloads (mirror Kanban-frontend contract).
 */
import { z } from 'zod';

export const SETTINGS_LAYOUT_PAGE_KEYS = [
  'account',
  'agents',
  'project',
  'admin',
  'themeBuilder',
] as const;

export type SettingsLayoutPageKey = (typeof SETTINGS_LAYOUT_PAGE_KEYS)[number];

const ALLOWED_CARD_IDS = new Set([
  'account.profile',
  'account.security',
  'account.sessions',
  'account.preferences',
  'agents.list',
  'agents.summary',
  'agents.create',
  'agents.delegations',
  'project.context',
  'project.general',
  'project.invite',
  'project.members',
  'project.columns',
  'project.danger',
  'admin.users',
  'admin.systemHealth',
  'admin.rateLimits',
  'admin.platformAgents',
  'admin.planningSkills',
  'admin.summary',
  'admin.roadmapSecurity',
  'admin.roadmapCompliance',
  'admin.roadmapPlatform',
  'theme.builder',
]);

/** Mirror `frontend/src/utils/settingsLayoutNormalize.ts` → `SETTINGS_CARD_CONSTRAINTS` */
const CONTENT_FIT_MAX_H = 240;

const SETTINGS_CARD_CONSTRAINTS: Record<string, { minW: number; maxW: number; minH: number; maxH: number }> = {
  'account.profile': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'account.security': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'account.sessions': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'account.preferences': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'agents.list': { minW: 6, maxW: 9, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'agents.summary': { minW: 3, maxW: 4, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'agents.create': { minW: 3, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'agents.delegations': { minW: 6, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'project.context': { minW: 6, maxW: 12, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'project.general': { minW: 4, maxW: 8, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'project.invite': { minW: 4, maxW: 8, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'project.members': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'project.columns': { minW: 4, maxW: 12, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'project.danger': { minW: 6, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.users': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.systemHealth': { minW: 3, maxW: 6, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'admin.rateLimits': { minW: 6, maxW: 9, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.platformAgents': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.planningSkills': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.summary': { minW: 3, maxW: 4, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.roadmapSecurity': { minW: 4, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.roadmapCompliance': { minW: 4, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.roadmapPlatform': { minW: 4, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'theme.builder': { minW: 8, maxW: 12, minH: 10, maxH: CONTENT_FIT_MAX_H },
};

function cardConstraint(id: string, columns: number): { minW: number; maxW: number; minH: number; maxH: number } {
  const c = SETTINGS_CARD_CONSTRAINTS[id] ?? { minW: 3, maxW: columns, minH: 3, maxH: CONTENT_FIT_MAX_H };
  return {
    minW: Math.max(1, Math.min(columns, c.minW)),
    maxW: Math.max(1, Math.min(columns, c.maxW)),
    minH: Math.max(1, c.minH),
    maxH: Math.max(1, c.maxH),
  };
}

const placementSchema = z
  .object({
    id: z.string().min(1),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().min(1).max(24),
    h: z.number().int().min(1).max(80),
    hidden: z.boolean().optional(),
  })
  .superRefine((card, ctx) => {
    if (!ALLOWED_CARD_IDS.has(card.id)) {
      ctx.addIssue({ code: 'custom', message: `Unknown card id: ${card.id}` });
    }
  });

const pageLayoutSchema = z
  .object({
    grid: z.object({
      columns: z.number().int().min(1).max(24),
    }),
    cards: z.array(placementSchema),
  })
  .superRefine((page, ctx) => {
    const cols = page.grid.columns;
    for (let i = 0; i < page.cards.length; i++) {
      const c = page.cards[i];
      if (c.x < 0 || c.x > cols - 1) {
        ctx.addIssue({ code: 'custom', message: `Card ${c.id}: x out of range for grid` });
      }
      if (c.x + c.w > cols) {
        ctx.addIssue({ code: 'custom', message: `Card ${c.id}: x+w exceeds grid columns` });
      }
      if (c.y < 0 || c.y > 500) {
        ctx.addIssue({ code: 'custom', message: `Card ${c.id}: y out of range` });
      }
      const { minW, maxW, minH, maxH } = cardConstraint(c.id, cols);
      if (c.w < minW || c.w > maxW) {
        ctx.addIssue({
          code: 'custom',
          message: `Card ${c.id}: w must be between ${minW} and ${maxW} for this grid (got ${c.w})`,
        });
      }
      if (c.h < minH || c.h > maxH) {
        ctx.addIssue({
          code: 'custom',
          message: `Card ${c.id}: h must be between ${minH} and ${maxH} (got ${c.h})`,
        });
      }
    }
  });

export type PersistedSettingsLayoutsV1 = {
  version: 1;
  userId: string;
  lastUpdatedAt: string;
  pages: Partial<Record<SettingsLayoutPageKey, z.infer<typeof pageLayoutSchema>>>;
};

const pagesSchema = z
  .object({
    account: pageLayoutSchema.optional(),
    agents: pageLayoutSchema.optional(),
    project: pageLayoutSchema.optional(),
    admin: pageLayoutSchema.optional(),
    themeBuilder: pageLayoutSchema.optional(),
  })
  .strict();

const rootSchema = z.object({
  version: z.literal(1),
  userId: z.union([z.string(), z.number().int().positive()]),
  lastUpdatedAt: z.string().optional(),
  pages: pagesSchema,
});

export function parseSettingsLayoutPayload(
  input: unknown,
  authenticatedUserId: number,
): PersistedSettingsLayoutsV1 {
  const parsed = rootSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid layout payload';
    throw new SettingsLayoutValidationError(msg);
  }
  const uid = String(authenticatedUserId);
  const bodyUserId = String(parsed.data.userId);
  if (bodyUserId !== uid) {
    throw new SettingsLayoutValidationError('userId must match the authenticated user');
  }

  const pages: PersistedSettingsLayoutsV1['pages'] = {};
  for (const k of SETTINGS_LAYOUT_PAGE_KEYS) {
    const p = parsed.data.pages[k];
    if (p) pages[k] = p;
  }

  return {
    version: 1,
    userId: uid,
    lastUpdatedAt: new Date().toISOString(),
    pages,
  };
}

export class SettingsLayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsLayoutValidationError';
  }
}
