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
  const [locations, setLocations] = useState<Array<{ id: number; name: string }>>([])
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')

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
      // fetch locations for filter
      ;(async () => {
        try {
          const r2 = await fetch('/api/locations')
          const ldata = await r2.json()
          setLocations(Array.isArray(ldata) ? ldata : [])
        } catch (e) {
          setLocations([])
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

  // apply location filter first
  const filteredItems = selectedLocation ? items.filter((it) => it.location?.id === selectedLocation) : items

  // aggregate items by product id (sum quantities across locations)
  const aggregated = Object.values(
    filteredItems.reduce((acc: Record<number, any>, it) => {
      const pid = it.product.id
      if (!acc[pid]) {
        acc[pid] = {
          product: it.product,
          quantity: 0,
          unit: it.unit,
          locations: new Set<string>(),
          representativeId: it.id,
        }
      }
      acc[pid].quantity += Number(it.quantity || 0)
      if (it.location?.name) acc[pid].locations.add(it.location.name)
      return acc
    }, {})
  )
  // apply search filter on aggregated list (name or barcode)
  const term = searchTerm.trim().toLowerCase()
  const displayed = term
    ? aggregated.filter((a: any) => {
        const name = String(a.product.name || '').toLowerCase()
        const barcode = String(a.product.barcode || '').toLowerCase()
        return name.includes(term) || barcode.includes(term)
      })
    : aggregated

  // sort alphabetically by product name
  const displayedSorted = [...displayed].sort((a: any, b: any) => {
    const an = String(a.product.name || '').toLowerCase()
    const bn = String(b.product.name || '').toLowerCase()
    return an.localeCompare(bn)
  })
  return (
    <div>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      {!session && <div className="text-sm text-gray-600 mb-2">Bitte einloggen, um Bestände zu sehen.</div>}
      {filteredItems.length === 0 && !error && <div className="text-sm text-gray-600">Keine Bestände vorhanden.</div>}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <input placeholder="Suche (Name oder Barcode)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div className="mt-2 sm:mt-0">
        <label className="text-sm mr-2">Nach Lager filtern:</label>
        <select className="p-2 border rounded" value={selectedLocation ?? ''} onChange={(e) => setSelectedLocation(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Alle Lager</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        </div>
      </div>
      <ul className="space-y-3">
        {displayedSorted.map((it: any) => (
          <li key={it.product.id} className="p-3 bg-white rounded shadow-sm flex justify-between items-center">
            <div className="flex items-center gap-3">
              {it.product.image ? (
                <img src={it.product.image} alt={it.product.name} className="w-12 h-12 object-cover rounded" />
              ) : (
                <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">No</div>
              )}
              <div>
                <a href={`/product/${it.product.id}`} className="font-medium hover:underline">{it.product.name}</a>
                <div className="text-sm text-gray-500">{it.product.barcode} • {Array.from(it.locations).join(', ') || '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-lg">{it.quantity} {it.unit ?? ''}</div>
              <a href={`/product/${it.product.id}`} className="text-sm text-blue-600 hover:underline">Details</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
