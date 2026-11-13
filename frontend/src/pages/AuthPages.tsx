import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth, roleHomePath, type AccountRole } from '../contexts/AuthContext'
import { ApiError, apiRequest } from '../services/api'

function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="mx-auto max-w-md">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">
        HUB TEENS EM AÇÃO
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-3 leading-6 text-slate-600">{description}</p>
      <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-7">
        {children}
      </div>
    </section>
  )
}

function FormInput({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  maxLength,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
  maxLength?: number
}) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={name}>
      {label}
      <input
        autoComplete={autoComplete}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        id={name}
        maxLength={maxLength}
        name={name}
        required={required}
        type={type}
      />
    </label>
  )
}

function SubmitButton({ children, busy }: { children: ReactNode; busy: boolean }) {
  return (
    <button
      className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60"
      disabled={busy}
      type="submit"
    >
      {busy ? 'Aguarde…' : children}
    </button>
  )
}

function ErrorMessage({ children }: { children: string | null }) {
  if (!children) return null
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
      {children}
    </p>
  )
}

function SuccessMessage({ children }: { children: string | null }) {
  if (!children) return null
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
      {children}
    </p>
  )
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && typeof error.details === 'object' && error.details !== null) {
    const firstDetail = Object.values(error.details).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    )[0]
    if (typeof firstDetail === 'string') return firstDetail
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.'
}

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stateFrom = (location.state as { from?: string } | null)?.from
  const safeRedirect = stateFrom && stateFrom.startsWith('/') && !stateFrom.startsWith('//') ? stateFrom : null

  if (user) return <Navigate to={safeRedirect ?? roleHomePath(user.role)} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const account = await login(String(data.get('identifier')), String(data.get('password')))
      navigate(safeRedirect ?? roleHomePath(account.role), { replace: true })
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Que bom ter você de volta" description="Entre com seu usuário ou e-mail e sua senha.">
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <FormInput label="Usuário ou e-mail" name="identifier" autoComplete="username" maxLength={254} />
        <FormInput label="Senha" name="password" type="password" autoComplete="current-password" />
        <ErrorMessage>{error}</ErrorMessage>
        <SubmitButton busy={busy}>Entrar</SubmitButton>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        <Link className="font-semibold text-indigo-700 hover:underline" to="/recuperar-senha">
          Esqueci minha senha
        </Link>
        <Link className="font-semibold text-indigo-700 hover:underline" to="/cadastro">
          Criar uma conta
        </Link>
      </div>
    </AuthCard>
  )
}

export function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={roleHomePath(user.role)} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    const username = String(data.get('username') || '').trim()
    const email = String(data.get('email') || '').trim()
    const firstName = String(data.get('first_name') || '').trim()
    const lastName = String(data.get('last_name') || '').trim()
    const password = String(data.get('password') || '')
    const passwordConfirm = String(data.get('password_confirm') || '')
    const selectedRole = String(data.get('role') || 'student') as AccountRole

    if (password !== passwordConfirm) {
      setError('As senhas não correspondem.')
      setBusy(false)
      return
    }

    try {
      const account = await register({
        username,
        email,
        first_name: firstName,
        last_name: lastName,
        password,
        password_confirm: passwordConfirm,
        role: selectedRole === 'teacher' ? 'teacher' : 'student',
      })
      navigate(roleHomePath(account.role), { replace: true })
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="Criar Conta no Hub Teens"
      description="Acesso 100% liberado para todos os estudantes e professores, sem necessidade de aprovação ou autorização prévia da equipe escolar."
    >
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
        ✓ Cadastro livre e imediato: crie sua conta e comece a usar a plataforma agora mesmo.
      </div>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="role">
          Eu sou
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            defaultValue="student"
            id="role"
            name="role"
          >
            <option value="student">Aluno(a) — Explorar ideias, desafios e maker</option>
            <option value="teacher">Professor(a) — Criar desafios e moderar conteúdos</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Nome" name="first_name" autoComplete="given-name" maxLength={150} />
          <FormInput label="Sobrenome" name="last_name" autoComplete="family-name" required={false} maxLength={150} />
        </div>
        <FormInput
          label="Nome de usuário"
          name="username"
          autoComplete="username"
          maxLength={30}
        />
        <p className="-mt-2 text-xs text-slate-500">
          De 3 a 30 caracteres (letras, números, pontos, hífens ou sublinhados).
        </p>
        <FormInput label="E-mail" name="email" type="email" autoComplete="email" maxLength={254} />
        <FormInput
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        <FormInput
          label="Confirmar senha"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
        />
        <ErrorMessage>{error}</ErrorMessage>
        <SubmitButton busy={busy}>Criar minha conta</SubmitButton>
      </form>
      <div className="mt-5 text-center text-sm">
        <span className="text-slate-600">Já tem uma conta? </span>
        <Link className="font-semibold text-indigo-700 hover:underline" to="/login">
          Fazer login
        </Link>
      </div>
    </AuthCard>
  )
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)
    const data = new FormData(event.currentTarget)
    try {
      const response = await apiRequest<{ message: string }>('/api/auth/password-reset/', {
        method: 'POST',
        body: JSON.stringify({ email: String(data.get('email')).trim() }),
      })
      setSuccess(response.message)
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Recuperar senha" description="Informe o e-mail associado à sua conta.">
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <FormInput label="E-mail" name="email" type="email" autoComplete="email" maxLength={254} />
        <ErrorMessage>{error}</ErrorMessage>
        <SuccessMessage>{success}</SuccessMessage>
        <SubmitButton busy={busy}>Enviar instruções</SubmitButton>
      </form>
      <Link className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:underline" to="/login">
        Voltar ao login
      </Link>
    </AuthCard>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)
    const data = new FormData(event.currentTarget)
    try {
      const response = await apiRequest<{ message: string }>('/api/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({
          uid: searchParams.get('uid') ?? '',
          token: searchParams.get('token') ?? '',
          new_password: String(data.get('new_password')),
          password_confirm: String(data.get('password_confirm')),
        }),
      })
      setSuccess(response.message)
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Escolher nova senha" description="Defina uma senha nova e segura para sua conta.">
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <FormInput label="Nova senha" name="new_password" type="password" autoComplete="new-password" />
        <FormInput label="Confirme a nova senha" name="password_confirm" type="password" autoComplete="new-password" />
        <ErrorMessage>{error}</ErrorMessage>
        <SuccessMessage>{success}</SuccessMessage>
        <SubmitButton busy={busy}>Redefinir senha</SubmitButton>
      </form>
      {success && (
        <Link className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:underline" to="/login">
          Ir para o login
        </Link>
      )}
    </AuthCard>
  )
}

