/**
 * Column Validation Schemas
 *
 * Validation schemas for column endpoints.
 */

import { z } from 'zod';
import { idParamSchema } from './common.schemas.js';

// Workflow column type enum (for workflow states like BACKLOG, TODO, etc.)
export const columnTypeEnum = z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']);

// Column role type enum (for agent system: STANDARD, AGENT_REVIEW, etc.)
export const columnRoleTypeEnum = z.enum(['STANDARD', 'AGENT_REVIEW', 'AGENT_ONLY', 'COMPLETE']);

// Create column schema
export const createColumnSchema = z.object({
  name: z
    .string()
    .min(1, 'Column name is required')
    .max(50, 'Column name must be at most 50 characters')
    .transform((val) => val.trim()),
  projectId: z.number().int().positive('Project ID must be a positive integer'),
  order: z.number().int().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #6366f1)')
    .optional()
    .default('#6366f1'),
  type: columnTypeEnum.optional().nullable(),
  roleType: columnRoleTypeEnum.optional().default('STANDARD'),
  description: z
    .string()
    .max(200, 'Description must be at most 200 characters')
    .optional()
    .nullable(),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;

// Update column schema (full update)
export const updateColumnSchema = z.object({
  name: z
    .string()
    .min(1, 'Column name is required')
    .max(50, 'Column name must be at most 50 characters')
    .transform((val) => val.trim()),
  order: z.number().int(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .optional()
    .default('#6366f1'),
  type: columnTypeEnum.optional().nullable(),
  roleType: columnRoleTypeEnum.optional(),
  description: z
    .string()
    .max(200, 'Description must be at most 200 characters')
    .optional()
    .nullable(),
  wipLimit: z.number().int().min(1, 'WIP limit must be at least 1').optional().nullable(),
});

export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;

// Partial update column schema (for PATCH requests)
export const patchColumnSchema = z.object({
  name: z
    .string()
    .min(1, 'Column name must be at least 1 character')
    .max(50, 'Column name must be at most 50 characters')
    .transform((val) => val.trim())
    .optional(),
  order: z.number().int().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .optional(),
  type: columnTypeEnum.optional().nullable(),
  roleType: columnRoleTypeEnum.optional(),
  description: z
    .string()
    .max(200, 'Description must be at most 200 characters')
    .optional()
    .nullable(),
  wipLimit: z.number().int().min(1, 'WIP limit must be at least 1').optional().nullable(),
});

export type PatchColumnInput = z.infer<typeof patchColumnSchema>;

// Column ID param schema
export const columnIdParamSchema = idParamSchema;

export type ColumnIdParamInput = z.infer<typeof columnIdParamSchema>;

const batchColumnDeleteSchema = z.object({
  id: z.number().int().positive(),
  toDelete: z.literal(true),
});

const batchColumnUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z
    .string()
    .min(1, 'Column name is required')
    .max(50, 'Column name must be at most 50 characters')
    .transform((val) => val.trim()),
  order: z.number().int(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #6366f1)')
    .optional(),
  type: z.string().optional().nullable(),
  roleType: columnRoleTypeEnum.optional(),
  description: z.string().max(200, 'Description must be at most 200 characters').optional().nullable(),
  toDelete: z.boolean().optional(),
});

// Batch update columns schema
export const batchUpdateColumnsSchema = z.object({
  projectId: z.number().int().positive('Project ID must be a positive integer'),
  columns: z.array(z.union([batchColumnDeleteSchema, batchColumnUpsertSchema])),
});

export type BatchUpdateColumnsInput = z.infer<typeof batchUpdateColumnsSchema>;
