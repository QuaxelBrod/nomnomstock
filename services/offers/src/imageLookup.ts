import { envNumber, isTruthy } from './config'
import type { NormalizedOffer } from './types'

type ProductSearchResult = {
  product_name?: string
  generic_name?: string
  brands?: string
  image_url?: string
  image_front_url?: string
}

type Catalog = {
  searchUrl: string
}

const CATALOGS: Catalog[] = [
  { searchUrl: 'https://world.openfoodfacts.org/cgi/search.pl' },
  { searchUrl: 'https://world.openbeautyfacts.org/cgi/search.pl' },
]

const STOPWORDS = new Set([
  'angebot',
  'angebote',
  'aktion',
  'alle',
  'aus',
  'bei',
  'das',
  'dem',
  'den',
  'der',
  'die',
  'ein',
  'eine',
  'fur',
  'je',
  'mit',
  'nur',
  'oder',
  'pack',
  'packung',
  'statt',
  'und',
  'von',
  'zum',
])

const imageCache = new Map<string, string | null>()
let lastSearchAt = 0

export type OfferImageLookupBudget = {
  searches: number
  maxSearches: number
}

export function createOfferImageLookupBudget() {
  return {
    searches: 0,
    maxSearches: envNumber('OFFERS_IMAGE_LOOKUP_MAX_PER_REFRESH', 10),
  }
}

function imageLookupEnabled() {
  const raw = process.env.OFFERS_IMAGE_LOOKUP_ENABLED
  return raw == null || raw === '' ? true : isTruthy(raw)
}

function lookupUserAgent() {
  return process.env.OFFERS_IMAGE_LOOKUP_USER_AGENT || 'NomNomStockOffers/0.1 (+https://quaxel.de/nomnomstock)'
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchTextForOffer(offer: NormalizedOffer) {
  return [offer.brand, offer.name, offer.quantityText].filter(Boolean).join(' ')
}

function buildSearchQuery(offer: NormalizedOffer) {
  return normalizeText(searchTextForOffer(offer))
    .replace(/\b\d{1,3}[,.]\d{2}\b/g, ' ')
    .replace(/\b\d+\s*(?:g|kg|ml|l|stk|stuck|stueck)\b/g, ' ')
    .replace(/\b(?:ca|ab|nur|je)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function tokenVariants(token: string) {
  const variants = new Set([token])
  for (const suffix of ['chen', 'ern', 'en', 'er', 'es', 'e', 'n', 's']) {
    if (token.length > suffix.length + 4 && token.endsWith(suffix)) {
      variants.add(token.slice(0, -suffix.length))
    }
  }
  return variants
}

function tokenize(value: string) {
  const tokens = normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !STOPWORDS.has(token))

  const expanded = new Set<string>()
  for (const token of tokens) {
    for (const variant of tokenVariants(token)) expanded.add(variant)
  }
  return Array.from(expanded)
}

function tokenMatches(left: string, right: string) {
  return left === right || (left.length >= 5 && right.includes(left)) || (right.length >= 5 && left.includes(right))
}

function candidateText(product: ProductSearchResult) {
  return [product.brands, product.product_name, product.generic_name].filter(Boolean).join(' ')
}

function imageUrl(product: ProductSearchResult) {
  const value = product.image_front_url || product.image_url
  if (!value || !/^https?:\/\//i.test(value)) return null
  return value
}

function scoreProduct(offer: NormalizedOffer, product: ProductSearchResult) {
  const offerTokens = tokenize(searchTextForOffer(offer))
  const productTokens = tokenize(candidateText(product))
  if (!offerTokens.length || !productTokens.length) return 0

  let matches = 0
  for (const offerToken of offerTokens) {
    if (productTokens.some((productToken) => tokenMatches(offerToken, productToken))) matches += 1
  }

  let score = matches / offerTokens.length
  const brandTokens = tokenize(offer.brand || '')
  if (brandTokens.length && brandTokens.every((token) => productTokens.some((candidate) => tokenMatches(token, candidate)))) {
    score += 0.2
  }
  return score
}

function minimumScore(offer: NormalizedOffer) {
  const hasBrand = Boolean(offer.brand && offer.brand.trim())
  const tokenCount = tokenize(searchTextForOffer(offer)).length
  if (hasBrand) return 0.35
  return tokenCount <= 1 ? 0.65 : 0.45
}

async function waitForSearchSlot() {
  const delayMs = envNumber('OFFERS_IMAGE_LOOKUP_DELAY_MS', 6500)
  const elapsed = Date.now() - lastSearchAt
  if (elapsed < delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed))
  }
  lastSearchAt = Date.now()
}

async function fetchWithTimeout(url: string) {
  const timeoutMs = envNumber('OFFERS_IMAGE_LOOKUP_TIMEOUT_MS', 5000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': lookupUserAgent(),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function searchCatalog(catalog: Catalog, query: string, offer: NormalizedOffer) {
  const url = new URL(catalog.searchUrl)
  url.search = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '5',
    fields: 'product_name,generic_name,brands,image_url,image_front_url',
  }).toString()

  await waitForSearchSlot()
  const response = await fetchWithTimeout(url.toString())
  if (!response.ok) return null

  const parsed = (await response.json().catch(() => null)) as { products?: ProductSearchResult[] } | null
  const products = Array.isArray(parsed?.products) ? parsed.products : []

  let best: { score: number; image: string } | null = null
  for (const product of products) {
    const image = imageUrl(product)
    if (!image) continue
    const score = scoreProduct(offer, product)
    if (!best || score > best.score) best = { score, image }
  }

  if (!best || best.score < minimumScore(offer)) return null
  return best.image
}

async function lookupImage(offer: NormalizedOffer, canSearch: () => boolean) {
  const query = buildSearchQuery(offer)
  if (!query) return null

  const cached = imageCache.get(query)
  if (cached !== undefined) return cached

  for (const catalog of CATALOGS) {
    if (!canSearch()) break
    const image = await searchCatalog(catalog, query, offer).catch(() => null)
    if (image) {
      imageCache.set(query, image)
      return image
    }
  }

  imageCache.set(query, null)
  return null
}

export async function enrichOfferImages(offers: NormalizedOffer[], budget: OfferImageLookupBudget = createOfferImageLookupBudget()) {
  if (!imageLookupEnabled()) return offers

  const enriched: NormalizedOffer[] = []

  for (const offer of offers) {
    if (offer.imageUrl || budget.searches >= budget.maxSearches) {
      enriched.push(offer)
      continue
    }

    const image = await lookupImage(offer, () => {
      if (budget.searches >= budget.maxSearches) return false
      budget.searches += 1
      return true
    })

    enriched.push(image ? { ...offer, imageUrl: image, confidence: Math.max(offer.confidence || 0, 0.58) } : offer)
  }

  return enriched
}
