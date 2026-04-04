"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddShoppingItem() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const openModal = () => setOpen(true)
  const closeModal = () => setOpen(false)

  const save = async () => {
    if (!name.trim()) return alert('Name erforderlich')
    setSaving(true)
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), quantity, note }),
      })
      if (!res.ok) throw new Error('Fehler')
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
      <div className="p-3 border rounded flex items-center justify-center">
        <button onClick={openModal} className="flex items-center gap-2 text-blue-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z" />
          </svg>
          <span className="text-sm">Artikel hinzufügen</span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded p-6 w-96">
            <h3 className="text-lg font-semibold mb-3">Neuen Einkaufseintrag</h3>
            <label className="block mb-2">
              Name
              <input className="mt-1 w-full border p-2" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block mb-2">
              Menge
              <input className="mt-1 w-full border p-2" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 1))} />
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
