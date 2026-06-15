import { RETAILERS } from '../config'
import type { NormalizedOffer, OfferSource, RawOffer, ScanTargetInput } from '../types'
import { dedupeRawOffers, htmlToText, normalizeOffers, parsePriceCents } from './common'
import { appendPostalCode, extractGenericOffers, makeStaticRetailerConnector } from './generic'

function absoluteUrl(baseUrl: string, value: string | null) {
  if (!value) return null
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function extractAttribute(block: string, name: string) {
  const match = block.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))
  return match?.[1] || null
}

function extractImageUrl(block: string, sourceUrl: string) {
  const direct = extractAttribute(block, 'data-src') || extractAttribute(block, 'src')
  if (direct && !direct.startsWith('data:')) return absoluteUrl(sourceUrl, direct)

  const srcset = extractAttribute(block, 'srcset') || extractAttribute(block, 'data-srcset')
  const first = srcset?.split(',')?.[0]?.trim()?.split(/\s+/)?.[0] || null
  if (!first || first.startsWith('data:')) return null
  return absoluteUrl(sourceUrl, first)
}

function collectAnchorBlocks(html: string) {
  const blocks: string[] = []
  const regex = /<a\b[\s\S]*?<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html))) {
    const block = match[0]
    const text = htmlToText(block)
    if (!/\d{1,4}\s*,\s*\d{2}/.test(text)) continue
    if (!/(aktueller preis|kundenbewertung|sie sparen|uvp|nur|ab)\b/i.test(text)) continue
    blocks.push(block)
  }
  return blocks
}

function cleanOfferName(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\bKundenbewertung:[\s\S]*$/i, '')
    .replace(/\b(?:nur|ab)\s+\d{1,4}\s*,\s*\d{2}[\s\S]*$/i, '')
    .replace(/\b-\d+\s*%[\s\S]*$/i, '')
    .replace(/\bSie sparen[\s\S]*$/i, '')
    .replace(/\bUVP[\s\S]*$/i, '')
    .trim()
    .slice(0, 180)
}

function extractPrice(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const pricePatterns = [
    /Aktueller Preis:\s*(\d{1,4}\s*,\s*\d{2})/i,
    /\b(?:nur|ab)\s+(\d{1,4}\s*,\s*\d{2})/i,
    /€\s*(\d{1,4}\s*,\s*\d{2})/i,
    /(\d{1,4}\s*,\s*\d{2})\s*\*/i,
  ]

  for (const pattern of pricePatterns) {
    const match = normalized.match(pattern)
    const price = parsePriceCents(match?.[1])
    if (price) return price
  }

  return null
}

export function extractMarktkaufRawOffers(source: OfferSource): RawOffer[] {
  if (/Access Denied/i.test(source.body)) return []
  if (/w[aä]hle bitte eine Filiale/i.test(htmlToText(source.body)) && !source.url.includes('/online-wochenangebote/')) {
    return []
  }

  const offers: RawOffer[] = []
  for (const block of collectAnchorBlocks(source.body)) {
    const text = htmlToText(block)
    const priceCents = extractPrice(text)
    const name = cleanOfferName(text)
    if (!name || !priceCents) continue

    const href = extractAttribute(block, 'href')
    const productUrl = absoluteUrl(source.url, href)

    offers.push({
      externalId: productUrl || href || name,
      name,
      priceCents,
      imageUrl: extractImageUrl(block, source.url),
      extractionMethod: 'marktkauf-html',
      confidence: 0.78,
      rawText: text.slice(0, 1000),
    })
  }

  return dedupeRawOffers(offers)
}

async function extractMarktkaufOffers(target: ScanTargetInput, source: OfferSource): Promise<NormalizedOffer[]> {
  const raw = extractMarktkaufRawOffers(source)
  if (raw.length) return normalizeOffers(target, source, raw)
  return extractGenericOffers(target, source)
}

export const marktkaufConnector = {
  ...makeStaticRetailerConnector('marktkauf'),
  sourceUrls(target: ScanTargetInput) {
    return RETAILERS.marktkauf.urls.map((url) => (url.includes('/marktangebote') ? appendPostalCode(url, target.postalCode) : url))
  },
  extractOffers: extractMarktkaufOffers,
}
