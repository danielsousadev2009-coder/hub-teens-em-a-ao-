import type { ApiHealth } from '../types/health'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
let csrfToken: string | null = null

export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) {
      if (!response.ok) {
        throw new ApiError(`A API retornou o erro HTTP ${response.status}.`, response.status)
      }
      throw new Error('A API retornou uma resposta inválida.')
    }
    throw error
  }
}

function getErrorMessage(payload: unknown, status: number): { message: string; details?: unknown } {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null
  ) {
    const error = payload.error
    const message = 'message' in error && typeof error.message === 'string'
      ? error.message
      : `A API retornou o erro HTTP ${status}.`
    return {
      message,
      details: 'details' in error ? error.details : undefined,
    }
  }
  return { message: `A API retornou o erro HTTP ${status}.` }
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const response = await fetch(`${apiBaseUrl}/api/auth/csrf/`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })
  const payload = await readResponse(response)
  if (!response.ok) {
    const error = getErrorMessage(payload, response.status)
    throw new ApiError(error.message, response.status, error.details)
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('csrfToken' in payload) ||
    typeof payload.csrfToken !== 'string'
  ) {
    throw new Error('A API não forneceu um token CSRF válido.')
  }
  csrfToken = payload.csrfToken
  return csrfToken
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    headers.set('X-CSRFToken', await getCsrfToken())
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  })
  const payload = await readResponse(response)
  if (!response.ok) {
    const error = getErrorMessage(payload, response.status)
    throw new ApiError(error.message, response.status, error.details)
  }
  return payload as T
}

export async function fetchApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const response = await fetch(`${apiBaseUrl}/api/health/`, {
    headers: { Accept: 'application/json' },
    signal,
    credentials: 'include',
  })

  const payload: unknown = await readResponse(response)
  if (!response.ok) {
    throw new ApiError(`A API retornou o erro HTTP ${response.status}.`, response.status)
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('status' in payload) ||
    typeof payload.status !== 'string' ||
    !('service' in payload) ||
    typeof payload.service !== 'string'
  ) {
    throw new Error('A API retornou uma resposta de saúde inválida.')
  }

  return { status: payload.status, service: payload.service }
}
