/**
 * Task-Document Link Validation Schemas
 *
 * Validation schemas for task-document link endpoints.
 */

import { z } from 'zod';

export const docLinkRoleEnum = z.enum([
  'SPECIFICATION',
  'IMPLEMENTATION_PLAN',
  'REFERENCE',
  'ATTACHMENT',
]);

export const createTaskDocumentLinkSchema = z.object({
  documentId: z.number().int().positive('Document ID must be a positive integer'),
  role: docLinkRoleEnum.optional(),
  pinnedVersion: z.number().int().positive().optional().nullable(),
});

export type CreateTaskDocumentLinkInput = z.infer<typeof createTaskDocumentLinkSchema>;

export const patchTaskDocumentLinkSchema = z.object({
  role: docLinkRoleEnum.optional().nullable(),
  pinnedVersion: z.number().int().positive().optional().nullable(),
});

export type PatchTaskDocumentLinkInput = z.infer<typeof patchTaskDocumentLinkSchema>;
