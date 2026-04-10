export const dynamic = 'force-dynamic'

import Link from 'next/link'

type Props = {
  searchParams?: {
    status?: string
  }
}

export default function ApprovalPage({ searchParams }: Props) {
  const isSuccess = searchParams?.status !== 'error'

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
      <section className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {isSuccess ? 'Freigabe erfolgreich' : 'Freigabe fehlgeschlagen'}
        </h1>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">
          {isSuccess
            ? 'Die Registrierung wurde bestaetigt. Eine Aktivierungs-E-Mail wurde an den Benutzer gesendet.'
            : 'Der Freigabelink ist ungueltig oder es ist ein Fehler aufgetreten.'}
        </p>
        <Link href="/" className="inline-block px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium">
          Zur Startseite
        </Link>
      </section>
    </main>
  )
}
