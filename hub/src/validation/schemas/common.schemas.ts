/**
 * Common Validation Schemas
 *
 * Shared validation schemas used across multiple route handlers.
 */

import { z } from 'zod';

// Pagination schema for list endpoints
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Pagination metadata for responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Creates a paginated response object
 */
export const paginatedResponse = <T>(
  data: T[], 
  page: number, 
  limit: number, 
  total: number
): { data: T[]; pagination: PaginationMeta } => ({
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  },
});

// Positive integer ID validator (for route params)
export const idParamSchema = z.object({
  id: z.coerce.number().positive('ID must be a positive integer'),
});

export type IdParamInput = z.infer<typeof idParamSchema>;

// User ID param schema
export const userIdParamSchema = z.object({
  userId: z.coerce.number().positive('User ID must be a positive integer'),
});

export type UserIdParamInput = z.infer<typeof userIdParamSchema>;

/** Express param name `projectId` (not `id`) — e.g. `/api/agent/projects/:projectId/tasks`. */
export const projectIdRouteParamSchema = z.object({
  projectId: z.string().transform((val, ctx) => {
    const num = Number(val);
    if (isNaN(num) || val.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_type,
        expected: "number",
        received: "string",
        message: "Project ID must be a valid number",
      });
      return z.NEVER;
    }
    return num;
  }),
});

export type ProjectIdRouteParamInput = z.infer<typeof projectIdRouteParamSchema>;

// Combined project and task ID param schema (for nested routes)
export const projectIdTaskIdParamSchema = z.object({
  projectId: z.coerce.number().positive('Project ID must be a positive integer'),
  taskId: z.coerce.number().positive('Task ID must be a positive integer'),
});

export type ProjectIdTaskIdParamInput = z.infer<typeof projectIdTaskIdParamSchema>;

// Combined project and document ID param schema (for nested routes like /projects/:projectId/docs/:docId)
export const projectIdDocIdParamSchema = z.object({
  projectId: z.coerce.number().positive('Project ID must be a positive integer'),
  docId: z.coerce.number().positive('Document ID must be a positive integer'),
});

export type ProjectIdDocIdParamInput = z.infer<typeof projectIdDocIdParamSchema>;

// Combined project, task, and link ID param schema (for nested routes like /projects/:projectId/tasks/:taskId/doc-links/:linkId)
export const projectIdTaskIdLinkIdParamSchema = z.object({
  projectId: z.coerce.number().positive('Project ID must be a positive integer'),
  taskId: z.coerce.number().positive('Task ID must be a positive integer'),
  linkId: z.coerce.number().positive('Link ID must be a positive integer'),
});

export type ProjectIdTaskIdLinkIdParamInput = z.infer<typeof projectIdTaskIdLinkIdParamSchema>;

// Project ID query param schema
export const projectIdQuerySchema = z.object({
  projectId: z.coerce.number().positive('Project ID must be a positive integer'),
});

export type ProjectIdQueryInput = z.infer<typeof projectIdQuerySchema>;

// Date range filters
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  }
);

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// UUID validator for string IDs
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Email validator with normalization
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .transform((email) => email.toLowerCase().trim());

// Task ID with column ID param schema (for monitor-pass routes)
export const taskIdColumnIdParamSchema = z.object({
  id: z.coerce.number().positive('Task ID must be a positive integer'),
  columnId: z.coerce.number().positive('Column ID must be a positive integer'),
});

export type TaskIdColumnIdParamInput = z.infer<typeof taskIdColumnIdParamSchema>;

// String trim transformer for text fields
export const trimmedString = (minLength: number = 1, maxLength: number = 255) =>
  z
    .string()
    .min(minLength, `Must be at least ${minLength} characters`)
    .max(maxLength, `Must be at most ${maxLength} characters`)
    .transform((val) => val.trim());

// Optional string trim transformer
export const optionalTrimmedString = (maxLength: number = 255) =>
  z
    .string()
    .max(maxLength, `Must be at most ${maxLength} characters`)
    .transform((val) => val.trim())
    .optional()
    .nullable();
