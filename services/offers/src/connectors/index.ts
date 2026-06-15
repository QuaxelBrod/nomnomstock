import { RETAILERS } from '../config'
import type { NormalizedOffer, OfferSource, RetailerKey, ScanTargetInput } from '../types'
import { extractStructuredOffers, extractTextOffers, extractVisionFallbackOffers, normalizeOffers } from './common'

export function resolveScanTargets(postalCode: string, retailerKeys: RetailerKey[]): ScanTargetInput[] {
  return retailerKeys.map((retailerKey) => {
    const retailer = RETAILERS[retailerKey]
    return {
      retailerKey,
      retailerName: retailer.name,
      scopeType: 'postalCode',
      scopeValue: postalCode,
      postalCode,
      label: `${retailer.name} ${postalCode}`,
      sourceUrl: retailer.urls[0],
    }
  })
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'NomNomStockOffers/0.1 (+https://quaxel.de/nomnomstock)',
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchSources(target: ScanTargetInput): Promise<OfferSource[]> {
  const retailer = RETAILERS[target.retailerKey]
  const timeoutMs = Number(process.env.OFFERS_FETCH_TIMEOUT_MS || 15000)
  const sources: OfferSource[] = []

  for (const rawUrl of retailer.urls) {
    const url = rawUrl.includes('?') ? `${rawUrl}&plz=${encodeURIComponent(target.postalCode || '')}` : rawUrl
    const response = await fetchWithTimeout(url, timeoutMs)
    if (!response.ok) throw new Error(`source_fetch_failed:${response.status}`)
    const contentType = response.headers.get('content-type')
    const isImage = Boolean(contentType?.startsWith('image/'))
    const body = isImage
      ? `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
      : await response.text()
    sources.push({
      url,
      body,
      contentType,
      method: isImage ? 'image' : contentType?.includes('json') ? 'json' : contentType?.includes('pdf') ? 'pdf' : 'html',
    })
  }

  return sources
}

export async function extractOffers(target: ScanTargetInput, source: OfferSource): Promise<NormalizedOffer[]> {
  const structured = extractStructuredOffers(source)
  const raw = structured.length ? structured : extractTextOffers(source)
  const withFallback = raw.length ? raw : await extractVisionFallbackOffers(source)
  return normalizeOffers(target, source, withFallback)
}
