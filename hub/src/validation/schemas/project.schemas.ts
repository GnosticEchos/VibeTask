/**
 * Project Validation Schemas
 *
 * Validation schemas for project endpoints.
 */

import { z } from 'zod';
import { idParamSchema, optionalTrimmedString } from './common.schemas.js';

// Project status enum
export const projectStatusEnum = z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']);

// Create project schema
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be at most 100 characters')
    .transform((val) => val.trim()),
  description: optionalTrimmedString(500),
  prefix: z
    .string()
    .min(2, 'Prefix must be at least 2 characters')
    .max(10, 'Prefix must be at most 10 characters')
    .regex(/^[A-Z0-9]+$/, 'Prefix must be uppercase letters and numbers only')
    .transform((val) => val.toUpperCase().trim()),
  columns: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        order: z.number().int().optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        type: z.string().optional().nullable(),
        description: z.string().max(200).optional().nullable(),
      })
    )
    .optional(),
  template: z.enum(['LIFECYCLE_EPIC', 'ADHOC_OPS']).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Update project schema (full update)
export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be at most 100 characters')
    .transform((val) => val.trim()),
  description: optionalTrimmedString(500),
  status: projectStatusEnum.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// Patch schema - all fields optional for partial updates
export const patchProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be at most 100 characters')
    .transform((val) => val.trim())
    .optional(),
  description: optionalTrimmedString(500).optional(),
  status: projectStatusEnum.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type PatchProjectInput = z.infer<typeof patchProjectSchema>;

// Project ID param schema
export const projectIdParamSchema = idParamSchema;

export type ProjectIdParamInput = z.infer<typeof projectIdParamSchema>;
