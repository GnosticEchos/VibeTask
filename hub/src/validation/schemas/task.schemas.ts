/**
 * Task Validation Schemas
 *
 * Validation schemas for task endpoints.
 */

import { z } from 'zod';
import { idParamSchema } from './common.schemas.js';

/** Kebab-case relation to another task (must pair with relationId on create). */
export const taskRelationModeEnum = z.enum(['blocks', 'blocked-by', 'relates-to', 'duplicate-of', 'spec']);

// Task priority enum
export const taskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

// Task status enum
export const taskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']);

// Create task schema
export const createTaskSchema = z.object({
  projectId: z.number().int().positive('Project ID must be a positive integer'),
  name: z
    .string()
    .min(1, 'Task title is required')
    .max(200, 'Task title must be at most 200 characters')
    .transform((val) => val.trim()),
  description: z
    .string()
    .max(5000, 'Description must be at most 5000 characters')
    .optional()
    .nullable(),
  projectColumnId: z.number().int().positive().optional().nullable(),
  assigneeId: z.number().int().positive().optional().nullable(),
  assigneeApiKeyId: z.string().optional().nullable(),
  priority: taskPriorityEnum.default('MEDIUM'),
  dueDate: z.coerce.date().optional().nullable(),
  labels: z.array(z.string().min(1).max(50)).max(10, 'Maximum 10 labels allowed').optional().default([]),
  relationMode: taskRelationModeEnum.optional().nullable(),
  relationId: z.number().int().positive().optional().nullable(),
  isContainer: z.boolean().optional(),
  subBoardOutlineColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
})
  .superRefine((data, ctx) => {
    if (data.relationId != null && data.relationMode == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationMode'],
        message: 'relationMode is required when relationId is set',
      });
    }
    if (data.relationMode != null && data.relationId == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationId'],
        message: 'relationId is required when relationMode is set',
      });
    }
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// Update task schema (full update)
export const updateTaskSchema = z.object({
  name: z
    .string()
    .min(1, 'Task title is required')
    .max(200, 'Task title must be at most 200 characters')
    .transform((val) => val.trim()),
  description: z
    .string()
    .max(5000, 'Description must be at most 5000 characters')
    .optional()
    .nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assigneeId: z.number().int().positive().optional().nullable(),
  assigneeApiKeyId: z.string().optional().nullable(),
  projectColumnId: z.number().int().positive().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  labels: z.array(z.string().min(1).max(50)).max(10, 'Maximum 10 labels allowed').optional().default([]),
  order: z.number().int().optional(),
  relationMode: taskRelationModeEnum.optional().nullable(),
  relationId: z.number().int().positive().optional().nullable(),
})
  .superRefine((data, ctx) => {
    if (data.relationId != null && data.relationMode == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationMode'],
        message: 'relationMode is required when relationId is set',
      });
    }
    if (data.relationMode != null && data.relationId == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationId'],
        message: 'relationId is required when relationMode is set',
      });
    }
  });

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Partial update task schema (for PATCH requests)
export const patchTaskSchema = z.object({
  name: z
    .string()
    .min(1, 'Task title must be at least 1 character')
    .max(200, 'Task title must be at most 200 characters')
    .transform((val) => val.trim())
    .optional(),
  description: z
    .string()
    .max(5000, 'Description must be at most 5000 characters')
    .optional()
    .nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assigneeId: z.number().int().positive().optional().nullable(),
  assigneeApiKeyId: z.string().optional().nullable(),
  projectColumnId: z.number().int().positive().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  labels: z.array(z.string().min(1).max(50)).max(10, 'Maximum 10 labels allowed').optional().default([]),
  relationMode: taskRelationModeEnum.optional().nullable(),
  relationId: z.number().int().positive().optional().nullable(),
  isContainer: z.boolean().optional(),
  planAccepted: z.boolean().optional(),
  subBoardOutlineColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
})
  .superRefine((data, ctx) => {
    if (data.relationId != null && data.relationMode == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationMode'],
        message: 'relationMode is required when relationId is set',
      });
    }
    if (data.relationMode != null && data.relationId == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationId'],
        message: 'relationId is required when relationMode is set',
      });
    }
  });

export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

// Move task schema
export const moveTaskSchema = z.object({
  targetColumnId: z.number().int().positive('Target column ID must be a positive integer'),
  targetIndex: z.number().int().min(0, 'Target index must be 0 or greater'),
});

export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

// Task ID param schema
export const taskIdParamSchema = idParamSchema;

export type TaskIdParamInput = z.infer<typeof taskIdParamSchema>;

// Create comment schema
export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment content is required')
    .max(2000, 'Comment must be at most 2000 characters')
    .transform((val) => val.trim()),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// Task query params schema
export const taskQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  assigneeIds: z.string().optional(),
  query: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
