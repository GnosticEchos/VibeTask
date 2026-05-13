/**
 * Validation Middleware
 *
 * Express middleware for request validation using Zod schemas.
 * Preserves Zod coercion - validated data maintains original types (numbers stay numbers).
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny, ZodIssue } from 'zod';

/**
 * Symbol-keyed property for storing validated data
 * This avoids conflicts with Express 5's internal property descriptors
 * and provides a clean separation between raw and validated data
 */
const VALIDATED_DATA = Symbol('validatedData');
const isValidationDebugEnabled = process.env.VALIDATION_DEBUG === 'true';

/**
 * Extended Express Request interface with validated data storage
 * This provides a type-safe way to access validated data
 */
export interface ValidatedRequest extends Request {
  [VALIDATED_DATA]?: {
    body?: any;
    params?: any;
    query?: any;
  };
}

/**
 * Helper function to get validated data from request
 * Always initializes VALIDATED_DATA on the request if it doesn't exist
 */
function getValidatedData(req: Request): { body?: any; params?: any; query?: any } {
  const reqWithValidated = req as ValidatedRequest;
  if (!reqWithValidated[VALIDATED_DATA]) {
    reqWithValidated[VALIDATED_DATA] = {};
  }
  return reqWithValidated[VALIDATED_DATA];
}

/**
 * Helper function to set validated data on request
 */
function setValidatedData(
  req: Request,
  data: { body?: any; params?: any; query?: any }
): void {
  (req as ValidatedRequest)[VALIDATED_DATA] = data;
}

/**
 * Formats Zod validation errors into a structured response
 */
function formatValidationErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue: ZodIssue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Creates a validation error response
 */
function createValidationErrorResponse(errors: Array<{ field: string; message: string }>) {
  return {
    error: 'Validation Error',
    message: 'Request validation failed',
    details: errors,
  };
}

/**
 * Generic validation middleware for request body
 * 
 * Validates request body against a Zod schema and stores the validated data
 * in a Symbol-keyed property. Zod coercion is preserved (e.g., string "123"
 * becomes number 123 if schema specifies a number).
 * 
 * @param schema - Zod schema to validate against
 * 
 * @example
 * // In a route handler:
 * router.post('/', validateBody(createTaskSchema), async (req, res) => {
 *   const body = getValidatedBody(req); // Returns validated body with coerced types
 *   // body.columnId is a number, not a string
 * });
 */
export function validateBody<T extends ZodTypeAny>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        return res.status(400).json(createValidationErrorResponse(errors));
      }

      // Store validated data using Symbol-keyed property for Express 5 compatibility
      // This avoids conflicts with Express 5's internal property descriptors
      // and provides a clean separation between raw and validated data
      const validatedData = getValidatedData(req);
      validatedData.body = result.data;
      setValidatedData(req, validatedData);
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generic validation middleware for route parameters
 * 
 * Validates route parameters against a Zod schema and stores the validated data
 * in a Symbol-keyed property. Zod coercion is preserved (e.g., string "123"
 * becomes number 123 if schema specifies a number).
 * 
 * @param schema - Zod schema to validate against
 * 
 * @example
 * // In a route handler:
 * router.get('/:id', validateParams(z.object({ id: z.coerce.number() })), async (req, res) => {
 *   const params = getValidatedParams(req); // Returns { id: number }
 *   // params.id is a number, not a string
 * });
 */
export function validateParams<T extends ZodTypeAny>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (isValidationDebugEnabled) {
        console.log('[validateParams] req.params:', JSON.stringify(req.params));
      }
      const result = schema.safeParse(req.params);
      if (isValidationDebugEnabled) {
        console.log('[validateParams] result:', JSON.stringify(result));
      }

      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        return res.status(400).json(createValidationErrorResponse(errors));
      }

      // Store validated data using Symbol-keyed property for Express 5 compatibility
      // This avoids conflicts with Express 5's internal property descriptors
      // and provides a clean separation between raw and validated data
      const validatedData = getValidatedData(req);
      validatedData.params = result.data;
      setValidatedData(req, validatedData);
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generic validation middleware for query parameters
 * 
 * Validates query parameters against a Zod schema and stores the validated data
 * in a Symbol-keyed property. Zod coercion is preserved.
 * 
 * @param schema - Zod schema to validate against
 * 
 * @example
 * // In a route handler:
 * router.get('/', validateQuery(z.object({ page: z.coerce.number().optional() })), async (req, res) => {
 *   const query = getValidatedQuery(req); // Returns { page?: number }
 *   // query.page is a number if provided, not a string
 * });
 */
