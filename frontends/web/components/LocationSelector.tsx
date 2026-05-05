"use client"

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function LocationSelector({ value, onChange }: { value?: number | null, onChange: (v: number | null) => void }) {
  const { data: session } = useSession()
  const householdId = (session as any)?.user?.householdId
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  useEffect(() => {
    setLoading(true)
    setError(null)
    const q = householdId ? `?householdId=${householdId}` : ''
    fetch(`${base}/api/locations${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text()
          throw new Error(t || 'Fetch error')
        }
        return r.json()
      })
      .then((data) => setLocations(data || []))
      .catch((e) => { setLocations([]); setError(String(e)) })
      .finally(() => setLoading(false))
  }, [householdId])

  return (
    <div>
      {loading && <div className="text-sm text-gray-500">Lade Lager…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && !error && (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="border px-2 py-1 rounded text-black dark:text-white bg-white dark:bg-gray-800"
        >
          <option value="">-- Lager wählen --</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
