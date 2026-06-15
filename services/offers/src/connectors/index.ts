import type { NormalizedOffer, OfferSource, RetailerKey, ScanTargetInput } from '../types'
import { aldiConnector } from './aldi'
import { capConnector } from './cap'
import { edekaConnector } from './edeka'
import { extractGenericOffers } from './generic'
import { kauflandConnector } from './kaufland'
import { lidlConnector } from './lidl'
import { marktkaufConnector } from './marktkauf'
import { nettoConnector } from './netto'
import { normaConnector } from './norma'
import { reweConnector } from './rewe'
import type { RetailerConnector } from './types'

const CONNECTORS: Record<RetailerKey, RetailerConnector> = {
  aldi: aldiConnector,
  cap: capConnector,
  edeka: edekaConnector,
  kaufland: kauflandConnector,
  lidl: lidlConnector,
  marktkauf: marktkaufConnector,
  netto: nettoConnector,
  norma: normaConnector,
  rewe: reweConnector,
}

export function connectorFor(retailerKey: RetailerKey) {
  return CONNECTORS[retailerKey]
}

export function resolveScanTargets(postalCode: string, retailerKeys: RetailerKey[]): ScanTargetInput[] {
  return retailerKeys.flatMap((retailerKey) => connectorFor(retailerKey).resolveScanTargets(postalCode))
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
  const connector = connectorFor(target.retailerKey)
  const timeoutMs = Number(process.env.OFFERS_FETCH_TIMEOUT_MS || 15000)
  const sources: OfferSource[] = []

  for (const url of connector.sourceUrls(target)) {
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
  return connectorFor(target.retailerKey).extractOffers?.(target, source) || extractGenericOffers(target, source)
}
