"use client"

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function LocationsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const householdId = (session as any)?.user?.householdId
  const [locations, setLocations] = useState<any[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    try {
      const q = householdId ? `?householdId=${householdId}` : ''
      const apiPath = `${base || ''}/api/locations${q}`
      const res = await fetch(apiPath)
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Error')
      }
      const data = await res.json()
      setLocations(data || [])
    } catch (e: any) {
      setError(e?.message || String(e))
      setLocations([])
    }
  }

  useEffect(() => { load() }, [householdId])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    try {
      const createPath = `${base || ''}/api/locations`
      await fetch(createPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, householdId }) })
      setName('')
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Löschen?')) return
    const delPath = `${base || ''}/api/locations/${id}`
    await fetch(delPath, { method: 'DELETE' })
    load()
  }

  return (
    <main className="p-6">
      <div className="mb-4">
        <Link href="/profil" className="text-sm text-blue-600">← Zurück zum Profil</Link>
      </div>
      <h2 className="text-2xl font-semibold mb-4">Lager</h2>

      {!session && <div className="text-sm text-gray-600">Bitte einloggen, um Lager zu verwalten.</div>}

      {session && (
        <>
          <form onSubmit={create} className="mb-4 flex gap-2">
            <input
              className="border px-2 py-1 rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 border-gray-300 dark:border-gray-600"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="action-fullmobile px-3 py-1 bg-green-600 text-white rounded" type="submit">Anlegen</button>
          </form>

          {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

          <ul className="space-y-2">
            {locations.map((l) => (
              <li key={l.id} className="p-2 border rounded flex justify-between items-center">
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-gray-500">Household: {l.householdId ?? '—'}</div>
                </div>
                <div>
                  <button className="action-fullmobile px-2 py-1 bg-red-500 text-white rounded" onClick={() => remove(l.id)}>Löschen</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
