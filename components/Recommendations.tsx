"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Recommendation = {
  product: { id: number; name: string; image?: string | null }
}

export default function Recommendations() {
  const [items, setItems] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

  useEffect(() => {
    fetch(`${base || ''}/api/shopping/recent-removed`)
      .then((r) => r.json())
      .then((data) => setItems(data || []))
      .catch(() => {})
  }, [])

  async function addProduct(productId: number) {
    setLoading(true)
    try {
      const res = await fetch(`${base || ''}/api/shopping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: 1 }),
      })
      if (!res.ok) throw new Error('failed')
      router.refresh()
    } catch (e) {
      alert('Fehler beim Hinzufügen')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) return null

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {items.map((r) => (
          <div key={r.product.id} className="p-2 border rounded flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {r.product.image ? <img src={r.product.image} alt="" className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-gray-100 rounded" />}
              <div className="text-sm break-words min-w-0">{r.product.name}</div>
            </div>
            <button aria-label={`hinzufuegen-${r.product.id}`} className="btn btn-sm btn-primary" onClick={() => addProduct(r.product.id)} disabled={loading}>
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
