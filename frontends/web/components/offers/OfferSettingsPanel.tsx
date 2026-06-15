"use client"

import { useEffect, useState } from 'react'
import type { OfferSettings } from 'nomnomstock-shared'

export default function OfferSettingsPanel() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const [settings, setSettings] = useState<OfferSettings | null>(null)
  const [postalCode, setPostalCode] = useState('')
  const [retailerKeys, setRetailerKeys] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`${base}/api/offers/settings`)
        if (!res.ok) return
        const data = await res.json()
        if (!active) return
        setSettings(data.settings)
        setPostalCode(data.settings?.postalCode || '')
        setRetailerKeys(data.settings?.retailerKeys || [])
      } catch {
        // Profile page can still be used without offers.
      }
    })()
    return () => {
      active = false
    }
  }, [base])

  const toggleRetailer = (key: string) => {
    setRetailerKeys((current) => {
      if (current.includes(key)) return current.filter((entry) => entry !== key)
      return [...current, key]
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    setError(null)
    try {
      const res = await fetch(`${base}/api/offers/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postalCode, retailerKeys, maxStores: 3 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error?.message || 'Einstellungen konnten nicht gespeichert werden')
      setSettings(data.settings)
      setStatus('Angebotseinstellungen gespeichert')
    } catch (err: any) {
      setError(err?.message || 'Einstellungen konnten nicht gespeichert werden')
    } finally {
      setSaving(false)
    }
  }

  const retailers = settings?.retailers || [
    { key: 'aldi', name: 'ALDI' },
    { key: 'kaufland', name: 'Kaufland' },
    { key: 'lidl', name: 'Lidl' },
    { key: 'rewe', name: 'REWE' },
  ]

  return (
    <form onSubmit={save} className="mt-6 max-w-md">
      <h3 className="text-sm font-medium mb-2">Angebote</h3>
      <label className="block text-sm">
        PLZ
        <input
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="z.B. 12345"
          className="mt-1 w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {retailers.map((retailer) => (
          <label key={retailer.key} className="flex items-center gap-2 border rounded p-2 text-sm dark:border-gray-700">
            <input
              type="checkbox"
              checked={retailerKeys.includes(retailer.key)}
              onChange={() => toggleRetailer(retailer.key)}
            />
            <span>{retailer.name}</span>
          </label>
        ))}
      </div>

      <button type="submit" disabled={saving} className="action-fullmobile mt-3 px-4 py-2 bg-emerald-600 text-white rounded">
        {saving ? 'Speichere...' : 'Angebote speichern'}
      </button>
      {status && <div className="mt-2 text-sm text-green-700 dark:text-green-400">{status}</div>}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </form>
  )
}
