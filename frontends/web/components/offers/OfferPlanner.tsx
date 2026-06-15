"use client"

import { useEffect, useState } from 'react'
import type { OfferPlan } from 'nomnomstock-shared'

function formatMoney(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100)
}

function formatDate(value?: string | null) {
  if (!value) return 'unbekannt'
  try {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return 'unbekannt'
  }
}

function confidenceLabel(value: number) {
  if (value >= 0.75) return 'sicher'
  if (value >= 0.45) return 'pruefen'
  return 'unsicher'
}

export default function OfferPlanner({ itemCount }: { itemCount: number }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const [plan, setPlan] = useState<OfferPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`${base}/api/shopping/offer-plan/latest`)
        if (!res.ok) return
        const data = await res.json()
        if (active) setPlan(data?.plan || null)
      } catch {
        // Latest plan is optional.
      }
    })()
    return () => {
      active = false
    }
  }, [base])

  const startPlan = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${base}/api/shopping/offer-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = data?.error?.code || data?.error
        if (code === 'validation_error') throw new Error('Bitte im Profil zuerst eine PLZ fuer Angebote setzen.')
        throw new Error(data?.error?.message || 'Angebotsplanung fehlgeschlagen')
      }
      setPlan(data?.plan || null)
    } catch (err: any) {
      setError(err?.message || 'Angebotsplanung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mb-4 border rounded bg-white dark:bg-gray-900 dark:border-gray-800 p-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Angebotsplanung</h3>
          {plan?.createdAt ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Stand: {formatDate(plan.createdAt)}</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Maximal 3 Geschaefte, regional nach PLZ.</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => startPlan(false)}
            disabled={loading || itemCount === 0}
            className="action-fullmobile px-3 py-2 bg-emerald-600 text-white rounded disabled:opacity-60"
          >
            {loading ? 'Plane...' : 'Angebote planen'}
          </button>
          <button
            onClick={() => startPlan(true)}
            disabled={loading || itemCount === 0}
            className="action-fullmobile px-3 py-2 border rounded disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {plan && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="border rounded p-2 dark:border-gray-800">
              <div className="text-xs text-gray-500">Summe</div>
              <div className="font-semibold">{formatMoney(plan.totalCents)}</div>
            </div>
            <div className="border rounded p-2 dark:border-gray-800">
              <div className="text-xs text-gray-500">Treffer</div>
              <div className="font-semibold">{plan.matchedItems}</div>
            </div>
            <div className="border rounded p-2 dark:border-gray-800">
              <div className="text-xs text-gray-500">Fehlend</div>
              <div className="font-semibold">{plan.missingItems.length}</div>
            </div>
            <div className="border rounded p-2 dark:border-gray-800">
              <div className="text-xs text-gray-500">PLZ</div>
              <div className="font-semibold">{plan.postalCode}</div>
            </div>
          </div>

          {plan.stores.length ? (
            <div className="space-y-3">
              {plan.stores.map((store) => (
                <div key={store.retailerKey} className="border rounded p-3 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium">{store.retailerName}</h4>
                    <span className="text-sm font-semibold">{formatMoney(store.totalCents)}</span>
                  </div>
                  <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                    {store.matches.map((match) => (
                      <li key={`${match.itemId}-${match.offerId}`} className="py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{match.productName}</div>
                            <div className="text-gray-600 dark:text-gray-400">
                              {match.offerName}
                              {match.offerBrand ? `, ${match.offerBrand}` : ''}
                            </div>
                            <div className="text-xs text-gray-500">
                              {match.matchType} - {confidenceLabel(match.confidence)}
                              {match.validUntil ? ` - bis ${formatDate(match.validUntil)}` : ''}
                            </div>
                          </div>
                          <div className="text-right font-semibold">{formatMoney(match.priceCents)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">Noch keine passenden Angebote gefunden.</p>
          )}

          {plan.substitutes.length > 0 && (
            <div className="border rounded p-3 dark:border-gray-800">
              <h4 className="font-medium text-sm">Ersatzvorschlaege</h4>
              <ul className="mt-2 space-y-2">
                {plan.substitutes.slice(0, 6).map((match) => (
                  <li key={`sub-${match.itemId}-${match.offerId}`} className="text-sm text-gray-700 dark:text-gray-300">
                    {match.productName}: {match.offerName} bei {match.retailerName} fuer {formatMoney(match.priceCents)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.missingItems.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Fehlend: {plan.missingItems.map((item) => item.productName).join(', ')}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
