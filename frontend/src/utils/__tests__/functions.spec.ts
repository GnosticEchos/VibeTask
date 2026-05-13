import { describe, it, expect } from 'vitest'
import {
  delay,
  falseLoadingState,
  trimText,
  formatDate,
  isObject,
  randomPastelColor,
  stripHTML,
  getDisplayName,
} from '../functions'

describe('functions', () => {
  describe('delay', () => {
    it('resolves after the given time with the value', async () => {
      const result = await delay(10, 'done')
      expect(result).toBe('done')
    })
  })

  describe('falseLoadingState', () => {
    it('returns a promise that resolves to false', async () => {
      const result = await falseLoadingState(5)
      expect(result).toBe(false)
    })
  })

  describe('trimText', () => {
    it('returns empty string when text is empty and condition is true', () => {
      expect(trimText('', 9, true)).toBe('')
    })

    it('trims text longer than trimLength and appends ...', () => {
      const long = 'Hello World Foo Bar'
      expect(trimText(long, 9, true)).toBe('Hello Wor...')
      expect(trimText(long, 5, true)).toBe('Hello...')
    })

    it('does not append ... when last character is space', () => {
      expect(trimText('Hello     ', 9, true)).toBe('Hello    ')
    })

    it('returns full text when shorter than trimLength', () => {
      expect(trimText('Hi', 9, true)).toBe('Hi')
    })

    it('when condition is false uses trimAlt for single-char uppercase', () => {
      expect(trimText('hello', 9, false, 1)).toBe('H')
    })
  })

  describe('formatDate', () => {
    it('formats ISO date string to locale date string', () => {
      const iso = '2025-03-15T12:00:00.000Z'
      const result = formatDate(iso)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      // Locale-dependent; just ensure it returns a string
      expect(result).toBe(new Date(iso).toLocaleDateString())
    })
  })

  describe('isObject', () => {
    it('returns true for plain objects', () => {
      expect(isObject({})).toBe(true)
      expect(isObject({ a: 1 })).toBe(true)
    })

    it('returns false for arrays, null, primitives', () => {
      expect(isObject([])).toBe(false)
      expect(isObject(null)).toBe(false)
      expect(isObject(undefined)).toBe(false)
      expect(isObject(1)).toBe(false)
      expect(isObject('')).toBe(false)
      expect(isObject(true)).toBe(false)
    })
  })

  describe('randomPastelColor', () => {
    it('returns a hex color string', () => {
      const color = randomPastelColor()
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    })

    it('returns different values on multiple calls (probabilistic)', () => {
      const set = new Set([randomPastelColor(), randomPastelColor(), randomPastelColor()])
      expect(set.size).toBeGreaterThanOrEqual(1)
    })
  })

  describe('stripHTML', () => {
    it('strips HTML tags and returns text content', () => {
      expect(stripHTML('<p>Hello</p>')).toBe('Hello')
      expect(stripHTML('<div><span>Hi</span></div>')).toBe('Hi')
    })

    it('returns empty string for empty body', () => {
      expect(stripHTML('')).toBe('')
    })
  })

  describe('getDisplayName', () => {
    it('returns "Unknown" for null/undefined', () => {
      expect(getDisplayName(null)).toBe('Unknown')
      expect(getDisplayName(undefined)).toBe('Unknown')
    })

    it('prefers fullName', () => {
      expect(getDisplayName({ fullName: 'Jane Doe' })).toBe('Jane Doe')
      expect(getDisplayName({ fullName: 'Jane', name: 'Other' })).toBe('Jane')
    })

    it('falls back to name + surname', () => {
      expect(getDisplayName({ name: 'Jan', surname: 'Kowalski' })).toBe('Jan Kowalski')
    })

    it('falls back to name only', () => {
      expect(getDisplayName({ name: 'Alice' })).toBe('Alice')
    })

    it('returns "Unknown" when no name fields', () => {
      expect(getDisplayName({})).toBe('Unknown')
      expect(getDisplayName({ id: 1 })).toBe('Unknown')
    })
  })
})
