export type RetailerKey = 'aldi' | 'kaufland' | 'lidl' | 'rewe'
export type ScopeType = 'postalCode' | 'storeId' | 'regionId'

export type ScanTargetInput = {
  retailerKey: RetailerKey
  retailerName: string
  scopeType: ScopeType
  scopeValue: string
  postalCode?: string | null
  storeId?: string | null
  regionId?: string | null
  label: string
  sourceUrl?: string | null
}

export type OfferSource = {
  url: string
  body: string
  contentType?: string | null
  method: 'html' | 'json' | 'pdf' | 'image' | 'fixture'
}

export type RawOffer = {
  externalId?: string | null
  name: string
  brand?: string | null
  description?: string | null
  priceCents: number
  unitPriceCents?: number | null
  unit?: string | null
  quantityText?: string | null
  validFrom?: string | null
  validUntil?: string | null
  confidence?: number
  imageUrl?: string | null
  rawText?: string | null
  extractionMethod: string
}

export type NormalizedOffer = RawOffer & {
  retailerKey: RetailerKey
  retailerName: string
  sourceUrl?: string | null
  sourceFingerprint: string
}

export type ShoppingProduct = {
  id?: number
  barcode?: string | null
  name: string
  brand?: string | null
}

export type ShoppingItem = {
  id: number
  productId?: number
  quantity: number
  unit?: string | null
  note?: string | null
  product: ShoppingProduct
}

export type OfferMatch = {
  itemId: number
  productName: string
  retailerKey: string
  retailerName: string
  offerId: number
  offerName: string
  offerBrand?: string | null
  priceCents: number
  unit?: string | null
  quantityText?: string | null
  validUntil?: string | null
  sourceUrl?: string | null
  score: number
  matchType: 'exact' | 'fuzzy' | 'substitute'
  confidence: number
}

export type OfferPlanResult = {
  id?: number
  createdAt?: string
  postalCode: string
  maxStores: number
  selectedRetailers: string[]
  totalCents: number
  matchedItems: number
  missingItems: Array<{ itemId: number; productName: string }>
  stores: Array<{
    retailerKey: string
    retailerName: string
    totalCents: number
    matches: OfferMatch[]
  }>
  substitutes: OfferMatch[]
  dataFreshness: Array<{
    retailerKey: string
    retailerName: string
    scopeValue: string
    lastRefreshedAt?: string | null
  }>
}
