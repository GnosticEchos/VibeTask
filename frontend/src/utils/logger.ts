/**
 * Unified logging utility
 * 
 * Features:
 * - Environment-based log levels (dev gets debug, prod gets warn+)
 * - Semantic helpers for common patterns (API, Store, WebSocket, etc.)
 * - Optional remote error reporting hook
 * 
 * Usage:
 *   import { logger, apiLog, storeLog, wsLog } from '@/utils/logger'
 *   
 *   logger.debug('details...')
 *   logger.info('info message')
 *   logger.warn('warning')
 *   logger.error('oh no')
 *   
 *   apiLog.debug('getDocuments success')
 *   storeLog.info('tasksStore.setItems')
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerConfig {
  level: LogLevel
  enableRemoteReporting: boolean
  onError?: (error: Error, context?: Record<string, unknown>) => void
}

const getEnvLevel = (): LogLevel => {
  if (typeof import.meta === 'undefined') return 'warn'
  return import.meta.env.DEV ? 'debug' : 'warn'
}

const config: LoggerConfig = {
  level: getEnvLevel(),
  enableRemoteReporting: import.meta.env.PROD === true,
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (config.level === 'debug') {
      console.debug(...args)
    }
  },
  
  info: (...args: unknown[]) => {
    if (config.level === 'debug') {
      console.info(...args)
    }
  },
  
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
  
  error: (...args: unknown[]) => {
    console.error(...args)
    if (config.enableRemoteReporting && config.onError) {
      const firstArg = args[0]
      if (firstArg instanceof Error) {
        config.onError(firstArg, { extras: args.slice(1) })
      } else if (typeof firstArg === 'string') {
        config.onError(new Error(firstArg), { extras: args.slice(1) })
      }
    }
  },
  
  setConfig: (newConfig: Partial<LoggerConfig>) => {
    Object.assign(config, newConfig)
  },
  
  getConfig: () => ({ ...config }),
}

// Semantic helpers - prefixed for easy filtering
export const apiLog = {
  debug: (operation: string, details?: unknown) => logger.debug(`[API] ${operation}`, details),
  info:  (operation: string, details?: unknown) => logger.info(`[API] ${operation}`, details),
  warn:  (operation: string, details?: unknown) => logger.warn(`[API] ${operation}`, details),
  error: (operation: string, details?: unknown) => logger.error(`[API] ${operation}`, details),
}

export const storeLog = {
  debug: (store: string, details?: unknown) => logger.debug(`[Store] ${store}`, details),
  info:  (store: string, details?: unknown) => logger.info(`[Store] ${store}`, details),
  warn:  (store: string, details?: unknown) => logger.warn(`[Store] ${store}`, details),
  error: (store: string, details?: unknown) => logger.error(`[Store] ${store}`, details),
}

export const wsLog = {
  debug: (message: string, details?: unknown) => logger.debug(`[WS] ${message}`, details),
  info:  (message: string, details?: unknown) => logger.info(`[WS] ${message}`, details),
  warn:  (message: string, details?: unknown) => logger.warn(`[WS] ${message}`, details),
  error: (message: string, details?: unknown) => logger.error(`[WS] ${message}`, details),
}

export const uiLog = {
  debug: (component: string, details?: unknown) => logger.debug(`[UI] ${component}`, details),
  info:  (component: string, details?: unknown) => logger.info(`[UI] ${component}`, details),
  warn:  (component: string, details?: unknown) => logger.warn(`[UI] ${component}`, details),
  error: (component: string, details?: unknown) => logger.error(`[UI] ${component}`, details),
}

// Backwards compatibility - deprecated, use logger.* instead
export const devLog = config.level === 'debug' ? logger.debug : () => {}
export const devWarn = config.level === 'debug' ? logger.warn : () => {}
export const devDebug = config.level === 'debug' ? logger.debug : () => {}
export const devInfo = config.level === 'debug' ? logger.info : () => {}
export const logError = logger.error
export const logWarn = logger.warn