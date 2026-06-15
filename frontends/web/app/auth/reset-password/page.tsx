"use client"

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams?.get('token') || '', [searchParams])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('Der Link ist unvollstaendig.')
      return
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (password !== confirm) {
      setError('Die Passwoerter stimmen nicht ueberein.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${base}/api/v1/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.error === 'invalid_or_expired_token') throw new Error('Der Link ist ungueltig oder abgelaufen.')
        throw new Error('Das Passwort konnte nicht gesetzt werden.')
      }
      setDone(true)
      setPassword('')
      setConfirm('')
    } catch (err: any) {
      setError(err?.message || 'Das Passwort konnte nicht gesetzt werden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Passwort neu setzen</h2>
      {done ? (
        <div className="space-y-3">
          <div className="text-sm text-green-700 dark:text-green-400">Das Passwort wurde geaendert.</div>
          <Link href="/auth/login" className="inline-block px-3 py-2 bg-blue-600 text-white rounded">Zum Login</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Neues Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Neues Passwort wiederholen"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button disabled={loading} className="action-fullmobile px-3 py-2 bg-blue-600 text-white rounded">
            {loading ? 'Speichere...' : 'Passwort setzen'}
          </button>
        </form>
      )}
    </main>
  )
}
