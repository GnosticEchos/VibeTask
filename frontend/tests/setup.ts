/**
 * Vitest global setup for Vue 3 + Pinia + TanStack Query.
 * Ensures consistent test environment and mocks for all specs.
 */
import { vi } from 'vitest'

// Stub localStorage for happy-dom / Vue devtools
const storage: Record<string, string> = {}
const localStorageStub = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
  removeItem: vi.fn((key: string) => { delete storage[key] }),
  clear: vi.fn(() => { Object.keys(storage).forEach((k) => delete storage[k]) }),
  get length() { return Object.keys(storage).length },
  key: vi.fn((i: number) => Object.keys(storage)[i] ?? null),
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, writable: true })
}

// Reduce console noise in test runs (optional: set to false for debugging)
const silenceConsole = true
if (silenceConsole) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
}

// Happy-dom may not define scrollTo
if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
  window.scrollTo = vi.fn()
}
