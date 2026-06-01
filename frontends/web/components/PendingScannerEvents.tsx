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
  product?: {
    name?: string
    brand?: string | null
    image?: string | null
  } | null
  device?: {
    name?: string
  } | null
}

export default function PendingScannerEvents({ fallbackLocationId }: { fallbackLocationId?: number | null }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const [events, setEvents] = useState<ScannerEvent[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/scanner/events?status=pending`)
      if (!res.ok) return
      const body = await res.json()
      setEvents(Array.isArray(body?.events) ? body.events : [])
    } catch (err) {
      console.error('load scanner events error', err)
    }
  }, [base])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

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
    const locationId = event.locationId || fallbackLocationId
    if (!locationId) {
      setError('Bitte zuerst ein Lager auswaehlen')
      return
    }

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
          quantity: event.quantity || 1,
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

  if (!events.length && !error) return null

  return (
    <section className="mb-5 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-blue-950 dark:text-blue-100">ESP-Scans</h3>
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
                  {event.device?.name || 'Scanner'} - {event.barcode}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busyId === event.id}
                  onClick={() => addToStock(event)}
                  className="action-fullmobile rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-60"
                >
                  Einbuchen
                </button>
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
