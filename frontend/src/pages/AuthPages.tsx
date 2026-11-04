import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={roleHomePath(user.role)} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const account = await login(String(data.get('identifier')), String(data.get('password')))
      navigate(roleHomePath(account.role), { replace: true })
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
          Como obter acesso
        </Link>
      </div>
    </AuthCard>
  )
}

export function RegisterPage() {
  return (
    <AuthCard
      title="Acesso de aluno"
      description="As contas do piloto são criadas pela escola para manter o acesso restrito aos participantes autorizados."
    >
      <p className="leading-6 text-slate-700" role="status">
        Peça à coordenação ou ao professor responsável as instruções de acesso. Não compartilhe sua senha.
      </p>
      <Link className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:underline" to="/login">
        Já tem acesso? Entrar
      </Link>
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
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Olá, {user.first_name || user.username}!
      </h1>
      <p className="mt-4 leading-7 text-slate-600">
        Sessão autenticada como {roleLabels[user.role]}. Esta tela exibe os dados da conta; ferramentas de gestão
        para professores e administradores ainda não estão disponíveis neste painel.
      </p>
      <dl className="mt-7 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário</dt>
          <dd className="mt-1 font-medium text-slate-900">{user.username}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail</dt>
          <dd className="mt-1 break-all font-medium text-slate-900">{user.email}</dd>
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
