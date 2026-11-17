import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Key,
  LoaderCircle,
  MessageCircle,
  Send,
  Settings,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type AccountRole } from '../contexts/AuthContext'
import { ApiError, apiRequest } from '../services/api'

type ModuleKey =
  | 'ideas'
  | 'challenges'
  | 'agenda'
  | 'youth-media'
  | 'maker'
  | 'ods'
  | 'ranking'
  | 'mentor'
  | 'teams'
  | 'fairs'
  | 'notifications'
type DataRow = Record<string, unknown> & { id: number }

interface ModuleInfo {
  title: string
  description: string
  endpoint: string
}

const moduleInfo: Record<Exclude<ModuleKey, 'mentor'>, ModuleInfo> = {
  ideas: {
    title: 'Banco de Ideias',
    description: 'Publique ideias, explore propostas da comunidade e associe-as aos Objetivos de Desenvolvimento Sustentável.',
    endpoint: '/api/ideas/',
  },
  challenges: {
    title: 'Desafios',
    description: 'Conheça desafios publicados e acompanhe suas entregas.',
    endpoint: '/api/challenges/',
  },
  agenda: {
    title: 'Agenda',
    description: 'Eventos publicados por professores e acompanhe suas inscrições.',
    endpoint: '/api/events/',
  },
  'youth-media': {
    title: 'Mídia Jovem',
    description: 'Envie matérias para moderação e leia conteúdos aprovados.',
    endpoint: '/api/youth-media/',
  },
  maker: {
    title: 'Espaço Maker',
    description: 'Registre projetos reais, etapas e materiais utilizados.',
    endpoint: '/api/projects/',
  },
  ods: {
    title: 'Objetivos de Desenvolvimento Sustentável',
    description: 'Catálogo dos 17 ODS da ONU com links para a fonte oficial.',
    endpoint: '/api/ods/',
  },
  ranking: {
    title: 'Ranking e conquistas',
    description: 'Pontuação baseada em participações aprovadas e registrada no servidor.',
    endpoint: '/api/ranking/',
  },
  teams: {
    title: 'Equipes',
    description: 'Crie equipes, envie convites e gerencie a participação.',
    endpoint: '/api/teams/',
  },
  fairs: {
    title: 'Feira de Projetos',
    description: 'Consulte feiras abertas e inscreva projetos que você criou.',
    endpoint: '/api/fairs/',
  },
  notifications: {
    title: 'Notificações',
    description: 'Acompanhe convites, avaliações e atualizações da sua conta.',
    endpoint: '/api/notifications/',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractRows(payload: unknown): DataRow[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      if (!isRecord(item)) return []
      if (typeof item.id === 'number') return [item as DataRow]
      if (typeof item.position === 'number') return [{ ...item, id: item.position } as DataRow]
      return []
    })
  }
  if (isRecord(payload) && Array.isArray(payload.results)) {
    return payload.results.filter((item): item is DataRow => isRecord(item) && typeof item.id === 'number')
  }
  throw new Error('A API retornou uma lista em formato inesperado.')
}

function rowText(row: DataRow, key: string, fallback = ''): string {
  const value = row[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError && isRecord(error.details)) {
    const first = Object.values(error.details)[0]
    if (typeof first === 'string') return first
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0]
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.'
}

function dateForApi(value: FormDataEntryValue | null): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) throw new Error('Informe uma data válida.')
  return date.toISOString()
}

function FormField({
  label,
  name,
  type = 'text',
  required = true,
  accept,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  accept?: string
}) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={name}>
      {label}
      <input
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        id={name}
        name={name}
        required={required}
        accept={accept}
        type={type}
      />
    </label>
  )
}

function FormTextArea({ label, name, required = true }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={name}>
      {label}
      <textarea
        className="mt-1.5 block min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        id={name}
        name={name}
        required={required}
        rows={3}
      />
    </label>
  )
}

export function FeaturePage({ module }: { module: ModuleKey }) {
  if (module === 'mentor') return <MentorPage />
  return <ResourceModulePage module={module} />
}

