import { RETAILERS } from '../config'
import type { NormalizedOffer, OfferSource, RetailerKey, ScanTargetInput } from '../types'
import { extractStructuredOffers, extractTextOffers, extractVisionFallbackOffers, normalizeOffers } from './common'
import type { RetailerConnector } from './types'

export function appendPostalCode(url: string, postalCode?: string | null) {
  if (!postalCode) return url
  const parsed = new URL(url)
  if (!parsed.searchParams.has('plz')) parsed.searchParams.set('plz', postalCode)
  return parsed.toString()
}

export function makeStaticRetailerConnector(retailerKey: RetailerKey): RetailerConnector {
  return {
    key: retailerKey,
    resolveScanTargets(postalCode: string) {
      const retailer = RETAILERS[retailerKey]
      return [
        {
          retailerKey,
          retailerName: retailer.name,
          scopeType: 'postalCode',
          scopeValue: postalCode,
          postalCode,
          label: `${retailer.name} ${postalCode}`,
          sourceUrl: retailer.urls[0],
        },
      ]
    },
    sourceUrls(target) {
      return RETAILERS[retailerKey].urls.map((url) => appendPostalCode(url, target.postalCode))
    },
  }
}

export async function extractGenericOffers(target: ScanTargetInput, source: OfferSource): Promise<NormalizedOffer[]> {
  const structured = extractStructuredOffers(source)
  const raw = structured.length ? structured : extractTextOffers(source)
  const withFallback = raw.length ? raw : await extractVisionFallbackOffers(source)
  return normalizeOffers(target, source, withFallback)
}
