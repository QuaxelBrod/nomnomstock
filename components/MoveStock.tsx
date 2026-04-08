"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import QuantityField from './QuantityField'

type Stock = { id: number; quantity: number; unit?: string | null; location?: { id: number; name?: string } | null }

export default function MoveStock({ productId, stocks }: { productId: number; stocks: Stock[] }) {
  const { data: session } = useSession()
  const router = useRouter()
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState<any[]>([])
  const [fromId, setFromId] = useState<number | null>(stocks?.[0]?.id ?? null)
  const [toLoc, setToLoc] = useState<number | null>(null)
  const [amount, setAmount] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const r = await fetch(`${base || ''}/api/locations`)
      const data = await r.json()
      setLocations(Array.isArray(data) ? data : [])
      if (data && data.length > 0) setToLoc(data[0].id)
    })()
  }, [open])

  useEffect(() => {
    if (stocks && stocks.length > 0) setFromId(stocks[0].id)
  }, [stocks])

  const submit = async () => {
    setError(null)
    if (!fromId || !toLoc) return setError('Bitte Quelle und Ziel wählen')
    const fromStock = stocks.find((s) => s.id === Number(fromId))
    if (!fromStock) return setError('Quelle ungültig')
    if (amount <= 0 || amount > fromStock.quantity) return setError('Ungültige Menge')

    const body = { fromStockId: fromId, toLocationId: toLoc, amount }
    const r = await fetch(`${base || ''}/api/stock/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) {
      const t = await r.json().catch(() => null)
      setError((t && t.error) || `Fehler ${r.status}`)
      return
    }

    setOpen(false)
    router.refresh()
  }

  return (
    <div>
      <button className="px-3 py-1 bg-orange-500 text-white rounded shadow-sm hover:bg-orange-600" onClick={() => setOpen(true)}>Verschieben</button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-96">
            <h3 className="font-medium mb-3">Produkt verschieben</h3>
            {!session && <div className="text-sm text-gray-600 mb-2">Bitte einloggen.</div>}

            <div className="mb-2">
              <label className="block text-sm">Von (Quelle)</label>
              <select className="w-full p-2 border rounded" value={fromId ?? ''} onChange={(e) => setFromId(Number(e.target.value))}>
                {stocks.map((s) => (
                  <option key={s.id} value={s.id}>{s.quantity} {s.unit ?? ''} — {s.location?.name ?? '—'}</option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="block text-sm">Nach (Ziel)</label>
              <select className="w-full p-2 border rounded" value={toLoc ?? ''} onChange={(e) => setToLoc(Number(e.target.value))}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm">Menge</label>
              <QuantityField value={amount} onChange={(v: number) => setAmount(v)} />
            </div>

            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setOpen(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={submit}>Verschieben</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
