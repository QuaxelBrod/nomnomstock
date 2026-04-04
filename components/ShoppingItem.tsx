"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Product = { id: number; name: string }
type User = { id: number; name?: string | null }

export default function ShoppingItem({ item }: { item: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(item.quantity || 1)
  const [note, setNote] = useState(item.note || '')
  const [saving, setSaving] = useState(false)

  const openModal = () => setOpen(true)
  const closeModal = () => setOpen(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/shopping/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, note }),
      })
      if (!res.ok) throw new Error('Fehler beim Speichern')
      closeModal()
      try {
        router.refresh()
      } catch {
        window.location.reload()
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button className="w-full text-left" onClick={openModal}>
        <div className="flex items-baseline justify-between">
          <div className="font-medium">{item.product?.name || 'Unbekannt'}</div>
          <div className="text-sm text-gray-700">Menge: {item.quantity}</div>
        </div>
        {item.note ? (
          <div className="text-sm italic text-gray-600 mt-1">{item.note}</div>
        ) : null}
      </button>

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded p-6 w-96">
            <h3 className="text-lg font-semibold mb-3">Bearbeite Einkaufseintrag</h3>
            <label className="block mb-2">
              Menge
              <input className="mt-1 w-full border p-2" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
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
    </div>
  )
}
