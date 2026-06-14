export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: Record<string, string>,
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500
  }
  get isServerError(): boolean {
    return this.statusCode >= 500
  }
  getFieldError(field: string): string | undefined {
    return this.errors?.[field]
  }
  hasFieldErrors(): boolean {
    return this.errors !== undefined && Object.keys(this.errors).length > 0
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', errors?: Record<string, string>, originalError?: unknown) {
    super(400, message, errors, originalError)
    this.name = 'BadRequestError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', originalError?: unknown) {
    super(401, message, undefined, originalError)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Access denied', originalError?: unknown) {
    super(403, message, undefined, originalError)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = 'Resource', originalError?: unknown) {
    const label = resource.trim() || 'Resource'
    const message = /not found$/i.test(label) ? label : `${label} not found`
    super(404, message, undefined, originalError)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource already exists', originalError?: unknown) {
    super(409, message, undefined, originalError)
    this.name = 'ConflictError'
  }
}

export class ValidationError extends ApiError {
  constructor(
    message = 'Validation failed',
    errors: Record<string, string> = {},
    originalError?: unknown,
  ) {
    super(400, message, errors, originalError)
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends ApiError {
  constructor(
    message = 'Rate limit exceeded',
    public readonly retryAfter?: number,
    originalError?: unknown,
  ) {
    super(429, message, undefined, originalError)
    this.name = 'RateLimitError'
  }
}

export class ServerError extends ApiError {
  constructor(message = 'Internal server error', statusCode = 500, originalError?: unknown) {
    super(statusCode, message, undefined, originalError)
    this.name = 'ServerError'
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Network error', originalError?: unknown) {
    super(0, message, undefined, originalError)
    this.name = 'NetworkError'
  }
}

function extractMessage(data: unknown): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.error === 'string') return obj.error
    if (typeof obj.message === 'string') return obj.message
  }
  return ''
}

function extractFieldErrors(data: unknown): Record<string, string> | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>
  if (obj.errors && typeof obj.errors === 'object') {
    return obj.errors as Record<string, string>
  }
  return undefined
}

const ERROR_CLASS_BY_STATUS: Record<number, (
  message: string,
  errors: Record<string, string> | undefined,
  originalError: unknown,
  retryAfter?: number,
) => ApiError> = {
  400: (msg, errs, orig) => errs && Object.keys(errs).length > 0
    ? new ValidationError(msg, errs, orig)
    : new BadRequestError(msg, errs, orig),
  401: (msg, _errs, orig) => new UnauthorizedError(msg, orig),
  403: (msg, _errs, orig) => new ForbiddenError(msg, orig),
  404: (msg, _errs, orig) => new NotFoundError(msg || 'Resource', orig),
  409: (msg, _errs, orig) => new ConflictError(msg, orig),
  429: (msg, _errs, orig, after) => new RateLimitError(msg, after, orig),
}

export function createApiError(error: unknown): ApiError {
  const axiosError = error as {
    response?: { status?: number; data?: unknown; headers?: Record<string, string> }
    message?: string
    code?: string
  }

  if (!axiosError.response) {
    return new NetworkError(axiosError.message || 'Network error', error)
  }

  const status = axiosError.response.status || 500
  const data = axiosError.response.data
  const msg = extractMessage(data) || axiosError.message || 'Unknown error'
  const fieldErrors = extractFieldErrors(data)

  const Ctor = ERROR_CLASS_BY_STATUS[status]
  if (Ctor) {
    if (status === 429) {
      const headers = axiosError.response.headers || {}
      const retryAfter = parseInt(headers['retry-after'] || '') || undefined
      return Ctor(msg, fieldErrors, error, retryAfter)
    }
    return Ctor(msg, fieldErrors, error)
  }

  if (status >= 500) {
    return new ServerError(msg, status, error)
  }

  return new ApiError(status, msg, fieldErrors, error)
}