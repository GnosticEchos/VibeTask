/**
 * ID Validation Utilities
 * 
 * This file contains utility functions for validating IDs before using them in API calls.
 * These functions help prevent NaN values from causing 400 Bad Request errors.
 */

/**
 * Custom error for validation failures
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Checks if a value is a valid numeric ID
 * @param id - The value to check
 * @returns boolean - True if the value is a valid ID (number > 0), false otherwise
 */
export function isValidId(id: any): boolean {
  if (id === undefined || id === null) return false;
  const numId = Number(id);
  return !isNaN(numId) && numId > 0;
}

/**
 * Validates an ID and returns either the numeric value or a default value
 * @param id - The ID to validate
 * @param defaultValue - Optional default value to return if the ID is invalid
 * @returns number | undefined - The numeric ID if valid, otherwise the defaultValue or undefined
 */
export function validateId(id: any, defaultValue?: number): number | undefined {
  return isValidId(id) ? Number(id) : defaultValue;
}

/**
 * Checks if a value is a valid project ID
 * @param projectId - The project ID to validate
 * @returns boolean - True if the value is a valid project ID, false otherwise
 */
export function isValidProjectId(projectId: any): boolean {
  // Project IDs must be positive numbers
  return isValidId(projectId);
}

/**
 * Validates a project ID and throws an error if invalid
 * @param projectId - The project ID to validate
 * @returns number - The validated numeric project ID
 * @throws ValidationError if the project ID is invalid
 */
export function validateProjectId(projectId: any): number {
  if (!isValidProjectId(projectId)) {
    throw new ValidationError('Invalid project ID');
  }
  return Number(projectId);
}
