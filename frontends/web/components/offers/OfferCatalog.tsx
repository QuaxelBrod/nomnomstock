"use client"

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CurrentOffer, CurrentOffersResponse, OfferSettings } from 'nomnomstock-shared'

function formatMoney(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100)
}

function formatDate(value?: string | null) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' }).format(new Date(value))
  } catch {
    return ''
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return ''
  }
}

function confidenceText(value?: number) {
  if (typeof value !== 'number') return ''
  if (value >= 0.75) return 'sicher'
  if (value >= 0.45) return 'pruefen'
  return 'unsicher'
}

export default function OfferCatalog() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const [offers, setOffers] = useState<CurrentOffer[]>([])
  const [settings, setSettings] = useState<OfferSettings | null>(null)
  const [latestRefresh, setLatestRefresh] = useState<CurrentOffersResponse['latestRefresh']>(null)
  const [selectedRetailer, setSelectedRetailer] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOffers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${base}/api/offers/current?limit=180`)
      const data = (await res.json().catch(() => ({}))) as CurrentOffersResponse & {
        error?: { code?: string; message?: string }
      }
      if (!res.ok) {
        if (data?.error?.code === 'validation_error') throw new Error('Bitte im Profil zuerst eine PLZ fuer Angebote setzen.')
        throw new Error(data?.error?.message || 'Angebote konnten nicht geladen werden.')
      }
      setOffers(Array.isArray(data.offers) ? data.offers : [])
      setSettings(data.settings || null)
      setLatestRefresh(data.latestRefresh || null)
    } catch (err: any) {
      setOffers([])
      setError(err?.message || 'Angebote konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    loadOffers()
  }, [loadOffers])

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch(`${base}/api/offers/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = data?.error?.code || data?.error
        if (code === 'validation_error') throw new Error('Bitte im Profil zuerst eine PLZ fuer Angebote setzen.')
        throw new Error(data?.error?.message || 'Refresh fehlgeschlagen.')
      }
      await loadOffers()
    } catch (err: any) {
      setError(err?.message || 'Refresh fehlgeschlagen.')
    } finally {
      setRefreshing(false)
    }
  }

  const retailers = useMemo(() => {
    const fromSettings = settings?.retailers || []
    const fromOffers = offers.map((offer) => ({ key: offer.retailerKey, name: offer.retailerName }))
    const byKey = new Map<string, string>()
    for (const retailer of [...fromSettings, ...fromOffers]) byKey.set(retailer.key, retailer.name)
    return Array.from(byKey.entries()).map(([key, name]) => ({ key, name }))
  }, [offers, settings])

  const visibleOffers = useMemo(() => {
    if (selectedRetailer === 'all') return offers
    return offers.filter((offer) => offer.retailerKey === selectedRetailer)
  }, [offers, selectedRetailer])

  const groupedOffers = useMemo(() => {
    const groups = new Map<string, { retailerKey: string; retailerName: string; offers: CurrentOffer[] }>()
    for (const offer of visibleOffers) {
      const existing = groups.get(offer.retailerKey)
      if (existing) existing.offers.push(offer)
      else groups.set(offer.retailerKey, { retailerKey: offer.retailerKey, retailerName: offer.retailerName, offers: [offer] })
    }
    return Array.from(groups.values())
  }, [visibleOffers])

  const lastUpdated =
    latestRefresh?.finishedAt ||
    latestRefresh?.startedAt ||
    offers.map((offer) => offer.scanTarget?.lastRefreshedAt || offer.updatedAt || '').filter(Boolean).sort().at(-1) ||
    ''

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold">Angebote</h2>
          <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {settings?.postalCode ? `PLZ ${settings.postalCode}` : 'Keine PLZ gesetzt'}
            {lastUpdated ? ` - Stand ${formatDateTime(lastUpdated)}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
          className="action-fullmobile px-3 py-2 bg-emerald-600 text-white rounded disabled:opacity-60"
        >
          {refreshing ? 'Aktualisiere...' : 'Aktualisieren'}
        </button>
      </div>

      {retailers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedRetailer('all')}
            className={`shrink-0 px-3 py-2 rounded border text-sm ${
              selectedRetailer === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'
            }`}
          >
            Alle
          </button>
          {retailers.map((retailer) => (
            <button
              key={retailer.key}
              type="button"
              onClick={() => setSelectedRetailer(retailer.key)}
              className={`shrink-0 px-3 py-2 rounded border text-sm ${
                selectedRetailer === retailer.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'
              }`}
            >
              {retailer.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="border border-red-200 dark:border-red-900 rounded p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30">
          {error}{' '}
          {error.includes('PLZ') && (
            <Link href="/profil" className="underline">
              Profil oeffnen
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">Lade Angebote...</div>
      ) : groupedOffers.length === 0 && !error ? (
        <div className="border rounded p-4 text-sm text-gray-600 dark:text-gray-300 dark:border-gray-800">
          Keine aktuellen Angebote gefunden.
        </div>
      ) : (
        groupedOffers.map((group) => (
          <div key={group.retailerKey} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{group.retailerName}</h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">{group.offers.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.offers.map((offer) => (
                <article key={offer.id} className="border rounded bg-white dark:bg-gray-900 dark:border-gray-800 p-3">
                  <div className="flex gap-3">
                    {offer.imageUrl ? (
                      <img src={offer.imageUrl} alt="" className="w-20 h-20 rounded object-cover bg-gray-100 dark:bg-gray-800" />
                    ) : (
                      <div className="w-20 h-20 rounded bg-gray-100 dark:bg-gray-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium leading-snug">{offer.name}</h4>
                        <div className="shrink-0 text-right font-semibold">{formatMoney(offer.priceCents)}</div>
                      </div>
                      {offer.brand && <div className="text-sm text-gray-600 dark:text-gray-400">{offer.brand}</div>}
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {[offer.quantityText, offer.unitPriceCents ? `${formatMoney(offer.unitPriceCents)} / ${offer.unit || 'Einheit'}` : '', confidenceText(offer.confidence)]
                          .filter(Boolean)
                          .join(' - ')}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {offer.validUntil ? `bis ${formatDate(offer.validUntil)}` : offer.scanTarget?.label || ''}
                      </div>
                    </div>
                  </div>
                  {offer.description && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{offer.description}</p>}
                  {offer.sourceUrl && (
                    <a href={offer.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-600 dark:text-blue-400">
                      Quelle
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
