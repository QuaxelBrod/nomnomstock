"use client"

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import QuantityField from './QuantityField'

export default function ReduceStock({ stockId }: { stockId: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number>(1)
  const [toShopping, setToShopping] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)

  const openModal = () => {
    setAmount(1)
    setToShopping(false)
    setOpen(true)
  }

  const closeModal = () => setOpen(false)

  const confirmReduce = async () => {
    const amt = Number(amount) || 0
    if (!amt || amt <= 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/stock/${stockId}/reduce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, toShopping })
      })
      if (!res.ok) throw new Error('Fehler beim Entnehmen')
      closeModal()
      try { router.refresh() } catch { window.location.reload() }
    } catch (e: any) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button className="btn" onClick={openModal}>Entnehmen</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded shadow p-4 w-full max-w-sm">
            <div className="flex justify-between items-start">
              <h3 className="font-medium">Entnehmen</h3>
              <button className="text-gray-500" onClick={closeModal}>✕</button>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Menge</label>
              <div>
                <QuantityField value={amount} onChange={(v: number) => setAmount(v)} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input id={`toshop-${stockId}`} type="checkbox" checked={toShopping} onChange={(e) => setToShopping(e.target.checked)} />
              <label htmlFor={`toshop-${stockId}`} className="text-sm">Auf Einkaufsliste setzen</label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1 border rounded" onClick={closeModal} disabled={saving}>Abbrechen</button>
              <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={confirmReduce} disabled={saving || amount < 1}>Entnehmen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
