"use client"

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`${base}/api/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'request_failed')
      setMessage(data?.message || 'Falls diese E-Mail registriert ist, wurde ein Link versendet.')
    } catch {
      setError('Die Anfrage konnte nicht verarbeitet werden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Passwort vergessen</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="E-Mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {message && <div className="text-sm text-green-700 dark:text-green-400">{message}</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button disabled={loading} className="action-fullmobile px-3 py-2 bg-blue-600 text-white rounded">
          {loading ? 'Sende...' : 'Link anfordern'}
        </button>
      </form>
      <p className="mt-3 text-sm"><Link href="/auth/login" className="text-blue-600">Zurueck zum Login</Link></p>
    </main>
  )
}
