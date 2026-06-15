import { createHash } from 'crypto'
import type { NormalizedOffer, OfferSource, RawOffer, ScanTargetInput } from '../types'

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function clampConfidence(value: unknown, fallback = 0.6) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0.05, Math.min(1, parsed))
}

export function parsePriceCents(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value * 100)
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\d,.]/g, '')
    .trim()
  if (!text) return null

  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) return null
  return Math.round(parsed * 100)
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function collectJsonLd(html: string) {
  const blocks: unknown[] = []
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1].trim()))
    } catch {
      // Ignore invalid embedded data.
    }
  }
  return blocks
}

function collectPotentialOfferObjects(value: unknown, out: any[] = []) {
  if (!value || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const item of value) collectPotentialOfferObjects(item, out)
    return out
  }

  const obj = value as Record<string, unknown>
  const hasName = typeof obj.name === 'string' || typeof obj.title === 'string'
  const offerLike = obj.offers || obj.price || obj.priceSpecification || obj.lowPrice || obj.highPrice
  if (hasName && offerLike) out.push(obj)

  for (const nested of Object.values(obj)) collectPotentialOfferObjects(nested, out)
  return out
}

function valueFromPath(obj: any, paths: string[]) {
  for (const path of paths) {
    const parts = path.split('.')
    let current = obj
    for (const part of parts) {
      if (current == null) break
      current = Array.isArray(current) ? current[0]?.[part] : current[part]
    }
    if (current != null && current !== '') return current
  }
  return null
}

export function extractStructuredOffers(source: OfferSource): RawOffer[] {
  const blocks = collectJsonLd(source.body)
  const candidates = blocks.flatMap((block) => collectPotentialOfferObjects(block))
  const offers: RawOffer[] = []

  for (const candidate of candidates) {
    const name = String(valueFromPath(candidate, ['name', 'title']) || '').trim()
    const brandRaw = valueFromPath(candidate, ['brand.name', 'brand'])
    const priceRaw = valueFromPath(candidate, [
      'offers.price',
      'offers.lowPrice',
      'offers.priceSpecification.price',
      'price',
      'priceSpecification.price',
      'lowPrice',
    ])
    const priceCents = parsePriceCents(priceRaw)
    if (!name || !priceCents) continue

    offers.push({
      externalId: valueFromPath(candidate, ['sku', 'gtin13', 'gtin', '@id']) || null,
      name,
      brand: brandRaw ? String(brandRaw) : null,
      description: valueFromPath(candidate, ['description']) || null,
      priceCents,
      validFrom: valueFromPath(candidate, ['offers.validFrom', 'validFrom']) || null,
      validUntil: valueFromPath(candidate, ['offers.validThrough', 'offers.validUntil', 'validUntil']) || null,
      imageUrl: valueFromPath(candidate, ['image.0', 'image']) || null,
      extractionMethod: 'structured-html',
      confidence: 0.82,
      rawText: name,
    })
  }

  return dedupeRawOffers(offers)
}

