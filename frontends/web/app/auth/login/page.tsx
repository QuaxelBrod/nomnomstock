"use client"

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const targetPath = useMemo(() => {
    const stripBasePath = (path: string) => {
      if (!basePath) return path
      if (path === basePath) return '/'
      if (path.startsWith(`${basePath}/`)) {
        const stripped = path.slice(basePath.length)
        return stripped.startsWith('/') ? stripped : `/${stripped}`
      }
      return path
    }

    const raw = searchParams?.get('callbackUrl')
    if (!raw) return '/lager/'
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded.startsWith('/')) return stripBasePath(decoded)
      const parsed = new URL(decoded)
      return stripBasePath(parsed.pathname + parsed.search)
    } catch {
      return '/lager/'
    }
  }, [searchParams, basePath])

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(targetPath)
    }
  }, [status, router, targetPath])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const res = await signIn('credentials', { redirect: false, email, password, callbackUrl: targetPath })
    // @ts-ignore
    if (res?.error) {
      // @ts-ignore
      setError(res.error)
      return
    }
    router.replace(targetPath)
    router.refresh()
  }

  return (
    <main className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Login</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="text-red-600">{error}</div>}
        <button className="action-fullmobile px-3 py-2 bg-blue-600 text-white rounded">Login</button>
      </form>
      <p className="mt-3 text-sm">Noch keinen Account? <Link href="/auth/register" className="text-blue-600">Registrieren</Link></p>
    </main>
  )
}
