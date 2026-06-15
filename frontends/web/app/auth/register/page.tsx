"use client"

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function RegisterPage() {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    let res
    try {
      const apiPath = `${base || ''}/api/v1/auth/register`
      const inviteToken = searchParams?.get('invite') || undefined
      res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, inviteToken }),
      })
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
      setError(body?.message || body?.error || 'Registration failed')
      return
    }

    const msg = body?.message || 'Die Registrierung wird durchgeführt, Sie erhalten in Kürze eine E-Mail.'
    setSuccess(msg)

    // Redirect with delay so user can read the server message.
    setTimeout(() => {
      const loginPath = `${base || ''}/auth/login`
      router.push(loginPath)
    }, 2500)
  }

  return (
    <main className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Register</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 border-gray-300 dark:border-gray-600"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 border-gray-300 dark:border-gray-600"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 border-gray-300 dark:border-gray-600"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="text-red-600">{error}</div>}
        {success && <div className="text-green-700 dark:text-green-400">{success}</div>}
        <button className="action-fullmobile px-3 py-2 bg-green-600 text-white rounded">Register</button>
      </form>
    </main>
  )
}
