"use client"

import { useState } from 'react'

const PRESET = [
  'Apfel', 'Birne', 'Banane', 'Orange', 'Zitrone',
  'Tomate', 'Gurke', 'Paprika', 'Karotte', 'Kartoffel',
  'Zwiebel', 'Knoblauch', 'Brokkoli', 'Blumenkohl', 'Spinat',
  'Salat', 'Kürbis', 'Aubergine', 'Sellerie', 'Rettich',
  'Erdbeere', 'Himbeere', 'Blaubeere', 'Trauben', 'Kirsche',
  'Sonstiges'
]

export default function ManualAdd({ onAdded }: { onAdded: (p: any) => void }) {
  const [term, setTerm] = useState('')
  const [creating, setCreating] = useState(false)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const create = async (name: string) => {
    setCreating(true)
    try {
      const res = await fetch(`${base}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const p = await res.json()
      if (!res.ok) throw new Error(p?.error || 'create failed')
      onAdded(p)
      setTerm('')
    } catch (e) {
      alert('Fehler: ' + String(e))
    } finally { setCreating(false) }
  }

  return (
    <>
    <div className="p-3 border rounded bg-white dark:bg-gray-900">
      <div className="mb-2 text-sm text-gray-600 dark:text-gray-300">Schnellauswahl</div>
      <div className="flex flex-wrap gap-2">
        {PRESET.slice().sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })).map((n) => (
          <button key={n} onClick={() => create(n)} disabled={creating} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-black dark:text-gray-200">{n}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="flex-1 border px-2 py-1 rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400" placeholder="Anderes Produkt" value={term} onChange={(e) => setTerm(e.target.value)} />
        <button onClick={() => create(term)} disabled={creating || !term} className="px-3 py-1 bg-green-600 text-white rounded">Hinzufügen</button>
      </div>
    </div>
    </>
  )
}