function ResourceModulePage({ module }: { module: Exclude<ModuleKey, 'mentor'> }) {
  const { user } = useAuth()
  const info = moduleInfo[module]
  const [rows, setRows] = useState<DataRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const canModerate = user?.role === 'teacher' || user?.role === 'administrator'
  const canCreate = useMemo(() => {
    if (module === 'challenges' || module === 'fairs' || module === 'agenda') return canModerate
    if (module === 'ideas' || module === 'maker' || module === 'teams' || module === 'youth-media') {
      return user?.role === 'student'
    }
    return false
  }, [canModerate, module, user?.role])

  async function reload() {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await apiRequest<unknown>(info.endpoint)
      setRows(extractRows(payload))
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (module === 'ranking' && user?.role === 'student') {
      setRows([])
      setError(null)
      setIsLoading(false)
      return
    }
    void reload()
  }, [info.endpoint, module, user?.role])

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const form = event.currentTarget
    const data = new FormData(form)
    try {
      let payload: Record<string, unknown> | FormData
      if (module === 'ideas') {
        payload = {
          title: String(data.get('title')).trim(),
          description: String(data.get('description')).trim(),
        }
      } else if (module === 'maker') {
        payload = new FormData()
        payload.set('title', String(data.get('title')).trim())
        payload.set('summary', String(data.get('summary')).trim())
        payload.set('description', String(data.get('description')).trim())
        payload.set('materials', String(data.get('materials')).trim())
        const image = data.get('image')
        if (image instanceof File && image.size) payload.set('image', image)
      } else if (module === 'teams') {
        payload = {
          name: String(data.get('name')).trim(),
          description: String(data.get('description')).trim(),
        }
      } else if (module === 'youth-media') {
        payload = new FormData()
        payload.set('title', String(data.get('title')).trim())
        payload.set('body', String(data.get('body')).trim())
        payload.set('category', String(data.get('category')).trim())
        const image = data.get('image')
        if (image instanceof File && image.size) payload.set('image', image)
      } else if (module === 'challenges') {
        payload = {
          title: String(data.get('title')).trim(),
          description: String(data.get('description')).trim(),
          rules: String(data.get('rules')).trim(),
          starts_at: dateForApi(data.get('starts_at')),
          deadline: dateForApi(data.get('deadline')),
          is_published: true,
        }
      } else if (module === 'fairs') {
        payload = {
          title: String(data.get('title')).trim(),
          description: String(data.get('description')).trim(),
          starts_at: dateForApi(data.get('starts_at')),
          ends_at: dateForApi(data.get('ends_at')),
          is_published: true,
        }
      } else if (module === 'agenda') {
        payload = {
          title: String(data.get('title')).trim(),
          description: String(data.get('description')).trim(),
          location: String(data.get('location')).trim(),
          starts_at: dateForApi(data.get('starts_at')),
          ends_at: dateForApi(data.get('ends_at')),
          is_published: true,
        }
      } else {
        return
      }

      await apiRequest(info.endpoint, {
        method: 'POST',
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
      })
      form.reset()
      setNotice('Salvo com sucesso.')
      await reload()
    } catch (submitError) {
      setError(apiErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  async function runAction(path: string, body?: Record<string, unknown>): Promise<boolean> {
    setError(null)
    setNotice(null)
    try {
      await apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      })
      setNotice('Ação concluída.')
      await reload()
      return true
    } catch (actionError) {
      setError(apiErrorMessage(actionError))
      return false
    }
  }

  const filteredRows = rows.filter((row) =>
    `${rowText(row, 'title')} ${rowText(row, 'name')} ${rowText(row, 'description')}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  )

  return (
    <section className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Módulo do HUB</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{info.title}</h1>
        <p className="mt-3 leading-6 text-slate-600">{info.description}</p>
      </header>

      {canCreate && (
        <form className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={(event) => void submitCreate(event)}>
          <h2 className="font-semibold text-slate-900">
            {module === 'ideas' ? 'Compartilhe uma ideia' :
              module === 'maker' ? 'Registrar projeto' :
                module === 'teams' ? 'Criar equipe' :
                  module === 'youth-media' ? 'Enviar matéria para moderação' :
                    module === 'challenges' ? 'Criar desafio' :
                      module === 'fairs' ? 'Criar feira de projetos' : 'Adicionar evento à agenda'}
          </h2>
          {(module === 'ideas' || module === 'maker' || module === 'youth-media' || module === 'challenges' || module === 'fairs' || module === 'agenda') && (
            <FormField label="Título" name="title" />
          )}
          {module === 'teams' && <FormField label="Nome da equipe" name="name" />}
          {module === 'teams' && <FormTextArea label="Descrição" name="description" required={false} />}
          {(module === 'ideas' || module === 'maker' || module === 'challenges' || module === 'fairs' || module === 'agenda') && (
            <FormTextArea label="Descrição" name="description" />
          )}
          {module === 'maker' && (
            <>
              <FormField label="Resumo" name="summary" />
              <FormTextArea label="Materiais utilizados" name="materials" required={false} />
              <FormField
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                label="Imagem do projeto (opcional; JPEG, PNG ou WebP; até 5 MB)"
                name="image"
                required={false}
                type="file"
              />
              <p className="text-xs leading-5 text-slate-500">
                O upload depende do bucket privado do Supabase Storage configurado no backend.
              </p>
            </>
          )}
          {module === 'challenges' && <FormTextArea label="Regras do desafio" name="rules" />}
          {module === 'youth-media' && (
            <>
              <FormField label="Categoria" name="category" required={false} />
              <FormTextArea label="Matéria" name="body" />
              <FormField
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                label="Imagem (JPEG, PNG ou WebP; até 5 MB)"
                name="image"
                type="file"
                required={false}
              />
              <p className="text-xs leading-5 text-slate-500">
                O upload fica indisponível até configurar o Supabase Storage no backend. Sua matéria pode ser enviada sem imagem.
              </p>
            </>
          )}
          {(module === 'challenges' || module === 'fairs' || module === 'agenda') && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Início" name="starts_at" type="datetime-local" />
              <FormField label={module === 'challenges' ? 'Prazo final' : module === 'fairs' ? 'Fim' : 'Término'} name={module === 'challenges' ? 'deadline' : module === 'fairs' ? 'ends_at' : 'ends_at'} type="datetime-local" />
            </div>
          )}
          {module === 'agenda' && <FormField label="Local" name="location" required={false} />}
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      )}

      {module === 'teams' && <InvitationList onAction={runAction} />}

      {module !== 'ods' && module !== 'ranking' && module !== 'notifications' && (
        <label className="mb-4 block text-sm font-medium text-slate-700">
          Pesquisar
          <input
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Pesquisar em ${info.title.toLocaleLowerCase()}`}
            type="search"
            value={query}
          />
        </label>
      )}

      {module === 'ranking' && <MyPointsSummary />}
      {module === 'notifications' && rows.some((row) => row.read_at === null) && (
        <button
          className="mb-4 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          onClick={() => void runAction('/api/notifications/mark_all_read/')}
          type="button"
        >
          Marcar todas como lidas
        </button>
      )}

      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {isLoading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-slate-600" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Carregando conteúdo salvo…
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {module === 'ranking' && user?.role === 'student'
            ? 'O ranking coletivo está desativado neste piloto para proteger os dados dos alunos. Seus pontos pessoais aparecem acima.'
            : query ? 'Nenhum resultado para essa pesquisa.' : 'Ainda não há conteúdo disponível neste módulo.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={row.id}>
              {module === 'ods' ? (
                <OdsCard row={row} />
              ) : module === 'ranking' ? (
                <p className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">{rowText(row, 'position')}. {rowText(row, 'username')}</span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-800">{rowText(row, 'points')} pts</span>
                </p>
              ) : module === 'notifications' ? (
                <NotificationCard row={row} onAction={runAction} />
              ) : (
                <ResourceCard
                  canModerate={canModerate}
                  module={module}
                  onAction={runAction}
                  row={row}
                  userId={user?.id}
                  userRole={user?.role ?? 'student'}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function OdsCard({ row }: { row: DataRow }) {
  const number = rowText(row, 'number')
  const url = rowText(row, 'official_url')
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">ODS {number}</p>
        <h2 className="mt-1 font-semibold text-slate-900">{rowText(row, 'title')}</h2>
      </div>
      <a
        aria-label={`Fonte oficial do ODS ${number}`}
        className="rounded-full p-2 text-indigo-700 hover:bg-indigo-50"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        <ArrowUpRight aria-hidden="true" className="size-5" />
      </a>
    </div>
  )
}

function NotificationCard({ row, onAction }: { row: DataRow; onAction: (path: string, body?: Record<string, unknown>) => Promise<boolean> }) {
  const read = Boolean(row.read_at)
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-slate-900">{rowText(row, 'title')}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{rowText(row, 'message')}</p>
        {!read && <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">Não lida</span>}
      </div>
      {!read && (
        <button
          aria-label="Marcar notificação como lida"
          className="rounded-full p-2 text-indigo-700 hover:bg-indigo-50"
          onClick={() => void onAction(`/api/notifications/${row.id}/mark_read/`)}
          type="button"
        >
          <Check aria-hidden="true" className="size-5" />
        </button>
      )}
    </div>
  )
}

function ResourceCard({
  module,
  row,
  canModerate,
  userId,
  userRole,
  onAction,
}: {
  module: Exclude<ModuleKey, 'mentor' | 'ods' | 'ranking' | 'notifications'>
  row: DataRow
  canModerate: boolean
  userId?: number
  userRole: AccountRole
  onAction: (path: string, body?: Record<string, unknown>) => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const title = rowText(row, 'title', rowText(row, 'name', `Item ${row.id}`))
  const description = rowText(row, 'description', rowText(row, 'summary', rowText(row, 'body')))
  const status = rowText(row, 'status', row.is_published === true ? 'Publicado' : '')
  const startsAt = Date.parse(rowText(row, 'starts_at'))
  const endsAt = Date.parse(rowText(row, module === 'challenges' ? 'deadline' : 'ends_at'))
  const isChallengeOpen = module === 'challenges' && row.is_published === true
    && startsAt <= Date.now() && endsAt > Date.now()
  const isFairOpen = module === 'fairs' && startsAt <= Date.now() && endsAt >= Date.now()
  const isEventOpen = module === 'agenda'
    && startsAt <= Date.now()
    && endsAt > Date.now()

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {rowText(row, 'owner_username', rowText(row, 'author_username')) && (
            <p className="mt-1 text-xs text-slate-500">
              por {rowText(row, 'owner_username', rowText(row, 'author_username'))}
            </p>
          )}
        </div>
        {status && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">{status}</span>}
      </div>
      {description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{description}</p>}
      {rowText(row, 'rules') && <p className="mt-2 text-sm text-slate-600"><strong>Regras:</strong> {rowText(row, 'rules')}</p>}
      {rowText(row, 'materials') && <p className="mt-2 text-sm text-slate-600"><strong>Materiais:</strong> {rowText(row, 'materials')}</p>}
      {rowText(row, 'location') && <p className="mt-2 text-sm text-slate-600">Local: {rowText(row, 'location')}</p>}
      {rowText(row, 'deadline') && <p className="mt-2 text-sm text-slate-600">Prazo: {new Date(rowText(row, 'deadline')).toLocaleString('pt-BR')}</p>}
      {typeof row.image === 'string' && row.image && (
        <img alt="" className="mt-3 max-h-64 w-full rounded-xl object-cover" loading="lazy" src={row.image} />
      )}

      {module === 'challenges' && userRole === 'student' && isChallengeOpen && (
        <form
          className="mt-4 space-y-2 border-t border-slate-100 pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!text.trim()) return
            void onAction('/api/challenge-submissions/', { challenge: row.id, response: text.trim() })
              .then((saved) => {
                if (saved) setText('')
              })
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Sua participação
            <textarea className="mt-1.5 block w-full rounded-lg border border-slate-300 p-2.5" onChange={(event) => setText(event.target.value)} required rows={2} value={text} />
          </label>
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700" type="submit">Enviar participação</button>
        </form>
      )}
      {module === 'challenges' && userRole === 'student' && !isChallengeOpen && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
          {Number.isFinite(startsAt) && startsAt > Date.now()
            ? `Participações abrem em ${new Date(startsAt).toLocaleString('pt-BR')}.`
            : 'O período de participação está encerrado.'}
        </p>
      )}

      {module === 'fairs' && userRole === 'student' && isFairOpen && (
        <FairEntryForm fairId={row.id} onAction={onAction} userId={userId} />
      )}
      {module === 'fairs' && userRole === 'student' && !isFairOpen && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
          {Number.isFinite(startsAt) && startsAt > Date.now()
            ? `As inscrições abrem em ${new Date(startsAt).toLocaleString('pt-BR')}.`
            : 'O período de inscrição está encerrado.'}
        </p>
      )}

      {module === 'agenda' && userRole === 'student' && isEventOpen && (
        <button className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700" onClick={() => void onAction('/api/event-registrations/', { event: row.id })} type="button">
          Inscrever-se no evento
        </button>
      )}
      {module === 'agenda' && userRole === 'student' && !isEventOpen && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">Este evento já foi encerrado.</p>
      )}

      {module === 'teams' && userRole === 'student' && row.owner === userId && (
        <TeamInviteForm teamId={row.id} onInvite={onAction} />
      )}

      {module === 'challenges' && canModerate && (
        <ChallengeSubmissionsReview challengeId={row.id} onAction={onAction} />
      )}

      {module === 'fairs' && canModerate && (
        <FairEntriesReview fairId={row.id} onAction={onAction} />
      )}

      {module === 'youth-media' && canModerate && status === 'pending' && (
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => void onAction(`/api/youth-media/${row.id}/moderate/`, { status: 'published' })} type="button">Aprovar publicação</button>
          <button className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => void onAction(`/api/youth-media/${row.id}/moderate/`, { status: 'rejected' })} type="button">Não aprovar</button>
        </div>
      )}

      {module === 'ideas' && canModerate && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Moderação:
          </span>
          {status !== 'approved' && (
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              onClick={() => void onAction(`/api/ideas/${row.id}/moderate/`, { status: 'approved' })}
              type="button"
            >
              Aprovar ideia
            </button>
          )}
          {status !== 'needs_revision' && (
            <button
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              onClick={() => void onAction(`/api/ideas/${row.id}/moderate/`, { status: 'needs_revision' })}
              type="button"
            >
              Pedir revisão
            </button>
          )}
          {status !== 'archived' && (
            <button
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void onAction(`/api/ideas/${row.id}/moderate/`, { status: 'archived' })}
              type="button"
            >
              Arquivar
            </button>
          )}
        </div>
      )}
      {typeof row.url === 'string' && row.url.length > 0 && (
        <Link className="mt-3 inline-flex text-sm font-semibold text-indigo-700 hover:underline" to={row.url}>Abrir</Link>
      )}
      {module === 'ideas' && (
        <IdeaComments
          allowComment={row.status === 'published' || row.status === 'approved'}
          ideaId={row.id}
          initialCount={Number(row.comments_count) || 0}
        />
      )}
    </div>
  )
}

