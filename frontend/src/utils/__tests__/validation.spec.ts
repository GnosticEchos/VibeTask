import { describe, it, expect } from 'vitest'
import {
  isValidId,
  validateId,
  isValidProjectId,
  validateProjectId,
  ValidationError,
} from '../validation'

describe('validation', () => {
  describe('isValidId', () => {
    it('returns false for undefined and null', () => {
      expect(isValidId(undefined)).toBe(false)
      expect(isValidId(null)).toBe(false)
    })

    it('returns false for zero and negative numbers', () => {
      expect(isValidId(0)).toBe(false)
      expect(isValidId(-1)).toBe(false)
      expect(isValidId(-100)).toBe(false)
    })

    it('returns false for NaN and non-numeric values', () => {
      expect(isValidId(NaN)).toBe(false)
      expect(isValidId('')).toBe(false)
      expect(isValidId('abc')).toBe(false)
      expect(isValidId({})).toBe(false)
    })

    it('coerces boolean true to 1 (number)', () => {
      expect(isValidId(true)).toBe(true)
      expect(isValidId(false)).toBe(false)
    })

    it('returns true for positive numeric IDs', () => {
      expect(isValidId(1)).toBe(true)
      expect(isValidId(42)).toBe(true)
      expect(isValidId(Number.MAX_SAFE_INTEGER)).toBe(true)
    })

    it('accepts string numbers and coerces correctly', () => {
      expect(isValidId('1')).toBe(true)
      expect(isValidId('99')).toBe(true)
      expect(isValidId('0')).toBe(false)
      expect(isValidId(' 5 ')).toBe(true)
    })
  })

  describe('validateId', () => {
    it('returns numeric ID when valid', () => {
      expect(validateId(1)).toBe(1)
      expect(validateId('42')).toBe(42)
    })

    it('returns defaultValue when invalid', () => {
      expect(validateId(null)).toBeUndefined()
      expect(validateId(undefined, 0)).toBe(0)
      expect(validateId(-1, 99)).toBe(99)
    })
  })

  describe('isValidProjectId', () => {
    it('delegates to isValidId', () => {
      expect(isValidProjectId(1)).toBe(true)
      expect(isValidProjectId(0)).toBe(false)
      expect(isValidProjectId(null)).toBe(false)
      expect(isValidProjectId('7')).toBe(true)
    })
  })

  describe('validateProjectId', () => {
    it('returns number when valid', () => {
      expect(validateProjectId(1)).toBe(1)
      expect(validateProjectId('5')).toBe(5)
    })

    it('throws ValidationError when invalid', () => {
      expect(() => validateProjectId(null)).toThrow(ValidationError)
      expect(() => validateProjectId(0)).toThrow(ValidationError)
      expect(() => validateProjectId('')).toThrow(ValidationError)
      expect(() => validateProjectId(undefined)).toThrow(ValidationError)
    })

    it('ValidationError has correct name and message', () => {
      try {
        validateProjectId(-1)
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError)
        expect((e as ValidationError).name).toBe('ValidationError')
        expect((e as Error).message).toBe('Invalid project ID')
      }
    })
  })

})
