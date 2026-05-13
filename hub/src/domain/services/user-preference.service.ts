/**
 * User notification/locale preferences (UserPreference table, raw SQL for legacy compatibility).
 */
import { prisma } from '../../infrastructure/auth/index.js';

export type PreferencesRow = {
  userId: number;
  locale: string | null;
  timezone: string | null;
  emailTaskAssigned: boolean | null;
  emailTaskCommented: boolean | null;
  emailDailyDigest: boolean | null;
};

let preferencesTableEnsured = false;

export async function ensurePreferencesTable(): Promise<void> {
  if (preferencesTableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserPreference" (
      "userId" INTEGER PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
      "locale" VARCHAR(10) DEFAULT 'en',
      "timezone" VARCHAR(80) DEFAULT 'UTC',
      "emailTaskAssigned" BOOLEAN DEFAULT true,
      "emailTaskCommented" BOOLEAN DEFAULT true,
      "emailDailyDigest" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  preferencesTableEnsured = true;
}

export async function getOrCreatePreferences(userId: number): Promise<PreferencesRow> {
  await ensurePreferencesTable();
  const existing = await prisma.$queryRawUnsafe<PreferencesRow[]>(
    `SELECT "userId","locale","timezone","emailTaskAssigned","emailTaskCommented","emailDailyDigest"
     FROM "UserPreference"
     WHERE "userId" = $1`,
    userId,
  );

  if (existing.length > 0) return existing[0];

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserPreference" ("userId") VALUES ($1) ON CONFLICT ("userId") DO NOTHING`,
    userId,
  );

  const inserted = await prisma.$queryRawUnsafe<PreferencesRow[]>(
    `SELECT "userId","locale","timezone","emailTaskAssigned","emailTaskCommented","emailDailyDigest"
     FROM "UserPreference"
     WHERE "userId" = $1`,
    userId,
  );
  return inserted[0];
}

export function mapPreferencesResponse(row: PreferencesRow) {
  return {
    locale: row.locale || 'en',
    timezone: row.timezone || 'UTC',
    emailNotifications: {
      taskAssigned: row.emailTaskAssigned ?? true,
      taskCommented: row.emailTaskCommented ?? true,
      dailyDigest: row.emailDailyDigest ?? false,
    },
  };
}

export async function applyPreferencesPatch(
  userId: number,
  body: {
    locale?: string;
    timezone?: string;
    emailNotifications?: {
      taskAssigned?: boolean;
      taskCommented?: boolean;
      dailyDigest?: boolean;
    };
  },
): Promise<void> {
  await getOrCreatePreferences(userId);
  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserPreference"
    SET
      "locale" = COALESCE($2, "locale"),
      "timezone" = COALESCE($3, "timezone"),
      "emailTaskAssigned" = COALESCE($4, "emailTaskAssigned"),
      "emailTaskCommented" = COALESCE($5, "emailTaskCommented"),
      "emailDailyDigest" = COALESCE($6, "emailDailyDigest"),
      "updatedAt" = NOW()
    WHERE "userId" = $1
    `,
    userId,
    body.locale ?? null,
    body.timezone ?? null,
    body.emailNotifications?.taskAssigned ?? null,
    body.emailNotifications?.taskCommented ?? null,
    body.emailNotifications?.dailyDigest ?? null,
  );
}
