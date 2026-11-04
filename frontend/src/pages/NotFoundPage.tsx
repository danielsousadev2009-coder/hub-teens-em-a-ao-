import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold text-slate-900">Página não encontrada</h1>
      <Link className="mt-4 inline-block font-semibold text-indigo-700 underline" to="/">
        Voltar ao início
      </Link>
    </section>
  )
}
