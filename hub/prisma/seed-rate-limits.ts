/**
 * Rate Limit Configuration Seed Script
 * 
 * Seeds only rate limit configurations without affecting other data.
 * Safe to run multiple times - will only create defaults if none exist.
 * 
 * Run with: npx tsx prisma/seed-rate-limits.ts
 */

import { prisma } from '../src/infrastructure/auth/index.js';

async function main() {
  console.log('Checking rate limit configurations...');

  // Check if any rate limit configs already exist
  const existingCount = await prisma.rateLimitConfig.count();
  
  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing rate limit configurations, skipping defaults`);
    return;
  }

  // Create default rate limit configurations
  const defaultRateLimits = [
    {
      name: 'Authentication',
      endpointPattern: '/api/auth/*',
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      enabled: true,
      description: 'Limit authentication attempts to prevent brute force attacks',
    },
    {
      name: 'General API',
      endpointPattern: '/api/*',
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
      enabled: true,
      description: 'General API rate limit for all endpoints',
    },
    {
      name: 'Member Invitations',
      endpointPattern: '/api/members/*/invite',
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
      enabled: true,
      description: 'Limit member invitations to prevent spam',
    },
    {
      name: 'Admin Endpoints',
      endpointPattern: '/api/admin/*',
      windowMs: 15 * 60 * 1000,
      maxRequests: 50,
      enabled: true,
      description: 'Rate limit for admin endpoints',
    },
    {
      name: 'Health Checks',
      endpointPattern: '/health',
      windowMs: 60 * 1000,
      maxRequests: 1000,
      enabled: false,
      description: 'Health check endpoint - disabled by default',
    },
  ];

  for (const rateLimit of defaultRateLimits) {
    await prisma.rateLimitConfig.create({ data: rateLimit });
  }

  console.log(`Created ${defaultRateLimits.length} default rate limit configurations`);
}

main()
  .catch((e) => {
    console.error('Rate limit seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
