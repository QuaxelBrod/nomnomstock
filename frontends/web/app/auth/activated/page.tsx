export const dynamic = 'force-dynamic'

import Link from 'next/link'

type Props = {
  searchParams?: {
    status?: string
    reason?: string
  }
}

export default function ActivatedPage({ searchParams }: Props) {
  const isSuccess = searchParams?.status !== 'error'

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
      <section className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {isSuccess ? 'Erfolgreich registriert' : 'Bestaetigung fehlgeschlagen'}
        </h1>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">
          {isSuccess
            ? 'Dein Konto wurde aktiviert. Du kannst dich jetzt anmelden.'
            : 'Der Bestaetigungslink ist ungueltig oder abgelaufen. Bitte registriere dich erneut.'}
        </p>
        <Link href="/auth/login" className="inline-block px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium">
          Zur Loginseite
        </Link>
      </section>
    </main>
  )
}