const roleLabels: Record<AccountRole, string> = {
  student: 'Aluno',
  teacher: 'Professor',
  administrator: 'Administrador',
}

export function RoleHomePage() {
  const { user, logout } = useAuth()
  const { role } = useParams()
  const [error, setError] = useState<string | null>(null)

  if (!user) return <Navigate to="/login" replace />
  if (role !== user.role) return <Navigate to={roleHomePath(user.role)} replace />

  async function handleLogout() {
    setError(null)
    try {
      await logout()
    } catch (logoutError) {
      setError(errorText(logoutError))
    }
  }

  return (
    <section className="mx-auto max-w-2xl">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">
        Área da conta
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Olá, {user.first_name || user.username}!
        </h1>
        {user.role === 'teacher' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            ✓ Professor Verificado
          </span>
        )}
        {user.role === 'administrator' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">
            ★ Administrador
          </span>
        )}
      </div>

      <p className="mt-4 leading-7 text-slate-600">
        {user.role === 'teacher'
          ? 'Você possui perfil de professor(a) verificado(a). Abaixo estão suas ferramentas de gestão pedagógica, moderação e avaliação de projetos.'
          : user.role === 'administrator'
          ? 'Você possui perfil de administrador. Gerencie eventos, desafios, moderação de conteúdos e o ecossistema escolar.'
          : 'Sessão autenticada como aluno(a). Participe dos desafios, submeta projetos no Espaço Maker e colabore com ideias!'}
      </p>

      {user.role !== 'student' ? (
        <section className="mt-7">
          <h2 className="text-base font-bold text-slate-900">
            Funções exclusivas do Professor
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Ações e recursos restritos à equipe pedagógica e moderadores.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/desafios"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                🎯 Criar & Avaliar Desafios
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Publique novos desafios escolares e avalie as participações dos alunos concedendo pontos.
              </p>
            </Link>

            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/feira"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                🎪 Feiras & Avaliação de Projetos
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Organize mostras científicas e selecione quais projetos dos alunos participarão da feira.
              </p>
            </Link>

            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/agenda"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                📅 Agenda de Eventos
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Agende eventos, palestras e prazos oficiais para os estudantes.
              </p>
            </Link>

            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/ideias"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                💡 Moderação do Banco de Ideias
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Aprove ideias enviadas pelos estudantes ou requisite revisões e ajustes.
              </p>
            </Link>

            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/midia-jovem"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                🎙️ Moderação de Mídia Jovem
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Revise artigos e matérias jornalísticas escritas por alunos antes da publicação.
              </p>
            </Link>

            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/ranking"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                🏆 Ranking & Desempenho dos Alunos
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Acompanhe o ranking completo de pontuação e engajamento dos estudantes.
              </p>
            </Link>
          </div>
        </section>
      ) : (
        <section className="mt-7">
          <h2 className="text-base font-bold text-slate-900">Suas Atividades no Hub</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/ideias"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">💡 Compartilhar Ideia</p>
              <p className="mt-1 text-xs text-slate-600">Publique suas propostas associadas aos ODS da ONU.</p>
            </Link>
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/desafios"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">🎯 Participar de Desafios</p>
              <p className="mt-1 text-xs text-slate-600">Responda aos desafios dos professores e ganhe pontos.</p>
            </Link>
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/maker"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">🛠️ Espaço Maker</p>
              <p className="mt-1 text-xs text-slate-600">Documente seus projetos práticos e protótipos.</p>
            </Link>
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              to="/ranking"
            >
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">🏅 Minha Pontuação</p>
              <p className="mt-1 text-xs text-slate-600">Consulte os pontos acumulados pelas suas participações.</p>
            </Link>
          </div>
        </section>
      )}
      <dl className="mt-7 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário</dt>
          <dd className="mt-1 font-medium text-slate-900">{user.username}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail</dt>
          <dd className="mt-1 break-all font-medium text-slate-900">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Perfil</dt>
          <dd className="mt-1 font-medium text-slate-900">{roleLabels[user.role]}</dd>
        </div>
      </dl>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <button
        className="mt-6 rounded-lg border border-indigo-300 px-4 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-50"
        onClick={() => void handleLogout()}
        type="button"
      >
        Sair da conta
      </button>
    </section>
  )
}