export function extractTextOffers(source: OfferSource): RawOffer[] {
  const text = htmlToText(source.body)
  if (!text) return []

  const offers: RawOffer[] = []
  const priceRegex = /([A-ZÄÖÜa-zäöü0-9][A-ZÄÖÜa-zäöü0-9 .,'’\-&/()]{4,90}?)\s+(?:nur\s+|ab\s+|je\s+)?(\d{1,3}[,.]\d{2})\s*(?:€|EUR)?/g
  let match: RegExpExecArray | null
  while ((match = priceRegex.exec(text))) {
    const name = match[1]
      .replace(/\b(Angebot|Angebote|Preis|Aktion|statt|nur|je|ab)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const priceCents = parsePriceCents(match[2])
    if (!name || !priceCents || name.length < 4) continue
    if (/^\d/.test(name)) continue

    offers.push({
      name: name.slice(-90),
      priceCents,
      extractionMethod: source.method === 'pdf' ? 'pdf-text' : 'html-text',
      confidence: 0.48,
      rawText: match[0].slice(0, 240),
    })
  }

  return dedupeRawOffers(offers).slice(0, 200)
}

function openAiPath(baseUrl: string, pathName: string) {
  const base = baseUrl.replace(/\/$/, '')
  return base.endsWith('/v1') ? `${base}${pathName}` : `${base}/v1${pathName}`
}

function extractJsonArray(text: string) {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) return trimmed
  const match = trimmed.match(/\[[\s\S]*\]/)
  return match ? match[0] : ''
}

export async function extractVisionFallbackOffers(source: OfferSource): Promise<RawOffer[]> {
  if (process.env.OFFERS_VISION_ENABLED !== 'true') return []
  if (source.method !== 'image' && !String(source.contentType || '').startsWith('image/')) return []

  const baseUrl = process.env.OFFERS_VISION_BASE_URL || process.env.LLM_BASE_URL
  if (!baseUrl) return []

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = process.env.OFFERS_VISION_API_KEY || process.env.LLM_API_KEY
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetch(openAiPath(baseUrl, '/chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.OFFERS_VISION_MODEL || process.env.LLM_MODEL || 'local-vision-model',
      stream: false,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Extrahiere Angebote aus Prospektbildern. Antworte nur als JSON-Array. Felder: name, brand, price, unit, quantityText, validFrom, validUntil, confidence.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Lies dieses Angebotsbild und extrahiere nur klar erkennbare Produktangebote.' },
            { type: 'image_url', image_url: { url: source.body } },
          ],
        },
      ],
    }),
  })

  if (!response.ok) return []
  const parsed = await response.json().catch(() => null)
  const content = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || ''
  const json = extractJsonArray(String(content))
  if (!json) return []

  let rows: any[] = []
  try {
    const decoded = JSON.parse(json)
    rows = Array.isArray(decoded) ? decoded : []
  } catch {
    return []
  }

  const offers: RawOffer[] = []
  for (const row of rows) {
    const name = String(row?.name || '').trim()
    const priceCents = parsePriceCents(row?.price ?? row?.priceCents)
    if (!name || !priceCents) continue
    offers.push({
      name,
      brand: row?.brand ? String(row.brand) : null,
      priceCents,
      unit: row?.unit ? String(row.unit) : null,
      quantityText: row?.quantityText ? String(row.quantityText) : null,
      validFrom: row?.validFrom ? String(row.validFrom) : null,
      validUntil: row?.validUntil ? String(row.validUntil) : null,
      confidence: clampConfidence(row?.confidence, 0.42),
      extractionMethod: 'local-vision',
      rawText: JSON.stringify(row).slice(0, 1000),
    })
  }
  return offers
}

export function dedupeRawOffers(offers: RawOffer[]) {
  const seen = new Set<string>()
  const unique: RawOffer[] = []
  for (const offer of offers) {
    const key = `${offer.name.toLowerCase()}|${offer.priceCents}|${offer.validUntil || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(offer)
  }
  return unique
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeOffers(target: ScanTargetInput, source: OfferSource, rawOffers: RawOffer[]): NormalizedOffer[] {
  const fingerprint = sha256(source.body)
  return rawOffers
    .filter((offer) => offer.name && Number.isFinite(offer.priceCents) && offer.priceCents > 0)
    .map((offer) => ({
      ...offer,
      name: offer.name.trim().slice(0, 180),
      brand: offer.brand ? String(offer.brand).trim().slice(0, 120) : null,
      description: offer.description ? String(offer.description).trim().slice(0, 500) : null,
      confidence: clampConfidence(offer.confidence),
      validFrom: parseDate(offer.validFrom),
      validUntil: parseDate(offer.validUntil),
      retailerKey: target.retailerKey,
      retailerName: target.retailerName,
      sourceUrl: source.url,
      sourceFingerprint: fingerprint,
    }))
}
