import { useCallback, useEffect, useState } from 'react'
import { fetchApiHealth } from '../services/api'
import type { ApiHealth } from '../types/health'

export function useApiHealth() {
  const [health, setHealth] = useState<ApiHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      setHealth(await fetchApiHealth())
    } catch (caughtError) {
      setHealth(null)
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Ocorreu um erro inesperado ao consultar a API.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { health, isLoading, error, refresh }
}
