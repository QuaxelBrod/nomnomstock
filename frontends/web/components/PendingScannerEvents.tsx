"use client"

import { useCallback, useEffect, useState } from 'react'

type ScannerEvent = {
  id: number
  barcode: string
  mode: string
  status: string
  quantity?: number | null
  locationId?: number | null
  productId?: number | null
  createdAt?: string
  note?: string | null
  product?: {
    name?: string
    brand?: string | null
    image?: string | null
    barcode?: string | null
  } | null
  device?: {
    name?: string
  } | null
}

type Location = {
  id: number
  name: string
}

type StockItem = {
  id: number
  productId: number
  locationId: number
  quantity: number
  product?: {
    barcode?: string | null
  } | null
  location?: {
    id: number
  } | null
}

const MODE_LABELS: Record<string, string> = {
  lookup: 'Scan erfassen',
  stock_add: 'Einbuchen',
  stock_remove: 'Ausbuchen',
  shopping_check: 'Einkauf pruefen',
}

const NOTE_LABELS: Record<string, string> = {
  'Product lookup failed': 'Produkt konnte nicht gefunden werden',
  'Location not found': 'Lager nicht gefunden',
  'No matching stock in selected location': 'Kein passender Bestand in diesem Lager',
  'Insufficient stock in selected location': 'Nicht genug Bestand in diesem Lager',
}

function modeLabel(mode: string) {
  return MODE_LABELS[mode] || mode
}

function noteLabel(note?: string | null) {
  if (!note) return null
  return NOTE_LABELS[note] || note
}

