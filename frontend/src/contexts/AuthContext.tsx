import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiRequest } from '../services/api'

export type AccountRole = 'student' | 'teacher' | 'administrator'

export interface Account {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: AccountRole
}

export interface RegisterPayload {
  username: string
  email: string
  first_name?: string
  last_name?: string
  password: string
  password_confirm: string
}

interface AuthContextValue {
  user: Account | null
  isLoading: boolean
  authError: string | null
  login: (identifier: string, password: string) => Promise<Account>
  register: (payload: RegisterPayload) => Promise<Account>
  logout: () => Promise<void>
  refreshProfile: () => Promise<Account>
}

interface AuthResponse {
  user: Account
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function getProfile(): Promise<Account> {
  return apiRequest<Account>('/api/auth/me/')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const refreshProfile = useCallback(async () => {
    const profile = await getProfile()
    setUser(profile)
    return profile
  }, [])

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const profile = await getProfile()
        if (active) setUser(profile)
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          if (active) {
            setAuthError(error instanceof Error ? error.message : 'Não foi possível verificar a sessão.')
          }
          return
        }

        try {
          const refreshed = await apiRequest<AuthResponse>('/api/auth/refresh/', {
            method: 'POST',
            body: JSON.stringify({}),
          })
          if (active) setUser(refreshed.user)
        } catch (refreshError) {
          if (!(refreshError instanceof ApiError) || refreshError.status !== 401) {
            if (active) {
              setAuthError(
                refreshError instanceof Error
                  ? refreshError.message
                  : 'Não foi possível restaurar a sessão.',
              )
            }
          }
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (identifier: string, password: string) => {
    const response = await apiRequest<AuthResponse>('/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    })
    setUser(response.user)
    setAuthError(null)
    return response.user
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    const response = await apiRequest<AuthResponse>('/api/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setUser(response.user)
    setAuthError(null)
    return response.user
  }, [])

  const logout = useCallback(async () => {
    await apiRequest<null>('/api/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    setUser(null)
    setAuthError(null)
  }, [])

  const value = useMemo(
    () => ({ user, isLoading, authError, login, register, logout, refreshProfile }),
    [user, isLoading, authError, login, register, logout, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return context
}

export function roleHomePath(role: AccountRole): string {
  return `/painel/${role}`
}
