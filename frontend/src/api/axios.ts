import axios, { AxiosInstance } from 'axios'
import { notifyUnauthorized } from '@/api/unauthorizedHandler'
import { devLog, devWarn, logError } from '@/utils/logger'
import {
  createApiError,
  UnauthorizedError,
  ForbiddenError,
} from '@/api/errors'

let userHasBeenLoggedOut = false
const REDACTED = '***REDACTED***'
const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'authorization',
  'apikey',
  'api-key',
  'x-agent-api-key',
])

function redactSensitive(input: unknown): unknown {
  if (input == null) return input
  if (Array.isArray(input)) return input.map((item) => redactSensitive(item))
  if (typeof input !== 'object') return input

  const source = input as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      output[key] = REDACTED
      continue
    }
    output[key] = redactSensitive(value)
  }
  return output
}

export const axiosApi: AxiosInstance = axios.create({
  baseURL: (() => {
    const raw = import.meta.env.VITE_API_BASE_URL
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      throw new Error('Missing required env var: VITE_API_BASE_URL')
    }
    return `${value}/api/`
  })(),
  timeout: 15000,
  // Add any other configurations you need
  transformResponse: [
    function transformResponse(data) {
      // Handle both string and already-parsed JSON safely
      if (!data) return {}
      if (typeof data === 'string') {
        try {
          return data ? JSON.parse(data) : {}
        } catch (e) {
          devWarn('[Axios] Failed to parse JSON response, returning raw data', e)
          return data
        }
      }
      // If Axios or another middleware already parsed JSON, just return it
      return data
    },
  ],
})

axiosApi.interceptors.request.use(
  (config) => {
    devLog('[Axios] Request:', {
      method: config.method,
      url: config.url,
      data: redactSensitive(config.data),
      params: config.params,
      headers: redactSensitive(config.headers),
    })
    return config
  },
  (error) => {
    logError('[Axios] Request error:', error)
    return Promise.reject(error)
  }
)

export function authorizeAxios(token: string): void {
  userHasBeenLoggedOut = false
  devLog('[Axios] Authorizing with token')
  axiosApi.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

export function deauthorizeAxios() {
  devLog('[Axios] Removing authorization token')
  delete axiosApi.defaults.headers.common['Authorization']
}

axiosApi.interceptors.response.use(
  (response) => {
    devLog('[Axios] Response:', {
      status: response.status,
      url: response.config.url,
      data: redactSensitive(response.data),
    })
    return response
  },
  async (error) => {
    const apiError = createApiError(error)

    if (apiError instanceof UnauthorizedError) {
      devWarn('[Axios] 401 Unauthorized response detected')
      if (!userHasBeenLoggedOut) {
        userHasBeenLoggedOut = true
        notifyUnauthorized()
      }
      return Promise.reject(apiError)
    }

    const url = String(error.config?.url || '')
    const isExpectedAgentRouteRejection = apiError instanceof ForbiddenError && url.includes('/agent/me')

    if (isExpectedAgentRouteRejection) {
      return Promise.reject(apiError)
    }

    logError('[Axios] Response error:', {
      message: apiError.message,
      statusCode: apiError.statusCode,
      url,
      data: redactSensitive(error.response?.data),
    })

    return Promise.reject(apiError)
  },
)
