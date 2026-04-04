"use client"

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

type StockItem = {
  id: number
  quantity: number
  unit?: string | null
  product: { id: number; name: string; barcode: string; image?: string | null }
  location?: { id: number; name: string } | null
}

export default function StockList() {
  const [items, setItems] = useState<StockItem[]>([])

  const { data: session } = useSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
      setError(null)
      ;(async () => {
        try {
          const r = await fetch('/api/stock')
          if (!r.ok) {
            const t = await r.text()
            throw new Error(t || `Status ${r.status}`)
          }
          const data = await r.json()
          setItems(Array.isArray(data) ? data : [])
        } catch (e: any) {
          setItems([])
          setError(e?.message || String(e))
        }
      })()
    }, [])

  const reduce = async (id: number) => {
    const amt = Number(prompt('Menge entnehmen (Zahl)', '1')) || 0
    const toShopping = confirm('Auf Einkaufsliste setzen, falls leer?')
    await fetch(`/api/stock/${id}/reduce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, toShopping }),
    })
    // reload
    const res = await fetch('/api/stock')
    setItems(await res.json())
  }

  return (
    <div>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      {!session && <div className="text-sm text-gray-600 mb-2">Bitte einloggen, um Bestände zu sehen.</div>}
      {items.length === 0 && !error && <div className="text-sm text-gray-600">Keine Bestände vorhanden.</div>}
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="p-3 bg-white rounded shadow-sm flex justify-between items-center">
            <div className="flex items-center gap-3">
              {it.product.image ? (
                <img src={it.product.image} alt={it.product.name} className="w-12 h-12 object-cover rounded" />
              ) : (
                <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">No</div>
              )}
              <div>
                <a href={`/product/${it.product.id}`} className="font-medium hover:underline">{it.product.name}</a>
                <div className="text-sm text-gray-500">{it.product.barcode} • {it.location?.name ?? '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-lg">{it.quantity} {it.unit ?? ''}</div>
              <button className="btn" onClick={() => reduce(it.id)}>Entnehmen</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
