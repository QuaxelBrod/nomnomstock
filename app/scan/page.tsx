"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import LocationSelector from '../../components/LocationSelector'
const ManualAdd = dynamic(() => import('../../components/ManualAdd'), { ssr: false })

const Scanner = dynamic(() => import('../../components/Scanner'), { ssr: false })

export default function ScanPage() {
  const [code, setCode] = useState<string | null>(null)
  const [product, setProduct] = useState<any | null>(null)
  const [locationId, setLocationId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(false)

  const handleDetected = async (c: string) => {
    setCode(c)
    setLoading(true)
    try {
      const res = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: c }) })
      const body = await res.json()
      if (body && body.found && body.product) setProduct(body.product)
      else setProduct(null)
    } catch (e) {
      console.error('lookup error', e)
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }

  const addToStock = async () => {
    if (!code) return
    const qty = Number(quantity) || 1
    // Simple create by barcode — backend will lookup/create product
    await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: code, quantity: qty, locationId }),
    })
    alert('Artikel gelagert')
  }

  // If user opens scan page and there's no location selected,
  // try to auto-select the first available location.
  // The LocationSelector will fetch household-scoped locations; we wait a tick and then
  // query the API directly here as a fallback to choose a default.
  useEffect(() => {
    if (locationId !== null) return
    ;(async () => {
      try {
        const res = await fetch('/api/locations')
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) setLocationId(data[0].id)
      } catch {}
    })()
  }, [locationId])

  return (
    <main className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Scan</h2>
      <Scanner onDetected={(c) => handleDetected(c)} />

      <div className="mt-4">
        <div className="mb-2"><strong>Letzter Scan:</strong> <span className="ml-2">{code ?? 'nichts'}</span></div>
        {loading && <div className="text-sm text-gray-500">Suche Produkt…</div>}
        {!loading && product && (
          <div className="p-3 border rounded-md bg-white">
            <div className="flex items-center gap-3">
              {product.image && <img src={product.image} alt={product.name} className="w-16 h-16 object-cover rounded" />}
              <div>
                <div className="font-medium">{product.name}</div>
                <div className="text-sm text-gray-500">{product.brand}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-3 items-center">
              <LocationSelector value={locationId} onChange={(v) => setLocationId(v)} />
              <input className="w-20 px-2 py-1 border rounded" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 1))} />
              <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={addToStock}>Lagern</button>
            </div>
          </div>
        )}
        {!loading && !product && code && (
          <div className="p-3 border rounded-md bg-yellow-50">Kein Produkt gefunden. Du kannst es manuell anlegen.</div>
        )}
        {!loading && !product && (
          <div className="mt-3">
            <h3 className="font-medium mb-2">Manuell hinzufügen</h3>
            <ManualAdd onAdded={(p) => { setProduct(p); setCode(p.barcode || null) }} locationId={locationId} quantity={quantity} />
          </div>
        )}
      </div>
    </main>
  )
}