export function validateQuery<T extends ZodTypeAny>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        return res.status(400).json(createValidationErrorResponse(errors));
      }

      // Store validated data using Symbol-keyed property for Express 5 compatibility
      // This avoids conflicts with Express 5's internal property descriptors
      // and provides a clean separation between raw and validated data
      const validatedData = getValidatedData(req);
      validatedData.query = result.data;
      setValidatedData(req, validatedData);
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Combined validation middleware for params and body
 * 
 * Validates both route parameters and request body against Zod schemas.
 * Useful for PUT/PATCH endpoints with ID params. Zod coercion is preserved.
 * 
 * @param paramSchema - Zod schema to validate params against
 * @param bodySchema - Zod schema to validate body against
 * 
 * @example
 * // In a route handler:
 * router.patch('/:id', validateParamsAndBody(updateParamsSchema, updateBodySchema), async (req, res) => {
 *   const params = getValidatedParams(req); // { id: number }
 *   const body = getValidatedBody(req); // validated body with coerced types
 * });
 */
export function validateParamsAndBody<
  P extends ZodTypeAny,
  B extends ZodTypeAny
>(
  paramSchema: P,
  bodySchema: B
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate params
      const paramsResult = paramSchema.safeParse(req.params);
      if (!paramsResult.success) {
        const errors = formatValidationErrors(paramsResult.error);
        return res.status(400).json(createValidationErrorResponse(errors));
      }

      // Validate body
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        const errors = formatValidationErrors(bodyResult.error);
        return res.status(400).json(createValidationErrorResponse(errors));
      }

      // Store validated data using Symbol-keyed property for Express 5 compatibility
      // This avoids conflicts with Express 5's internal property descriptors
      // and provides a clean separation between raw and validated data
      const validatedData = getValidatedData(req);
      validatedData.params = paramsResult.data;
      validatedData.body = bodyResult.data;
      setValidatedData(req, validatedData);
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Helper function to get validated body data from request
 * 
 * This is the RECOMMENDED way to access validated request body data.
 * Returns Zod-validated and coerced data - types are preserved as specified in the schema.
 * 
 * @param req - Express request object
 * @returns Validated body data or undefined if not yet validated
 * 
 * @example
 * const body = getValidatedBody(req);
 * // body contains validated data with coerced types (numbers stay numbers)
 */
export function getValidatedBody<T>(req: Request): T | undefined {
  return getValidatedData(req).body as T;
}

/**
 * Helper function to get validated params data from request
 * 
 * This is the RECOMMENDED way to access validated route parameters.
 * Returns Zod-validated and coerced data - types are preserved as specified in the schema.
 * 
 * @param req - Express request object
 * @returns Validated params data or undefined if not yet validated
 * 
 * @example
 * const params = getValidatedParams(req);
 * // params contains validated data with coerced types (e.g., id: number)
 */
export function getValidatedParams<T>(req: Request): T | undefined {
  return getValidatedData(req).params as T;
}

/**
 * Helper function to get validated query data from request
 * 
 * This is the RECOMMENDED way to access validated query parameters.
 * Returns Zod-validated and coerced data - types are preserved as specified in the schema.
 * 
 * @param req - Express request object
 * @returns Validated query data or undefined if not yet validated
 * 
 * @example
 * const query = getValidatedQuery(req);
 * // query contains validated data with coerced types
 */
export function getValidatedQuery<T>(req: Request): T | undefined {
  return getValidatedData(req).query as T;
}

/**
 * Type guard to check if error is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Global error handler for validation errors
 * Can be used as a fallback error handler in Express
 */
export function validationErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isZodError(err)) {
    const errors = formatValidationErrors(err);
    res.status(400).json(createValidationErrorResponse(errors));
    return;
  }
  next(err);
}
