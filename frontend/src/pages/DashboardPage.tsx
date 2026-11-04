import {
  Bot,
  CalendarDays,
  FolderKanban,
  Globe2,
  Lightbulb,
  Medal,
  Mic,
  Target,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ApiError, apiRequest } from '../services/api'

const modules = [
  { title: 'Banco de Ideias', path: '/ideias', Icon: Lightbulb, color: 'text-amber-500' },
  { title: 'Desafios', path: '/desafios', Icon: Target, color: 'text-rose-500' },
  { title: 'Agenda', path: '/agenda', Icon: CalendarDays, color: 'text-sky-500' },
  { title: 'Mídia Jovem', path: '/midia-jovem', Icon: Mic, color: 'text-violet-500' },
  { title: 'Espaço Maker', path: '/maker', Icon: FolderKanban, color: 'text-emerald-500' },
  { title: 'ODS', path: '/ods', Icon: Globe2, color: 'text-green-500' },
  { title: 'Ranking', path: '/ranking', Icon: Medal, color: 'text-yellow-500' },
  { title: 'IA Mentora', path: '/mentora', Icon: Bot, color: 'text-orange-500' },
  { title: 'Equipes', path: '/equipes', Icon: UsersRound, color: 'text-indigo-500' },
  { title: 'Feira de Projetos', path: '/feira', Icon: FolderKanban, color: 'text-fuchsia-500' },
]

interface DashboardData {
  user: { username: string; first_name: string; role: string }
  summary: Record<string, number>
  achievements: Array<{ id: string; title: string; unlocked: boolean }>
}

function isDashboardData(value: unknown): value is DashboardData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'user' in value &&
    typeof value.user === 'object' &&
    value.user !== null &&
    'summary' in value &&
    typeof value.summary === 'object' &&
    value.summary !== null &&
    'achievements' in value &&
    Array.isArray(value.achievements)
  )
}

export function DashboardPage() {
  const { user, isLoading: isAuthLoading } = useAuth()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setDashboard(null)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    apiRequest<unknown>('/api/dashboard/', { signal: controller.signal })
      .then((payload) => {
        if (!isDashboardData(payload)) throw new Error('O dashboard retornou dados inválidos.')
        setDashboard(payload)
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        if (loadError instanceof ApiError && loadError.status === 401) return
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel.')
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [user])

  const name = dashboard?.user.first_name || dashboard?.user.username || 'Jovem'

  return (
    <div className="mx-auto max-w-5xl">
      <section className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">
          HUB TEENS EM AÇÃO
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Olá, {user && !isAuthLoading ? name : 'Jovem'}! 👋
        </h1>
        <p className="mt-1 text-slate-600">Pronto para transformar ideias em ação?</p>
      </section>

      {user && (
        <section aria-label="Resumo das suas atividades" className="mb-8">
          {isLoading ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600" role="status">
              Carregando suas atividades…
            </p>
          ) : error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
              {error}
            </p>
          ) : dashboard ? (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Ideias', dashboard.summary.ideas],
                  ['Projetos', dashboard.summary.projects],
                  ['Equipes', dashboard.summary.active_teams],
                  ['Pontos', dashboard.summary.points],
                ].map(([label, amount]) => (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4" key={label}>
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-1 text-xl font-bold text-slate-900">{amount}</dd>
                  </div>
                ))}
              </dl>
              {dashboard.achievements.length > 0 && (
                <ul aria-label="Conquistas" className="mt-3 flex flex-wrap gap-2">
                  {dashboard.achievements.map((achievement) => (
                    <li
                      className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                      key={achievement.id}
                    >
                      🏅 {achievement.title}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </section>
      )}

      {!user && !isAuthLoading && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-50 p-4">
          <p className="text-sm leading-6 text-indigo-950">
            O acesso ao piloto é fornecido pela escola. Entre com sua conta para participar.
          </p>
          <Link
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            to="/login"
          >
            Entrar
          </Link>
        </div>
      )}

      <nav aria-label="Módulos do HUB" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {modules.map(({ title, path, Icon, color }) => (
          <Link
            className="group flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-white p-4 text-center shadow-[0_8px_24px_rgba(20,25,55,0.08)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            key={path}
            to={path}
          >
            <Icon aria-hidden="true" className={`size-8 ${color}`} strokeWidth={2.5} />
            <span className="font-semibold text-slate-800 group-hover:text-indigo-700">{title}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
