/**
 * Better Auth Configuration
 * 
 * Production-ready authentication with Prisma adapter,
 * cookie-based sessions, and CSRF protection.
 */

import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { bearer } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { prisma } from './prisma.js';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  
  // Enable Bearer token plugin for API authentication and API Key plugin for agents
  plugins: [
    bearer(),
    apiKey({
      // Canonical header for raw agent API key authentication.
      apiKeyHeaders: ['x-agent-api-key'],
      enableMetadata: true,
      permissions: {
        defaultPermissions: {
          agent: ['viewer'],
        },
      },
    }),
  ],
  
  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  
  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days in seconds
    updateAge: 60 * 60 * 24, // Update session every 24 hours (rolling refresh)
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // Cache session for 5 minutes
    },
  },
  
  // Cookie configuration
  advanced: {
    cookiePrefix: 'kanban',
    useSecureCookies: process.env.NODE_ENV === 'production',
    database: {
      generateId: 'serial', // Use auto-incrementing integer IDs instead of string UUIDs
    },
  },
  
  // CORS configuration
  trustedOrigins: process.env.DEVELOPMENT_FE_ORIGIN?.split(',') || [
    'http://localhost:4000',
  ],
});

// Export auth types
export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;