/**
 * Auth Validation Schemas
 *
 * Validation schemas for authentication endpoints.
 */

import { z } from 'zod';
import { emailSchema } from './common.schemas.js';

// Login request schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Register request schema
export const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .transform((val) => val.trim()),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Password reset request schema
export const passwordResetSchema = z.object({
  email: emailSchema,
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// Token refresh request schema
export const tokenRefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type TokenRefreshInput = z.infer<typeof tokenRefreshSchema>;

// Password change schema (for authenticated users)
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(100, 'New password must be at most 100 characters'),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
