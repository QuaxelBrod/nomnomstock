"use client"
import { useState } from 'react'
import QuantityField from './QuantityField'
import { useRouter } from 'next/navigation'

type Product = { id: number; name: string }
type User = { id: number; name?: string | null }

export default function ShoppingItem({ item }: { item: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(item.quantity || 1)
  const [note, setNote] = useState(item.note || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const openModal = () => setOpen(true)
  const closeModal = () => setOpen(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${base}/api/shopping/${item.id}`, {
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

  const deleteItem = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(true)
    try {
      const res = await fetch(`${base}/api/shopping/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Fehler beim Löschen')
      try {
        router.refresh()
      } catch {
        window.location.reload()
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div role="button" tabIndex={0} className="w-full text-left" onClick={openModal} onKeyDown={(e) => { if (e.key === 'Enter') openModal() }}>
        <div className="flex items-baseline justify-between">
          <div className="font-medium">{item.product?.name || 'Unbekannt'}</div>
          <div className="text-sm text-gray-700 flex items-center gap-2">
            <span>Menge: {item.quantity}</span>
            <button
              onClick={deleteItem}
              disabled={deleting}
              aria-label="Löschen"
              className="text-red-600 hover:text-red-800 p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M9 3V4H4V6H5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V6H20V4H15V3H9ZM7 6H17V19H7V6Z" />
                <path d="M9 8H11V17H9zM13 8H15V17H13z" />
              </svg>
            </button>
          </div>
        </div>
        {item.note ? (
          <div className="text-sm italic text-gray-600 mt-1">{item.note}</div>
        ) : null}
      </div>

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded p-6 w-96">
            <h3 className="text-lg font-semibold mb-3">Bearbeite Einkaufseintrag</h3>
            <label className="block mb-2">
              Menge
              <div className="mt-1">
                <QuantityField value={quantity} onChange={(v) => setQuantity(v)} />
              </div>
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
