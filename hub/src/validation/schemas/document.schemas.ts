/**
 * Document Validation Schemas
 *
 * Validation schemas for project document endpoints.
 */

import { z } from 'zod';
import { idParamSchema } from './common.schemas.js';

export const docTypeEnum = z.enum([
  'CONSTITUTION',
  'SPECIFICATION',
  'BRAINSTORM',
  'POST_MORTEM',
  'IMPLEMENTATION_PLAN',
  'OTHER',
]);

export const createDocumentSchema = z.object({
  title: z
    .string()
    .min(1, 'Document title is required')
    .max(200, 'Title must be at most 200 characters')
    .transform((val) => val.trim()),
  content: z.string().max(100000, 'Content must be at most 100000 characters').optional().default(''),
  docType: docTypeEnum.default('SPECIFICATION'),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const patchDocumentSchema = z.object({
  title: z
    .string()
    .min(1, 'Document title is required')
    .max(200, 'Title must be at most 200 characters')
    .transform((val) => val.trim())
    .optional(),
  content: z.string().max(100000, 'Content must be at most 100000 characters').optional(),
  docType: docTypeEnum.optional(),
});

export type PatchDocumentInput = z.infer<typeof patchDocumentSchema>;

export const documentIdParamSchema = idParamSchema;
export type DocumentIdParamInput = z.infer<typeof documentIdParamSchema>;
