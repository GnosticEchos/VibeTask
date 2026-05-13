/**
 * Deletes all RateLimitConfig rows and re-applies built-in defaults from
 * `src/config/rate-limit.ts` via RateLimitService.initializeDefaults().
 *
 * Usage: npx tsx scripts/reset-rate-limit-config.ts
 * Requires DATABASE_URL (e.g. from .env).
 */
import 'dotenv/config';
import { prisma } from '../src/infrastructure/auth/prisma.js';
import { RateLimitService } from '../src/domain/services/rate-limit.service.js';

async function main() {
  const deleted = await prisma.rateLimitConfig.deleteMany({});
  console.log(`Deleted ${deleted.count} rate limit config row(s).`);
  await RateLimitService.initializeDefaults();
  const total = await prisma.rateLimitConfig.count();
  console.log(`RateLimitConfig row count after defaults: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
