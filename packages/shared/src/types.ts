export type ID = number

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiHealth = {
  ok: true
}

export type Product = {
  id: ID
  barcode: string
  name: string
  brand?: string | null
  image?: string | null
  createdAt?: string
}

export type ProductLookupRequest = {
  barcode: string
}

export type ProductLookupResponse = {
  found: boolean
  product?: Product
}

export type ProductCreateRequest = {
  name: string
  brand?: string | null
  barcode?: string
  image?: string | null
}

export type Location = {
  id: ID
  name: string
  householdId?: number | null
  createdAt?: string
}

export type LocationCreateRequest = {
  name: string
  householdId?: ID
}

export type LocationUpdateRequest = {
  name: string
}

export type Stock = {
  id: ID
  productId: ID
  locationId: ID
  quantity: number
  unit?: string | null
  mhd?: string | null
  householdId?: ID | null
  product?: Product
  location?: Location
  createdAt?: string
}

export type StockAddRequest = {
  productId?: ID
  barcode?: string
  locationId: ID
  quantity?: number
  unit?: string | null
  mhd?: string | null
  householdId?: ID
}

export type StockReduceRequest = {
  amount?: number
  toShopping?: boolean
  userId?: ID
}

export type StockReduceResponse = {
  ok: true
  deleted?: boolean
  updated?: Stock
}

export type StockMoveRequest = {
  fromStockId: ID
  toLocationId: ID
  amount?: number
}

export type OkResponse = {
  ok: true
}

export type ShoppingListItem = {
  id: ID
  productId: ID
  householdId: ID
  quantity: number
  note?: string | null
  unit?: string | null
  product?: Product
  addedBy?: UserPublic | null
  createdAt?: string
}

export type ShoppingListResponse = {
  items: ShoppingListItem[]
}

export type ShoppingListAddRequest = {
  productId?: ID
  name?: string
  note?: string | null
  quantity?: number
}

export type ShoppingListUpdateRequest = {
  quantity?: number
  note?: string | null
}

export type OfferRetailer = {
  key: 'aldi' | 'kaufland' | 'lidl' | 'rewe' | string
  name: string
}

export type OfferSettings = {
  id: ID
  householdId: ID
  postalCode: string
  retailerKeys: string[]
  maxStores: number
  retailers: OfferRetailer[]
}

export type OfferSettingsResponse = {
  settings: OfferSettings
}

export type OfferSettingsUpdateRequest = {
  postalCode?: string
  retailerKeys?: string[]
  maxStores?: number
}

export type OfferMatch = {
  itemId: ID
  productName: string
  retailerKey: string
  retailerName: string
  offerId: ID
  offerName: string
  offerBrand?: string | null
  priceCents: number
  unit?: string | null
  quantityText?: string | null
  validUntil?: string | null
  sourceUrl?: string | null
  score: number
  matchType: 'exact' | 'fuzzy' | 'substitute' | string
  confidence: number
}

export type OfferPlan = {
  id?: ID
  createdAt?: string
  postalCode: string
  maxStores: number
  selectedRetailers: string[]
  totalCents: number
  matchedItems: number
  missingItems: Array<{ itemId: ID; productName: string }>
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

export type OfferPlanResponse = {
  plan: OfferPlan | null
}

export type OfferRefreshResponse = {
  run: {
    id: ID
    status: string
    scannedTargets: number
    changedTargets: number
    offersFound: number
    message?: string | null
    startedAt: string
    finishedAt?: string | null
  }
}

export type UserPublic = {
  id: ID
  email: string
  name?: string | null
  role?: string
  householdId?: ID | null
  image?: string | null
}

export type ProfileUpdateResponse = {
  ok: true
  image: string | null
}

export type RecipeAvailableItem = {
  id: ID
  name: string
  quantity: number
  unit?: string | null
}

export type RecipeGenerateRequest = {
  userInput?: string
}

export type RecipeGenerateResponse = {
  recipe: string
}

export type RecipeEmailRequest = {
  recipe: string
  subject?: string
}

export type InviteRequest = {
  email: string
}

export type RegisterRequest = {
  email: string
  password: string
  name?: string | null
  inviteToken?: string | null
}

export type RegisterResponse = {
  ok: true
  message: string
}

export type Device = {
  id: ID
  name: string
  type: string
  status: string
  householdId: ID
  defaultLocationId?: ID | null
  defaultMode: string
  lastSeenAt?: string | null
  createdAt?: string
  updatedAt?: string
  tokens?: ApiTokenPublic[]
}

export type ApiTokenPublic = {
  id: ID
  tokenPrefix: string
  scopes: string[]
  lastUsedAt?: string | null
  expiresAt?: string | null
  revokedAt?: string | null
  createdAt?: string
}

export type DevicePairingCreateRequest = {
  name?: string
  type?: string
  defaultLocationId?: ID | null
  defaultMode?: 'lookup' | 'stock_add' | 'shopping_check'
  scopes?: string[]
  ttlSeconds?: number
}

export type DevicePairingCreateResponse = {
  ok: true
  pairing: {
    id: ID
    key: string
    keyPrefix: string
    apiBase: string
    qrPayload: string
    expiresAt: string
    scopes: string[]
    defaultMode: string
    defaultLocationId?: ID | null
  }
}

export type DevicePairRequest = {
  pairingKey?: string
  pair?: string
  key?: string
  name?: string
  type?: string
  device?: {
    name?: string
    type?: string
    firmwareVersion?: string
  }
}

export type DevicePairResponse = {
  ok: true
  device: Device
  apiBase: string
  token: string
  scopes: string[]
  defaultMode: string
  defaultLocationId?: ID | null
}

export type DeviceTokenRotateResponse = {
  ok: true
  device: Device
  apiBase: string
  token: string
  tokenPrefix: string
  scopes: string[]
}

export type DeviceListResponse = {
  devices: Device[]
}

export type ScannerEvent = {
  id: ID
  barcode: string
  mode: 'lookup' | 'stock_add' | 'shopping_check' | string
  source: string
  status: 'pending' | 'processed' | 'ignored' | string
  note?: string | null
  rawPayload?: string | null
  householdId: ID
  deviceId?: ID | null
  apiTokenId?: ID | null
  productId?: ID | null
  locationId?: ID | null
  quantity?: number | null
  processedAt?: string | null
  createdAt?: string
  updatedAt?: string
  product?: Product | null
  location?: Location | null
  device?: Partial<Device> | null
}

export type ScannerEventCreateRequest = {
  barcode: string
  mode?: 'lookup' | 'stock_add' | 'shopping_check'
  source?: string
  locationId?: ID
  quantity?: number
}

export type ScannerEventUpdateRequest = {
  status?: 'pending' | 'processed' | 'ignored'
  note?: string | null
  productId?: ID
  locationId?: ID
}

export type ScannerEventResponse = {
  ok: true
  event: ScannerEvent
}

export type ScannerEventListResponse = {
  events: ScannerEvent[]
}
