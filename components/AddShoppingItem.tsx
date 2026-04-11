"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QuantityField from './QuantityField'

type Props = {
  showOnlyButton?: boolean
}

type Recommendation = {
  product: {
    id: string
    name: string
    image?: string | null
  }
}

export default function AddShoppingItem({ showOnlyButton }: Props) {
  const router = useRouter()
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState<number>(1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])

  useEffect(() => {
    fetch(`${base || ''}/api/shopping/recent-removed`)
      .then((r) => r.json())
      .then((data) => setRecommendations(data || []))
      .catch(() => {})
  }, [])

  const openModal = () => setOpen(true)
  const closeModal = () => setOpen(false)

  async function save() {
    setSaving(true)
    try {
      await fetch(`${base || ''}/api/shopping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, quantity, note }),
      })
      setName('')
      setQuantity(1)
      setNote('')
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {showOnlyButton ? (
        <div className="p-3 border rounded flex items-center justify-center">
          <button onClick={openModal} className="flex items-center gap-2 text-blue-600 dark:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z" />
            </svg>
            <span className="text-sm font-medium">Produkt hinzufügen</span>
          </button>
        </div>
      ) : (
        <div className="p-3 border rounded flex items-center justify-center">
          <button onClick={openModal} className="flex items-center gap-2 text-blue-600 dark:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z" />
            </svg>
            <span className="text-sm font-medium">Produkt hinzufügen</span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white dark:bg-gray-900 rounded p-6 w-96 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Neuen Einkaufseintrag</h3>
            <label className="block mb-2">
              Name
              <input className="mt-1 w-full border p-2 rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block mb-2">
              Menge
              <div className="mt-1">
                <QuantityField value={quantity} onChange={(v) => setQuantity(v)} />
              </div>
            </label>
            <label className="block mb-4">
              Anmerkung
              <input className="mt-1 w-full border p-2 rounded text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={closeModal} disabled={saving}>Abbrechen</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {!showOnlyButton && recommendations.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-medium mb-2">Empfohlen (zuletzt entfernt)</h4>
          <div className="grid grid-cols-2 gap-2">
            {recommendations.map((r) => (
              <button
                key={r.product.id}
                className="p-2 border rounded text-left flex items-center gap-2"
                onClick={() => {
                  setName(r.product.name)
                  setQuantity(1)
                  setNote('')
                  setOpen(true)
                }}
              >
                {r.product.image ? <img src={r.product.image} alt="" className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-gray-100 rounded" />}
                <div className="text-sm">{r.product.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
