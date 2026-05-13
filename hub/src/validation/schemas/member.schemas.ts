/**
 * Member Validation Schemas
 *
 * Validation schemas for member endpoints.
 */

import { z } from 'zod';
import { emailSchema, userIdParamSchema, idParamSchema } from './common.schemas.js';

// Project role enum
export const projectRoleEnum = z.enum(['Owner', 'Maintainer', 'Editor', 'Viewer']);

// Invite member schema
export const inviteMemberSchema = z.object({
  email: emailSchema,
  projectId: z.number().int().positive('Project ID must be a positive integer'),
  role: projectRoleEnum.default('Viewer'),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

// Batch invite members schema
export const batchInviteMembersSchema = z.object({
  projectId: z.number().int().positive('Project ID must be a positive integer'),
  users: z.array(
    z.object({
      id: z.number().int().positive('User ID must be a positive integer'),
      role: projectRoleEnum.default('Viewer'),
    })
  ).min(1, 'At least one user is required'),
});

export type BatchInviteMembersInput = z.infer<typeof batchInviteMembersSchema>;

// Update member role schema
export const updateMemberRoleSchema = z.object({
  role: projectRoleEnum,
  projectId: z.number().int().positive('Project ID must be a positive integer'),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// Remove member query schema
export const removeMemberQuerySchema = z.object({
  projectId: z.coerce.number().int().positive('Project ID must be a positive integer'),
});

export type RemoveMemberQueryInput = z.infer<typeof removeMemberQuerySchema>;

// Check email query schema
export const checkEmailQuerySchema = z.object({
  projectId: z.coerce.number().int().positive('Project ID must be a positive integer'),
  email: z.string().email('Invalid email format'),
});

export type CheckEmailQueryInput = z.infer<typeof checkEmailQuerySchema>;

// Re-export idParamSchema as memberIdParamSchema for semantic clarity in member routes
export { idParamSchema as memberIdParamSchema };
export type MemberIdParamInput = import('./common.schemas.js').IdParamInput;

// Export user ID param for member routes
export { userIdParamSchema };
export type { UserIdParamInput } from './common.schemas.js';
