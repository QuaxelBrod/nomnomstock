"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState<number>(1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])

  useEffect(() => {
    fetch('/api/shopping/recent-removed')
      .then((r) => r.json())
      .then((data) => setRecommendations(data || []))
      .catch(() => {})
  }, [])

  const openModal = () => setOpen(true)
  const closeModal = () => setOpen(false)

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/shopping', {
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
          <button onClick={openModal} className="flex items-center gap-2 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="w-5 h-5">
              <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z" />
            </svg>
            
          </button>
        </div>
      ) : (
        <div className="p-3 border rounded flex items-center justify-center">
          <button onClick={openModal} className="flex items-center gap-2 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="w-5 h-5">
              <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z" />
            </svg>
            
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded p-6 w-96">
            <h3 className="text-lg font-semibold mb-3">Neuen Einkaufseintrag</h3>
            <label className="block mb-2">
              Name
              <input className="mt-1 w-full border p-2" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block mb-2">
              Menge
              <input className="mt-1 w-full border p-2" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 1))} />
            </label>
            <label className="block mb-4">
              Anmerkung
              <input className="mt-1 w-full border p-2" value={note} onChange={(e) => setNote(e.target.value)} />
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