export default function PendingScannerEvents({ fallbackLocationId }: { fallbackLocationId?: number | null }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const [events, setEvents] = useState<ScannerEvent[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocations, setSelectedLocations] = useState<Record<number, string>>({})
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/scanner/events?status=pending`)
      if (!res.ok) return
      const body = await res.json()
      const nextEvents = Array.isArray(body?.events) ? body.events : []
      setEvents(nextEvents)
      setLastUpdatedAt(new Date())
      setSelectedLocations((current) => {
        const next = { ...current }
        for (const event of nextEvents) {
          if (!next[event.id]) next[event.id] = String(event.locationId || fallbackLocationId || '')
        }
        return next
      })
      setQuantities((current) => {
        const next = { ...current }
        for (const event of nextEvents) {
          if (!next[event.id]) next[event.id] = String(event.quantity || 1)
        }
        return next
      })
    } catch (err) {
      console.error('load scanner events error', err)
    }
  }, [base, fallbackLocationId])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadEvents()
    }, 10000)
    return () => window.clearInterval(timer)
  }, [loadEvents])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${base}/api/locations`)
        if (!res.ok) return
        const body = await res.json()
        setLocations(Array.isArray(body) ? body : [])
      } catch (err) {
        console.error('load locations for scanner events error', err)
      }
    })()
  }, [base])

  const patchEvent = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`${base}/api/scanner/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('event_update_failed')
  }

  const ignoreEvent = async (event: ScannerEvent) => {
    setBusyId(event.id)
    setError(null)
    try {
      await patchEvent(event.id, { status: 'ignored' })
      await loadEvents()
    } catch {
      setError('Scan konnte nicht ignoriert werden')
    } finally {
      setBusyId(null)
    }
  }

  const addToStock = async (event: ScannerEvent) => {
    const locationId = Number(selectedLocations[event.id] || event.locationId || fallbackLocationId || 0)
    if (!locationId) {
      setError('Bitte zuerst ein Lager auswaehlen')
      return
    }
    const quantity = Number(quantities[event.id] || event.quantity || 1)

    setBusyId(event.id)
    setError(null)
    try {
      const res = await fetch(`${base}/api/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: event.productId || undefined,
          barcode: event.productId ? undefined : event.barcode,
          locationId,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        }),
      })
      if (!res.ok) throw new Error('stock_add_failed')
      await patchEvent(event.id, { status: 'processed', locationId })
      await loadEvents()
    } catch {
      setError('Scan konnte nicht eingebucht werden')
    } finally {
      setBusyId(null)
    }
  }

  const removeFromStock = async (event: ScannerEvent) => {
    const locationId = Number(selectedLocations[event.id] || event.locationId || fallbackLocationId || 0)
    if (!locationId) {
      setError('Bitte zuerst ein Lager auswaehlen')
      return
    }
    const quantity = Number(quantities[event.id] || event.quantity || 1)
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1

    setBusyId(event.id)
    setError(null)
    try {
      const stockRes = await fetch(`${base}/api/stock`)
      if (!stockRes.ok) throw new Error('stock_load_failed')
      const stockBody = await stockRes.json()
      const stocks: StockItem[] = Array.isArray(stockBody) ? stockBody : []
      const stock = stocks.find((item) => {
        const sameProduct = event.productId ? item.productId === event.productId : item.product?.barcode === event.barcode
        const itemLocationId = item.locationId || item.location?.id
        return sameProduct && itemLocationId === locationId
      })

      if (!stock) throw new Error('stock_not_found')
      if (Number(stock.quantity) < safeQuantity) throw new Error('stock_quantity_low')

      const res = await fetch(`${base}/api/stock/${stock.id}/reduce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: safeQuantity }),
      })
      if (!res.ok) throw new Error('stock_remove_failed')
      await patchEvent(event.id, { status: 'processed', locationId })
      await loadEvents()
    } catch (err: any) {
      if (err?.message === 'stock_not_found') setError('Kein passender Bestand in diesem Lager')
      else if (err?.message === 'stock_quantity_low') setError('Nicht genug Bestand in diesem Lager')
      else setError('Scan konnte nicht ausgebucht werden')
    } finally {
      setBusyId(null)
    }
  }

  if (!events.length && !error) return null

  return (
    <section className="mb-5 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-blue-950 dark:text-blue-100">ESP-Scans</h3>
          {lastUpdatedAt && (
            <div className="text-xs text-blue-900/70 dark:text-blue-200/70">
              Aktualisiert {lastUpdatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <button type="button" onClick={loadEvents} className="rounded border px-3 py-1 text-sm dark:border-gray-700">
          Aktualisieren
        </button>
      </div>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded bg-white p-3 shadow-sm dark:bg-gray-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {event.product?.name || event.barcode}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {event.device?.name || 'Scanner'} - {event.barcode} - {modeLabel(event.mode)}
                </div>
                {event.note && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{noteLabel(event.note)}</div>}
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(11rem,1fr)_5rem_auto_auto_auto] sm:items-center">
                <select
                  value={selectedLocations[event.id] || ''}
                  onChange={(changeEvent) =>
                    setSelectedLocations((current) => ({ ...current, [event.id]: changeEvent.target.value }))
                  }
                  className="text-sm text-black dark:bg-gray-800 dark:text-white"
                >
                  <option value="">Lager waehlen</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <input
                  value={quantities[event.id] || '1'}
                  onChange={(changeEvent) =>
                    setQuantities((current) => ({ ...current, [event.id]: changeEvent.target.value }))
                  }
                  inputMode="decimal"
                  className="text-sm text-black dark:bg-gray-800 dark:text-white"
                  aria-label="Menge"
                />
                {event.mode === 'stock_remove' ? (
                  <button
                    type="button"
                    disabled={busyId === event.id}
                    onClick={() => removeFromStock(event)}
                    className="action-fullmobile rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-60"
                  >
                    Ausbuchen
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === event.id}
                    onClick={() => addToStock(event)}
                    className="action-fullmobile rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-60"
                  >
                    Einbuchen
                  </button>
                )}
                {event.mode === 'stock_remove' ? (
                  <button
                    type="button"
                    disabled={busyId === event.id}
                    onClick={() => addToStock(event)}
                    className="action-fullmobile rounded border px-3 py-1 text-sm dark:border-gray-700 disabled:opacity-60"
                  >
                    Einbuchen
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === event.id}
                    onClick={() => removeFromStock(event)}
                    className="action-fullmobile rounded border px-3 py-1 text-sm dark:border-gray-700 disabled:opacity-60"
                  >
                    Ausbuchen
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === event.id}
                  onClick={() => ignoreEvent(event)}
                  className="action-fullmobile rounded border px-3 py-1 text-sm dark:border-gray-700 disabled:opacity-60"
                >
                  Ignorieren
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
