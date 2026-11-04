import {
  ArrowUpRight,
  Check,
  LoaderCircle,
  MessageCircle,
  Send,
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

      {module === 'youth-media' && canModerate && status === 'pending' && (
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => void onAction(`/api/youth-media/${row.id}/moderate/`, { status: 'published' })} type="button">Aprovar publicação</button>
          <button className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => void onAction(`/api/youth-media/${row.id}/moderate/`, { status: 'rejected' })} type="button">Não aprovar</button>
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
  id: 'gemini' | 'groq' | 'ollama'
  configured: boolean
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

function MentorPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [notice, setNotice] = useState('')
  const [provider, setProvider] = useState<ProviderStatus['id'] | ''>('')
  const [conversations, setConversations] = useState<MentorConversation[]>([])
  const [active, setActive] = useState<MentorConversation | null>(null)
  const [message, setMessage] = useState('')
  const [externalConsent, setExternalConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [providerData, conversationData] = await Promise.all([
        apiRequest<{ providers: ProviderStatus[]; external_data_notice: string }>('/api/mentor/providers/'),
        apiRequest<unknown>('/api/mentor/conversations/'),
      ])
      setProviders(providerData.providers)
      setNotice(providerData.external_data_notice)
      const saved = extractRows(conversationData) as unknown as MentorConversation[]
      setConversations(saved)
      if (active) setActive(saved.find((item) => item.id === active.id) ?? null)
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selectedProvider = providers.find((item) => item.id === provider)
  const hasConfiguredProvider = providers.some((item) => item.configured)

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
    <section className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Módulo do HUB</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">IA Mentora</h1>
        <p className="mt-3 leading-6 text-slate-600">Converse com um provedor configurado pelo backend. As conversas ficam associadas à sua conta.</p>
      </header>
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        {notice || 'Não compartilhe dados pessoais, informações sensíveis ou dados de outros estudantes. Provedores externos recebem as mensagens após consentimento.'}
      </p>
      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {providers.length > 0 && !hasConfiguredProvider && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" role="status">
          Nenhum provedor de IA está configurado. Gemini, Groq ou Ollama precisa ser configurado no backend para iniciar conversas.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <aside className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Provedor
            <select className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white p-2.5" onChange={(event) => setProvider(event.target.value as ProviderStatus['id'])} value={provider}>
              <option value="">Selecione</option>
              {providers.map((item) => <option disabled={!item.configured} key={item.id} value={item.id}>{item.id}{item.configured ? '' : ' — não configurado'}</option>)}
            </select>
          </label>
          <button className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!selectedProvider?.configured || busy} onClick={() => void createConversation()} type="button">
            Nova conversa
          </button>
          <ul className="space-y-2">
            {conversations.map((conversation) => (
              <li className="flex gap-1" key={conversation.id}>
                <button className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm ${active?.id === conversation.id ? 'bg-indigo-100 text-indigo-950' : 'bg-white text-slate-700'}`} onClick={() => setActive(conversation)} type="button">{conversation.title}</button>
                <button aria-label={`Excluir conversa ${conversation.title}`} className="rounded px-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => void deleteConversation(conversation.id)} type="button">×</button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-h-72 rounded-2xl border border-slate-200 bg-white p-4">
          {active ? (
            <>
              <div aria-live="polite" className="max-h-96 space-y-3 overflow-y-auto">
                {active.messages.map((item) => (
                  <p className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`} key={item.id}>{item.content}</p>
                ))}
                {!active.messages.length && <p className="py-12 text-center text-sm text-slate-500">Envie uma pergunta para começar.</p>}
              </div>
              <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(event) => void sendMessage(event)}>
                {(active.provider === 'gemini' || active.provider === 'groq') && (
                  <label className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                    <input checked={externalConsent} className="mt-1" onChange={(event) => setExternalConsent(event.target.checked)} type="checkbox" />
                    Entendo que esta mensagem será enviada ao provedor externo selecionado. Não incluirei dados pessoais ou sensíveis.
                  </label>
                )}
                <div className="flex items-end gap-2">
                  <textarea className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 p-3 text-sm" maxLength={6000} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva sua pergunta sem incluir dados pessoais…" required value={message} />
                  <button aria-label="Enviar mensagem" className="rounded-xl bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy || !message.trim() || ((active.provider === 'gemini' || active.provider === 'groq') && !externalConsent)} type="submit">
                    {busy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <MessageCircle aria-hidden="true" className="size-9 text-indigo-400" />
              <p className="mt-3 font-semibold text-slate-800">Suas conversas aparecem aqui</p>
              <p className="mt-1 max-w-xs text-sm leading-6 text-slate-600">Nenhum provedor configurado? A integração só será ativada quando as variáveis do backend estiverem definidas.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
