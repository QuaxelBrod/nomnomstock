"use client"

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    let res
    try {
      const apiPath = `${base || ''}/api/auth/register`
      res = await fetch(apiPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) })
    } catch (err) {
      setError('Network error')
      return
    }

    let bodyText = ''
    try {
      bodyText = await res.text()
    } catch {}

    let body: any = {}
    try { body = bodyText ? JSON.parse(bodyText) : {} } catch { body = { raw: bodyText } }

    if (!res.ok) {
      setError(body?.error || 'Registration failed')
      return
    }

    // success — show brief confirmation then redirect to login
    alert('Registrierung erfolgreich — bitte einloggen')
    const loginPath = `${base || ''}/auth/login`
    router.push(loginPath)
  }

  return (
    <main className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Register</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="w-full p-2 border rounded" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full p-2 border rounded" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full p-2 border rounded" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="text-red-600">{error}</div>}
        <button className="action-fullmobile px-3 py-2 bg-green-600 text-white rounded">Register</button>
      </form>
    </main>
  )
}
