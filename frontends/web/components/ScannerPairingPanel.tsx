"use client"

import { useCallback, useEffect, useState } from 'react'
import Code128Barcode from './Code128Barcode'

type Pairing = {
  id: number
  key: string
  keyPrefix: string
  apiBase: string
  expiresAt: string
  defaultMode: string
  defaultLocationId?: number | null
}

type Device = {
  id: number
  name: string
  type: string
  status: string
  defaultMode: string
  defaultLocationId?: number | null
  lastSeenAt?: string | null
}

type RotatedToken = {
  deviceId: number
  deviceName: string
  token: string
  apiBase: string
  tokenPrefix: string
}

type Location = {
  id: number
  name: string
}

type ScannerMode = 'lookup' | 'stock_add' | 'stock_remove' | 'shopping_check'

const SCANNER_MODE_LABELS: Record<ScannerMode, string> = {
  lookup: 'Scan erfassen',
  stock_add: 'Einbuchen',
  stock_remove: 'Ausbuchen',
  shopping_check: 'Einkauf pruefen',
}

function scannerModeLabel(mode: string) {
  return SCANNER_MODE_LABELS[mode as ScannerMode] || mode
}

export default function ScannerPairingPanel() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const [locations, setLocations] = useState<Location[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [name, setName] = useState('ESP Scanner')
  const [defaultLocationId, setDefaultLocationId] = useState('')
  const [defaultMode, setDefaultMode] = useState<ScannerMode>('lookup')
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [rotatedToken, setRotatedToken] = useState<RotatedToken | null>(null)
  const [busyDeviceId, setBusyDeviceId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDevices = useCallback(async () => {
    const res = await fetch(`${base}/api/devices`)
    if (!res.ok) return
    const body = await res.json()
    setDevices(Array.isArray(body?.devices) ? body.devices : [])
  }, [base])

  useEffect(() => {
    ;(async () => {
      try {
        const [locationsRes] = await Promise.all([fetch(`${base}/api/locations`), loadDevices()])
        if (locationsRes.ok) {
          const body = await locationsRes.json()
          setLocations(Array.isArray(body) ? body : [])
        }
      } catch (err) {
        console.error('scanner pairing init error', err)
      }
    })()
  }, [base, loadDevices])

  const createPairing = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setPairing(null)
    setRotatedToken(null)

    try {
      const res = await fetch(`${base}/api/devices/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'ESP Scanner',
          type: 'esp-scanner',
          defaultMode,
          defaultLocationId: defaultLocationId ? Number(defaultLocationId) : null,
          ttlSeconds: 600,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || body?.error || 'pairing_failed')
      setPairing(body.pairing)
      await loadDevices()
    } catch (err: any) {
      setError(err?.message || 'Kopplung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const revokeDevice = async (id: number) => {
    setBusyDeviceId(id)
    const res = await fetch(`${base}/api/devices/${id}/revoke`, { method: 'POST' })
    if (res.ok) await loadDevices()
    setBusyDeviceId(null)
  }

  const rotateToken = async (device: Device) => {
    setBusyDeviceId(device.id)
    setError(null)
    setRotatedToken(null)

    try {
      const res = await fetch(`${base}/api/devices/${device.id}/rotate-token`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || body?.error || 'rotate_failed')
      setRotatedToken({
        deviceId: device.id,
        deviceName: device.name,
        token: body.token,
        apiBase: body.apiBase,
        tokenPrefix: body.tokenPrefix,
      })
      await loadDevices()
    } catch (err: any) {
      setError(err?.message || 'Token-Rotation fehlgeschlagen')
    } finally {
      setBusyDeviceId(null)
    }
  }

  return (
    <section className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-800">
      <h3 className="mb-3 text-sm font-medium">Scanner koppeln</h3>

      <form onSubmit={createPairing} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="text-black dark:bg-gray-800 dark:text-white"
          placeholder="Scannername"
        />
        <select
          value={defaultLocationId}
          onChange={(event) => setDefaultLocationId(event.target.value)}
          className="text-black dark:bg-gray-800 dark:text-white"
        >
          <option value="">Standard-Lager</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading} className="action-fullmobile rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60">
          {loading ? 'Erzeuge...' : 'Koppeln'}
        </button>
        <div className="sm:col-span-3">
          <select
            value={defaultMode}
            onChange={(event) => setDefaultMode(event.target.value as ScannerMode)}
            className="max-w-xs text-black dark:bg-gray-800 dark:text-white"
          >
            <option value="lookup">Modus: {SCANNER_MODE_LABELS.lookup}</option>
            <option value="stock_add">Modus: {SCANNER_MODE_LABELS.stock_add}</option>
            <option value="stock_remove">Modus: {SCANNER_MODE_LABELS.stock_remove}</option>
            <option value="shopping_check">Modus: {SCANNER_MODE_LABELS.shopping_check}</option>
          </select>
        </div>
      </form>

      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}

      {pairing && (
        <div className="mt-4 overflow-hidden rounded border bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <Code128Barcode value={pairing.key} />
          <div className="mt-3 grid gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Pairing-Key:</span>{' '}
              <strong className="break-all text-black dark:text-white">{pairing.key}</strong>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">API:</span>{' '}
              <span className="break-all">{pairing.apiBase}</span>
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              Gueltig bis {new Date(pairing.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      )}

      {rotatedToken && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <div className="font-medium text-amber-950 dark:text-amber-100">
            Neuer Token fuer {rotatedToken.deviceName}
          </div>
          <div className="mt-2 break-all">
            <span className="text-gray-600 dark:text-gray-400">Token:</span>{' '}
            <strong className="text-black dark:text-white">{rotatedToken.token}</strong>
          </div>
          <div className="mt-1 break-all text-gray-600 dark:text-gray-400">API: {rotatedToken.apiBase}</div>
          <div className="mt-1 text-gray-600 dark:text-gray-400">Der alte Token ist widerrufen. Dieser Wert wird nur hier angezeigt.</div>
        </div>
      )}

      {devices.length > 0 && (
        <div className="mt-5 space-y-2">
          {devices.map((device) => (
            <div key={device.id} className="flex flex-col gap-2 rounded border p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{device.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {device.status} - {device.type} - {scannerModeLabel(device.defaultMode)}
                </div>
              </div>
              {device.status === 'active' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={busyDeviceId === device.id}
                    onClick={() => rotateToken(device)}
                    className="action-fullmobile rounded border border-blue-300 px-3 py-1 text-sm text-blue-700 disabled:opacity-60 dark:border-blue-800 dark:text-blue-300"
                  >
                    Token rotieren
                  </button>
                  <button
                    type="button"
                    disabled={busyDeviceId === device.id}
                    onClick={() => revokeDevice(device.id)}
                    className="action-fullmobile rounded border border-red-300 px-3 py-1 text-sm text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
                  >
                    Widerrufen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
