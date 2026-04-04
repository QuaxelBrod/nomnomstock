"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import LocationSelector from '../../components/LocationSelector'
import CenteredCheck from '../../components/CenteredCheck'
const ManualAdd = dynamic(() => import('../../components/ManualAdd'), { ssr: false })
const AddStockModal = dynamic(() => import('../../components/AddStockModal'), { ssr: false })

const Scanner = dynamic(() => import('../../components/Scanner'), { ssr: false })

export default function ScanPage() {
  const [code, setCode] = useState<string | null>(null)
  const [product, setProduct] = useState<any | null>(null)
  const [manualCode, setManualCode] = useState<string>('')
  const [locationId, setLocationId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(false)
  const [showCheck, setShowCheck] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalProduct, setModalProduct] = useState<any | null>(null)

  const lastLookupRef = useRef<{ code: string; ts: number } | null>(null)
  const lastQueriedRef = useRef<string | null>(null)

  const handleDetected = useCallback(async (c: string, force = false) => {
    if (!c) return

    // ignore if we've already queried this code (unless forced)
    if (!force && lastQueriedRef.current === c) return

    // ignore repeated identical codes for a short window
    const now = Date.now()
    const last = lastLookupRef.current
    if (!force && last && last.code === c && now - last.ts < 3000) return
    lastLookupRef.current = { code: c, ts: now }

    setCode(c)
    setLoading(true)
    try {
      const res = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: c }) })
      const body = await res.json()
      if (body && body.found && body.product) setProduct(body.product)
      else setProduct(null)
        // mark as queried so we don't repeatedly query the same code
        lastQueriedRef.current = c
    } catch (e) {
      console.error('lookup error', e)
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const addToStock = async () => {
    if (!code) return
    const qty = Number(quantity) || 1
    // Simple create by barcode — backend will lookup/create product
    await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: code, quantity: qty, locationId }),
    })
    setShowCheck(true)
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
      <Scanner onDetected={handleDetected} />

      <div className="mt-4">
        <div className="mb-2"><strong>Letzter Scan:</strong> <span className="ml-2">{code ?? 'nichts'}</span></div>
        <div className="mt-2 mb-4">
          <label className="block text-sm font-medium mb-1">Barcode manuell eingeben</label>
          <div className="flex gap-2">
            <input value={manualCode} onChange={(e) => setManualCode(e.target.value)} className="flex-1 px-2 py-1 border rounded" placeholder="Barcode" />
            <button className="px-3 py-1 bg-gray-700 text-white rounded" onClick={() => handleDetected(manualCode, true)}>Suchen</button>
          </div>
        </div>
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
            <ManualAdd onAdded={(p) => { setModalProduct(p); setModalVisible(true); setProduct(null); setCode(p.barcode || null) }} />
          </div>
        )}
        <AddStockModal visible={modalVisible} product={modalProduct} defaultLocationId={locationId} onClose={() => setModalVisible(false)} onSaved={() => { setShowCheck(true); setModalProduct(null); }} />
        <CenteredCheck visible={showCheck} onHidden={() => setShowCheck(false)} />
      </div>
    </main>
  )
}
