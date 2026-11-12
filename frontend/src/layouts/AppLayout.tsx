import { Bell, House, Lightbulb, UsersRound, Trophy } from 'lucide-react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiRequest } from '../services/api'

export function AppLayout() {
  const { user, logout, authError } = useAuth()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [notificationError, setNotificationError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setUnreadCount(null)
      setNotificationError(null)
      return
    }
    let active = true
    apiRequest<{ unread_count: number }>('/api/notifications/')
      .then((data) => {
        if (active) {
          setUnreadCount(data.unread_count)
          setNotificationError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setUnreadCount(null)
          setNotificationError(error instanceof Error ? error.message : 'Não foi possível carregar notificações.')
        }
      })
    return () => {
      active = false
    }
  }, [user])

  async function handleLogout() {
    setLogoutError(null)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.')
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#7776e7_0%,_#6968cb_40%,_#5655a9_100%)] px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-5xl overflow-hidden rounded-3xl bg-[#f8f9fc] shadow-2xl shadow-indigo-950/20 sm:min-h-[calc(100vh-4rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white sm:px-8">
          <div className="flex items-center gap-3">
            <Lightbulb aria-hidden="true" className="size-7" />
            <Link className="text-lg font-bold tracking-tight" to="/">
              Hub Teens
            </Link>
          </div>
          <nav aria-label="Navegação da conta" className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                <Link
                  aria-label={`${unreadCount ?? 0} notificações não lidas`}
                  className="relative rounded-full p-1 hover:bg-white/10"
                  title="Notificações"
                  to="/notificacoes"
                >
                  <Bell aria-hidden="true" className="size-5" />
                  {unreadCount !== null && unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold">
                      {unreadCount}
                    </span>
                  )}
                </Link>
                <Link className="font-semibold hover:underline" to={`/painel/${user.role}`}>
                  {user.first_name || user.username}
                </Link>
                <button
                  className="rounded-lg border border-white/60 px-3 py-1.5 font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link className="font-semibold hover:underline" to="/login">
                  Entrar
                </Link>
                <Link
                  className="rounded-lg bg-white px-3 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-50"
                  to="/cadastro"
                >
                  Criar conta
                </Link>
              </>
            )}
          </nav>
        </header>
        <main className="min-h-[34rem] px-4 py-7 pb-24 sm:px-8 sm:py-10 sm:pb-24">
          {(authError || logoutError || notificationError) && (
            <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
              {authError ?? logoutError ?? notificationError}
            </p>
          )}
          <Outlet />
        </main>
        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(20,25,55,0.08)] backdrop-blur sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-[min(100%-3rem,1024px)] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:px-5"
        >
          <ul className="mx-auto flex max-w-xl items-center justify-around">
            {[
              { label: 'Início', to: '/', Icon: House },
              { label: 'Ideias', to: '/ideias', Icon: Lightbulb },
              { label: 'Desafios', to: '/desafios', Icon: Bell },
              { label: 'Equipes', to: '/equipes', Icon: UsersRound },
              { label: 'Feira', to: '/feira', Icon: Trophy },
            ].map(({ label, to, Icon }) => (
              <li key={to}>
                <Link
                  className="flex min-w-12 flex-col items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:min-w-20 sm:text-xs"
                  to={to}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
