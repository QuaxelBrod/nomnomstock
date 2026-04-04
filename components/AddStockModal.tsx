"use client"

import { useEffect, useState } from 'react'
import LocationSelector from './LocationSelector'
import CameraCapture from './CameraCapture'

export default function AddStockModal({ visible, product, onClose, onSaved, defaultLocationId }: { visible: boolean, product: any | null, onClose: () => void, onSaved?: () => void, defaultLocationId?: number | null }) {
  const [locationId, setLocationId] = useState<number | null>(defaultLocationId ?? null)
  const [quantity, setQuantity] = useState<number>(1)
  const [saving, setSaving] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  useEffect(() => {
    if (visible) {
      setLocationId(defaultLocationId ?? null)
      setQuantity(1)
    }
  }, [visible, product, defaultLocationId])

  if (!visible || !product) return null

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity: Number(quantity) || 1, locationId })
      })
      if (!res.ok) throw new Error('Speichern fehlgeschlagen')
      onSaved && onSaved()
      onClose()
    } catch (e) {
      alert('Fehler: ' + String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded shadow p-4 w-full max-w-md">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">{product.name}</div>
            <div className="text-sm text-gray-500">{product.brand}</div>
          </div>
            <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
          <div className="mt-3">
            {product.image ? (
              <div>
                <div className="mb-2">
                  <img src={product.image} alt={product.name} className="w-32 h-32 object-cover rounded" />
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 border rounded" onClick={() => setShowCamera(true)}>Foto ändern</button>
                  <button className="px-3 py-1 border rounded text-red-600" onClick={async () => {
                    if (!confirm('Foto wirklich löschen?')) return
                    try {
                      const res = await fetch(`/api/products/${product.id}/image`, { method: 'DELETE' })
                      if (!res.ok) throw new Error('delete failed')
                      // update local product
                      if (product) product.image = null
                    } catch (e) {
                      alert('Fehler beim Löschen des Bildes')
                    }
                  }}>Foto löschen</button>
                </div>
                {showCamera && (
                  <div className="mt-2">
                    <CameraCapture onCaptured={async (dataUrl) => {
                      try {
                        setUploadingImage(true)
                        const res = await fetch(`/api/products/${product.id}/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
                        const body = await res.json()
                        if (!res.ok) throw new Error(body?.error || 'upload failed')
                        if (product) product.image = body.url
                        setShowCamera(false)
                      } catch (e) {
                        alert('Fehler beim Hochladen des Bildes')
                      } finally { setUploadingImage(false) }
                    }} onCancel={() => setShowCamera(false)} />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-sm text-gray-600 mb-2">Kein Bild vorhanden — Foto hinzufügen</div>
                {!showCamera ? (
                  <div className="flex gap-2">
                    <button className="px-3 py-1 border rounded" onClick={() => setShowCamera(true)}>Foto aufnehmen</button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <CameraCapture onCaptured={async (dataUrl) => {
                      try {
                        setUploadingImage(true)
                        const res = await fetch(`/api/products/${product.id}/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
                        const body = await res.json()
                        if (!res.ok) throw new Error(body?.error || 'upload failed')
                        // update local product image so UI shows it
                        if (product) product.image = body.url
                        setShowCamera(false)
                      } catch (e) {
                        alert('Fehler beim Hochladen des Bildes')
                      } finally { setUploadingImage(false) }
                    }} onCancel={() => setShowCamera(false)} />
                  </div>
                )}
                {uploadingImage && <div className="text-sm text-gray-500 mt-2">Bild wird hochgeladen…</div>}
              </div>
            )}
          </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Lagerort</label>
          <LocationSelector value={locationId} onChange={(v) => setLocationId(v)} />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Menge</label>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 1))} className="w-28 px-2 py-1 border rounded" />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="px-3 py-1 border rounded" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={save} disabled={saving}>Speichern</button>
        </div>
      </div>
    </div>
  )
}