function ChallengeSubmissionsReview({
  challengeId,
  onAction,
}: {
  challengeId: number
  onAction: (path: string, body?: Record<string, unknown>) => Promise<boolean>
}) {
  const [submissions, setSubmissions] = useState<DataRow[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadSubmissions() {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await apiRequest<unknown>('/api/challenge-submissions/')
      const all = extractRows(payload)
      setSubmissions(all.filter((item) => item.challenge === challengeId))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleToggle() {
    if (!isOpen) {
      void loadSubmissions()
    }
    setIsOpen(!isOpen)
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
        onClick={handleToggle}
        type="button"
      >
        <span>{isOpen ? 'Ocultar entregas dos alunos' : 'Avaliar entregas dos alunos neste desafio'}</span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Painel do Professor — Entregas dos Alunos
          </p>
          {isLoading && (
            <p className="text-xs text-slate-500">Carregando entregas recebidas…</p>
          )}
          {error && <p className="text-xs text-rose-700">{error}</p>}
          {!isLoading && !error && submissions.length === 0 && (
            <p className="text-xs text-slate-500">Nenhum aluno enviou participação para este desafio ainda.</p>
          )}
          {!isLoading &&
            submissions.map((sub) => {
              const subStatus = String(sub.status || '')
              const isPending = subStatus === 'submitted' || subStatus === 'needs_revision'
              return (
                <div
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs"
                  key={sub.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Aluno: {String(sub.student_username || 'Estudante')}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        subStatus === 'accepted'
                          ? 'bg-emerald-100 text-emerald-800'
                          : subStatus === 'needs_revision'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {subStatus === 'accepted'
                        ? 'Aprovada (+10 pts)'
                        : subStatus === 'needs_revision'
                        ? 'Revisão solicitada'
                        : 'Aguardando avaliação'}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-700">
                    {String(sub.response || '')}
                  </p>
                  {isPending && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        onClick={async () => {
                          const ok = await onAction(`/api/challenge-submissions/${sub.id}/review/`, {
                            status: 'accepted',
                          })
                          if (ok) void loadSubmissions()
                        }}
                        type="button"
                      >
                        Aprovar entrega (+10 pts)
                      </button>
                      <button
                        className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        onClick={async () => {
                          const ok = await onAction(`/api/challenge-submissions/${sub.id}/review/`, {
                            status: 'needs_revision',
                          })
                          if (ok) void loadSubmissions()
                        }}
                        type="button"
                      >
                        Pedir revisão
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

function FairEntriesReview({
  fairId,
  onAction,
}: {
  fairId: number
  onAction: (path: string, body?: Record<string, unknown>) => Promise<boolean>
}) {
  const [entries, setEntries] = useState<DataRow[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadEntries() {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await apiRequest<unknown>('/api/fair-entries/')
      const all = extractRows(payload)
      setEntries(all.filter((item) => item.fair === fairId))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleToggle() {
    if (!isOpen) {
      void loadEntries()
    }
    setIsOpen(!isOpen)
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
        onClick={handleToggle}
        type="button"
      >
        <span>{isOpen ? 'Ocultar projetos inscritos' : 'Avaliar projetos inscritos nesta feira'}</span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Painel do Professor — Inscrições de Projetos
          </p>
          {isLoading && (
            <p className="text-xs text-slate-500">Carregando inscrições…</p>
          )}
          {error && <p className="text-xs text-rose-700">{error}</p>}
          {!isLoading && !error && entries.length === 0 && (
            <p className="text-xs text-slate-500">Nenhum projeto inscrito nesta feira até o momento.</p>
          )}
          {!isLoading &&
            entries.map((entry) => {
              const entryStatus = String(entry.status || '')
              return (
                <div
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs"
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Projeto: {String(entry.project_title || `Projeto #${entry.project}`)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        entryStatus === 'selected'
                          ? 'bg-emerald-100 text-emerald-800'
                          : entryStatus === 'not_selected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {entryStatus === 'selected'
                        ? 'Selecionado para a feira'
                        : entryStatus === 'not_selected'
                        ? 'Não selecionado'
                        : 'Aguardando avaliação'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Inscrito por: {String(entry.submitter_username || 'Aluno')}
                  </p>
                  {entryStatus === 'submitted' && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        onClick={async () => {
                          const ok = await onAction(`/api/fair-entries/${entry.id}/review/`, {
                            status: 'selected',
                          })
                          if (ok) void loadEntries()
                        }}
                        type="button"
                      >
                        Selecionar para a feira
                      </button>
                      <button
                        className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        onClick={async () => {
                          const ok = await onAction(`/api/fair-entries/${entry.id}/review/`, {
                            status: 'not_selected',
                          })
                          if (ok) void loadEntries()
                        }}
                        type="button"
                      >
                        Não selecionar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

function FairEntryForm({
  fairId,
  userId,
  onAction,
}: {
  fairId: number
  userId?: number
  onAction: (path: string, body?: Record<string, unknown>) => Promise<boolean>
}) {
  const [projects, setProjects] = useState<DataRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiRequest<unknown>('/api/projects/')
      .then(extractRows)
      .then((items) => setProjects(items.filter((project) => project.owner === userId)))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)))
      .finally(() => setIsLoading(false))
  }, [userId])

  if (isLoading) return <p className="mt-4 text-sm text-slate-500" role="status">Carregando seus projetos…</p>
  if (error) return <p className="mt-4 text-sm text-rose-800" role="alert">{error}</p>
  if (!projects.length) {
    return (
      <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
        Crie um projeto no <Link className="font-semibold text-indigo-700 hover:underline" to="/maker">Espaço Maker</Link> para inscrevê-lo.
      </p>
    )
  }

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
      onSubmit={async (event) => {
        event.preventDefault()
        const formElement = event.currentTarget
        const form = new FormData(formElement)
        const saved = await onAction('/api/fair-entries/', {
          fair: fairId,
          project: Number(form.get('project')),
        })
        if (saved) formElement.reset()
      }}
    >
      <label className="text-sm font-medium text-slate-700">
        Seu projeto
        <select className="mt-1 block max-w-full rounded-lg border border-slate-300 px-3 py-2" name="project" required>
          {projects.map((project) => <option key={project.id} value={project.id}>{rowText(project, 'title')}</option>)}
        </select>
      </label>
      <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="submit">Inscrever projeto</button>
    </form>
  )
}

function IdeaComments({
  ideaId,
  initialCount,
  allowComment,
}: {
  ideaId: number
  initialCount: number
  allowComment: boolean
}) {
  const [comments, setComments] = useState<DataRow[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function toggleComments() {
    if (isOpen) {
      setIsOpen(false)
      return
    }
    setIsOpen(true)
    setIsLoading(true)
    setError(null)
    try {
      setComments(extractRows(await apiRequest<unknown>(`/api/ideas/${ideaId}/comments/`)))
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const comment = await apiRequest<DataRow>(`/api/ideas/${ideaId}/comments/`, {
        method: 'POST',
        body: JSON.stringify({ body: text.trim() }),
      })
      setComments((current) => [...current, comment])
      setText('')
    } catch (submitError) {
      setError(apiErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4 border-t border-slate-100 pt-3">
      <button
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700"
        onClick={() => void toggleComments()}
        type="button"
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        {comments.length || initialCount} comentários
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3">
          {error && <p className="text-sm text-rose-800" role="alert">{error}</p>}
          {isLoading ? (
            <p className="text-sm text-slate-500" role="status">Carregando comentários…</p>
          ) : comments.map((comment) => (
            <article className="rounded-lg bg-slate-50 p-3" key={comment.id}>
              <p className="text-xs font-semibold text-slate-700">{rowText(comment, 'author_username')}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{rowText(comment, 'body')}</p>
            </article>
          ))}
          {allowComment ? (
            <form className="flex items-end gap-2" onSubmit={(event) => void submitComment(event)}>
              <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
                Comentar
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  maxLength={2000}
                  onChange={(event) => setText(event.target.value)}
                  required
                  value={text}
                />
              </label>
              <button
                aria-label="Enviar comentário"
                className="rounded-lg bg-indigo-600 p-2.5 text-white disabled:opacity-50"
                disabled={busy || !text.trim()}
                type="submit"
              >
                <Send aria-hidden="true" className="size-4" />
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Comentários ficam disponíveis quando a ideia for publicada.</p>
          )}
        </div>
      )}
    </section>
  )
}

function TeamInviteForm({
  teamId,
  onInvite,
}: {
  teamId: number
  onInvite: (path: string, body?: Record<string, unknown>) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {open ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (event) => {
          event.preventDefault()
          const formElement = event.currentTarget
          const data = new FormData(formElement)
          const invited = await onInvite(`/api/teams/${teamId}/invite/`, { username: String(data.get('username')).trim() })
          if (invited) {
            formElement.reset()
            setOpen(false)
          }
        }}>
          <label className="text-sm font-medium text-slate-700">
            Nome de usuário do aluno
            <input className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" name="username" required />
          </label>
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="submit">Enviar convite</button>
        </form>
      ) : (
        <button className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:underline" onClick={() => setOpen(true)} type="button">
          <UserPlus aria-hidden="true" className="size-4" /> Convidar integrante
        </button>
      )}
    </div>
  )
}

function InvitationList({ onAction }: { onAction: (path: string, body?: Record<string, unknown>) => Promise<boolean> }) {
  const [invitations, setInvitations] = useState<DataRow[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    apiRequest<unknown>('/api/team-invitations/')
      .then(extractRows)
      .then(setInvitations)
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)))
  }, [])
  return (
    <section className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <h2 className="font-semibold text-indigo-950">Convites recebidos</h2>
      {error && <p className="mt-2 text-sm text-rose-800" role="alert">{error}</p>}
      <ul className="mt-3 space-y-2">
        {invitations.map((invite) => (
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3" key={invite.id}>
            <span className="text-sm text-slate-700">{rowText(invite, 'team_name')}</span>
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                void onAction(`/api/team-invitations/${invite.id}/accept/`).then((accepted) => {
                  if (accepted) setInvitations((current) => current.filter((item) => item.id !== invite.id))
                })
              }}
              type="button"
            >
              Aceitar
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MyPointsSummary() {
  const [points, setPoints] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    apiRequest<{ total: number }>('/api/points/me/')
      .then((response) => setPoints(response.total))
      .catch((loadError: unknown) => {
        setPoints(null)
        setError(apiErrorMessage(loadError))
      })
  }, [])
  return (
    <>
      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
        Seus pontos registrados: <strong>{points === null ? 'indisponível' : points}</strong>. Uma participação aprovada em desafio vale 10 pontos.
      </p>
    </>
  )
}

interface ProviderStatus {
  id: 'gemini' | 'miniroot' | 'groq' | 'ollama'
  name?: string
  configured: boolean
  isDefault?: boolean
  status?: string
  statusMessage?: string
}

interface MentorMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface MentorConversation {
  id: number
  title: string
  provider: ProviderStatus['id']
  messages: MentorMessage[]
}

interface AdminAiProvider {
  id: string
  name: string
  isConfigured: boolean
  maskedKey?: string | null
  model: string
  supportedModels: { id: string; name: string }[]
  status: string
  statusMessage?: string
  baseUrl?: string
}

interface AdminAiConfig {
  activeProvider: string
  providers: {
    gemini: AdminAiProvider
    miniroot: AdminAiProvider
    groq: AdminAiProvider
    ollama: AdminAiProvider
  }
}

function MentorPage() {
  const { user } = useAuth()
  const canManageAi = user?.role === 'teacher' || user?.role === 'administrator'

  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [notice, setNotice] = useState('')
  const [provider, setProvider] = useState<ProviderStatus['id'] | ''>('')
  const [conversations, setConversations] = useState<MentorConversation[]>([])
  const [active, setActive] = useState<MentorConversation | null>(null)
  const [message, setMessage] = useState('')
  const [externalConsent, setExternalConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Admin panel state
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [adminConfig, setAdminConfig] = useState<AdminAiConfig | null>(null)
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('')
  const [geminiModelInput, setGeminiModelInput] = useState('gemini-2.0-flash')
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [adminSuccessMessage, setAdminSuccessMessage] = useState<string | null>(null)

  async function load() {
    try {
      const [providerData, conversationData] = await Promise.all([
        apiRequest<{ providers: ProviderStatus[]; activeProvider?: string; external_data_notice: string }>('/api/mentor/providers/'),
        apiRequest<unknown>('/api/mentor/conversations/'),
      ])
      setProviders(providerData.providers)
      setNotice(providerData.external_data_notice)

      // Auto-select Gemini or first configured provider
      const defaultProv = providerData.providers.find((p) => p.id === 'gemini' && p.configured) ||
        providerData.providers.find((p) => p.configured)
      if (defaultProv && !provider) {
        setProvider(defaultProv.id)
      }

      const saved = extractRows(conversationData) as unknown as MentorConversation[]
      setConversations(saved)
      if (active) setActive(saved.find((item) => item.id === active.id) ?? null)
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    }
  }

  async function loadAdminConfig() {
    if (!canManageAi) return
    try {
      const data = await apiRequest<AdminAiConfig>('/api/mentor/admin/config/')
      setAdminConfig(data)
      if (data.providers?.gemini?.model) {
        setGeminiModelInput(data.providers.gemini.model)
      }
    } catch {
      // Non-fatal if config endpoint is restricted
    }
  }

  useEffect(() => {
    void load()
    if (canManageAi) {
      void loadAdminConfig()
    }
  }, [canManageAi])

  const selectedProvider = providers.find((item) => item.id === provider)
  const hasConfiguredProvider = providers.some((item) => item.configured)

  async function handleTestGemini() {
    setIsTesting(true)
    setTestStatus(null)
    try {
      const res = await apiRequest<{ success: boolean; message: string; latencyMs?: number }>('/api/mentor/admin/test/', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: geminiApiKeyInput.trim() || undefined,
          model: geminiModelInput,
        }),
      })
      setTestStatus(res)
    } catch (err) {
      setTestStatus({ success: false, message: apiErrorMessage(err) })
    } finally {
      setIsTesting(false)
    }
  }

  async function handleSaveAiConfig() {
    setIsSaving(true)
    setAdminSuccessMessage(null)
    setError(null)
    try {
      const updated = await apiRequest<AdminAiConfig>('/api/mentor/admin/config/', {
        method: 'POST',
        body: JSON.stringify({
          activeProvider: 'gemini',
          geminiApiKey: geminiApiKeyInput.trim() || undefined,
          geminiModel: geminiModelInput,
        }),
      })
      setAdminConfig(updated)
      setGeminiApiKeyInput('') // Clear input after saving so secret is not lingering in field
      setAdminSuccessMessage('Configuração do Google Gemini salva com sucesso! O provedor está ativo.')
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function createConversation() {
    if (!provider) return
    setBusy(true)
    setError(null)
    try {
      const created = await apiRequest<MentorConversation>('/api/mentor/conversations/', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      })
      setActive(created)
      setConversations((current) => [created, ...current])
    } catch (createError) {
      setError(apiErrorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active || !message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const response = await apiRequest<{ conversation: MentorConversation; messages: MentorMessage[] }>(
        `/api/mentor/conversations/${active.id}/chat/`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: message.trim(),
            external_data_consent: externalConsent,
          }),
        },
      )
      setActive(response.conversation)
      setConversations((current) => current.map((item) => item.id === active.id ? response.conversation : item))
      setMessage('')
    } catch (sendError) {
      setError(apiErrorMessage(sendError))
    } finally {
      setBusy(false)
    }
  }

  async function deleteConversation(conversationId: number) {
    try {
      await apiRequest(`/api/mentor/conversations/${conversationId}/`, { method: 'DELETE' })
      setConversations((current) => current.filter((item) => item.id !== conversationId))
      if (active?.id === conversationId) setActive(null)
    } catch (deleteError) {
      setError(apiErrorMessage(deleteError))
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">HUB TEENS EM AÇÃO</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">IA Mentora</h1>
          <p className="mt-2 text-slate-600">
            Assistente inteligente com suporte ao Google Gemini como provedor principal temporário.
          </p>
        </div>
        {canManageAi && (
          <button
            className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            onClick={() => {
              setShowAdminPanel(!showAdminPanel)
              if (!adminConfig) void loadAdminConfig()
            }}
            type="button"
          >
            <Settings className="size-4" />
            <span>{showAdminPanel ? 'Ocultar Configurações de IA' : 'Configurar Provedores de IA'}</span>
            {showAdminPanel ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </header>

      {/* Admin IA Management Panel */}
      {canManageAi && showAdminPanel && (
        <div className="rounded-2xl border border-indigo-200 bg-slate-50 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-900">
            <Sparkles className="size-5 text-indigo-600" />
            <h2 className="text-lg font-bold">Painel de Gerenciamento da Inteligência Artificial</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Configure a chave de API e o modelo do Google Gemini. A chave é gravada com segurança no backend e nunca é exposta.
          </p>

          {adminSuccessMessage && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800" role="status">
              ✓ {adminSuccessMessage}
            </p>
          )}

          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {/* Google Gemini Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Google Gemini (Principal)</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${adminConfig?.providers?.gemini?.isConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {adminConfig?.providers?.gemini?.isConfigured ? 'Ativo e Configurado' : 'Aguardando Chave'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Provedor principal ativo temporariamente.
                {adminConfig?.providers?.gemini?.maskedKey && (
                  <span className="ml-1 text-slate-700 font-mono font-medium">Chave atual: {adminConfig.providers.gemini.maskedKey}</span>
                )}
              </p>

              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Chave de API do Gemini (API Key)
                  <div className="mt-1 relative">
                    <Key className="absolute left-3 top-2.5 size-4 text-slate-400" />
                    <input
                      className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-mono outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                      placeholder={adminConfig?.providers?.gemini?.isConfigured ? 'Digite para alterar a chave atual…' : 'Cole sua chave do Google AI Studio…'}
                      type="password"
                      value={geminiApiKeyInput}
                    />
                  </div>
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Modelo do Gemini
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
                    onChange={(e) => setGeminiModelInput(e.target.value)}
                    value={geminiModelInput}
                  >
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Recomendado - Mais rápido e moderno)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Equilibrado)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Maior profundidade de raciocínio)</option>
                  </select>
                </label>

                {testStatus && (
                  <div className={`rounded-lg p-2.5 text-xs font-medium ${testStatus.success ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-rose-200 bg-rose-50 text-rose-800'}`}>
                    {testStatus.message}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    disabled={isTesting}
                    onClick={() => void handleTestGemini()}
                    type="button"
                  >
                    {isTesting ? 'Testando conexão…' : 'Testar Conexão'}
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    disabled={isSaving}
                    onClick={() => void handleSaveAiConfig()}
                    type="button"
                  >
                    {isSaving ? 'Salvando…' : 'Salvar no Backend'}
                  </button>
                </div>
              </div>
            </div>

            {/* MiniRoot Information Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">MiniRoot AI</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  Em Manutenção / Diagnóstico
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                A integração técnica com o <strong>MiniRoot</strong> está preservada no código do backend em estrutura modular, aguardando validação de endpoints e modelo para reparo futuro.
              </p>
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                <p>• <strong>Status:</strong> Preservado para reparo futuro</p>
                <p>• <strong>Provedor ativo:</strong> Google Gemini</p>
                <p>• <strong>Ação necessária:</strong> Definir documentação de endpoints oficiais e credenciais do servidor MiniRoot.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student / User Advice Box */}
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
        {notice || 'Não compartilhe dados pessoais, informações sensíveis ou dados de outros estudantes. Provedores externos recebem as mensagens após consentimento.'}
      </p>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}

      {providers.length > 0 && !hasConfiguredProvider && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="status">
          <p className="font-bold">Nenhum provedor de IA ativo no momento.</p>
          <p className="mt-1 text-xs text-amber-800">
            {canManageAi
              ? 'Abra o painel "Configurar Provedores de IA" acima para inserir sua chave do Google Gemini e ativá-lo imediatamente.'
              : 'O administrador da plataforma está configurando a chave do Google Gemini. Em instantes estará liberado.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Provedor de IA
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm outline-none focus:border-indigo-500"
              onChange={(event) => setProvider(event.target.value as ProviderStatus['id'])}
              value={provider}
            >
              <option value="">Selecione um provedor</option>
              {providers.map((item) => {
                const label = item.id === 'gemini'
                  ? 'Google Gemini (Recomendado)'
                  : item.id === 'miniroot'
                  ? 'MiniRoot AI (Em manutenção)'
                  : item.id === 'groq'
                  ? 'Groq'
                  : 'Ollama (Local)'
                const disabled = !item.configured
                return (
                  <option disabled={disabled} key={item.id} value={item.id}>
                    {label} {item.configured ? '✓' : '(não configurado)'}
                  </option>
                )
              })}
            </select>
          </label>

          <button
            className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            disabled={!selectedProvider?.configured || busy}
            onClick={() => void createConversation()}
            type="button"
          >
            Nova conversa
          </button>

          <ul className="space-y-2">
            {conversations.map((conversation) => (
              <li className="flex gap-1" key={conversation.id}>
                <button
                  className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition ${active?.id === conversation.id ? 'bg-indigo-100 font-medium text-indigo-950' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                  onClick={() => setActive(conversation)}
                  type="button"
                >
                  {conversation.title}
                </button>
                <button
                  aria-label={`Excluir conversa ${conversation.title}`}
                  className="rounded px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => void deleteConversation(conversation.id)}
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {active ? (
            <>
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 text-xs text-slate-500">
                <span>Provedor: <strong className="text-slate-800">{active.provider === 'gemini' ? 'Google Gemini' : active.provider}</strong></span>
                <span>{active.messages.length} mensagens</span>
              </div>
              <div aria-live="polite" className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {active.messages.map((item) => (
                  <div className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`} key={item.id}>
                    <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-xs ${item.role === 'user' ? 'bg-indigo-600 text-white' : 'border border-slate-100 bg-slate-50 text-slate-800'}`}>
                      {item.content}
                    </p>
                  </div>
                ))}
                {!active.messages.length && <p className="py-12 text-center text-sm text-slate-500">Envie sua dúvida para iniciar o aprendizado com a IA Mentora.</p>}
              </div>

              <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(event) => void sendMessage(event)}>
                {(active.provider === 'gemini' || active.provider === 'groq') && (
                  <label className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                    <input checked={externalConsent} className="mt-1" onChange={(event) => setExternalConsent(event.target.checked)} type="checkbox" />
                    <span>Entendo que esta mensagem será enviada ao Google Gemini para processamento pedagógico seguro. Não incluirei dados pessoais ou sensíveis.</span>
                  </label>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500"
                    maxLength={6000}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Escreva sua pergunta de estudo ou dúvida sobre projetos…"
                    required
                    value={message}
                  />
                  <button
                    aria-label="Enviar mensagem"
                    className="rounded-xl bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-50"
                    disabled={busy || !message.trim() || ((active.provider === 'gemini' || active.provider === 'groq') && !externalConsent)}
                    type="submit"
                  >
                    {busy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <MessageCircle aria-hidden="true" className="size-10 text-indigo-400" />
              <p className="mt-3 font-semibold text-slate-800">Selecione ou inicie uma conversa</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                A IA Mentora auxilia estudantes e professores no desenvolvimento de ideias, desafios e projetos sustentáveis.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
