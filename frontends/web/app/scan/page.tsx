"use client"

export const dynamic = 'force-dynamic'

import dynamicImport from 'next/dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import LocationSelector from '../../components/LocationSelector'
import CenteredCheck from '../../components/CenteredCheck'
const ManualAdd = dynamicImport(() => import('../../components/ManualAdd'), { ssr: false })
const AddStockModal = dynamicImport(() => import('../../components/AddStockModal'), { ssr: false })

const Scanner = dynamicImport(() => import('../../components/Scanner'), { ssr: false })
import QuantityField from '../../components/QuantityField'

export default function ScanPage() {
  const [code, setCode] = useState<string | null>(null)
  const [product, setProduct] = useState<any | null>(null)
  const [manualCode, setManualCode] = useState<string>('')
  const [locationId, setLocationId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(false)
  const [savingStock, setSavingStock] = useState(false)
  const [showCheck, setShowCheck] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalProduct, setModalProduct] = useState<any | null>(null)
  const [cameraMode, setCameraMode] = useState<'environment' | 'user'>('environment')

  const lastLookupRef = useRef<{ code: string; ts: number } | null>(null)
  const lastQueriedRef = useRef<string | null>(null)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const closeAddModal = useCallback(() => {
    setModalVisible(false)
    setModalProduct(null)
    // Clear stale manual-search state so scan UI stays consistent after closing overlay.
    setCode(null)
    setProduct(null)
    setManualCode('')
    lastLookupRef.current = null
    lastQueriedRef.current = null
  }, [])

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
      const res = await fetch(`${base}/api/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: c }) })
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
    if (!code || savingStock) return
    setSavingStock(true)
    const qty = Number(quantity) || 1
    try {
      // Simple create by barcode — backend will lookup/create product
      const res = await fetch(`${base}/api/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: code, quantity: qty, locationId }),
      })
      if (!res.ok) throw new Error('stock add failed')
      setShowCheck(true)
    } catch (e) {
      alert('Fehler beim Hinzufuegen zum Lager')
    } finally {
      setSavingStock(false)
    }
  }

  // If user opens scan page and there's no location selected,
  // try to auto-select the first available location.
  // The LocationSelector will fetch household-scoped locations; we wait a tick and then
  // query the API directly here as a fallback to choose a default.
  useEffect(() => {
    if (locationId !== null) return
    ;(async () => {
      try {
        const res = await fetch(`${base}/api/locations`)
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) setLocationId(data[0].id)
      } catch {}
    })()
  }, [locationId])

  return (
    <main className="p-4 sm:p-6 max-w-3xl mx-auto pb-28 md:pb-20">
      <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Scan</h2>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">Kamera:</span>
        <button
          type="button"
          onClick={() => setCameraMode('environment')}
          className={`px-3 py-1 rounded border text-sm ${cameraMode === 'environment' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-600'}`}
        >
          Rueckkamera
        </button>
        <button
          type="button"
          onClick={() => setCameraMode('user')}
          className={`px-3 py-1 rounded border text-sm ${cameraMode === 'user' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-600'}`}
        >
          Frontkamera
        </button>
      </div>
      <div className="mb-4">
        <Scanner onDetected={handleDetected} cameraMode={cameraMode} />
      </div>

      <div className="mt-2 space-y-4">
        <div className="text-sm"><strong>Letzter Scan:</strong> <span className="ml-2">{code ?? 'nichts'}</span></div>

        <div>
          <label className="block text-sm font-medium mb-1">Barcode manuell eingeben</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="w-full px-3 py-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Barcode"
            />
            <button className="action-fullmobile w-full sm:w-40 px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => handleDetected(manualCode, true)} disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Suche...
                </span>
              ) : 'Suchen'}
            </button>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">Suche Produkt…</div>}

        {!loading && product && (
          <div className="p-3 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {product.image && <img src={product.image} alt={product.name} className="w-20 h-20 object-cover rounded" />}
              <div className="flex-1">
                <div className="font-medium text-base text-gray-900 dark:text-gray-100">{product.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{product.brand}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-3 items-stretch">
              <div className="flex-1"><LocationSelector value={locationId} onChange={(v) => setLocationId(v)} /></div>
              <div className="w-full sm:w-40"><QuantityField value={quantity} onChange={(v) => setQuantity(v)} /></div>
              <button className="action-fullmobile w-full sm:w-36 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60 disabled:cursor-not-allowed" onClick={addToStock} disabled={savingStock || loading}>
                {savingStock ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Lagere...
                  </span>
                ) : 'Lagern'}
              </button>
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

        <AddStockModal visible={modalVisible} product={modalProduct} defaultLocationId={locationId} onClose={closeAddModal} onSaved={() => { setShowCheck(true); closeAddModal(); }} />
        <CenteredCheck visible={showCheck} onHidden={() => setShowCheck(false)} />
      </div>
    </main>
  )
}
