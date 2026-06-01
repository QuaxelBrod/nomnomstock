import type {
  ApiErrorBody,
  ApiHealth,
  DeviceListResponse,
  DevicePairingCreateRequest,
  DevicePairingCreateResponse,
  DevicePairRequest,
  DevicePairResponse,
  ID,
  InviteRequest,
  Location,
  LocationCreateRequest,
  LocationUpdateRequest,
  OkResponse,
  Product,
  ProductCreateRequest,
  ProductLookupRequest,
  ProductLookupResponse,
  RecipeAvailableItem,
  RecipeEmailRequest,
  RecipeGenerateRequest,
  RecipeGenerateResponse,
  RegisterRequest,
  RegisterResponse,
  ScannerEventCreateRequest,
  ScannerEventListResponse,
  ScannerEventResponse,
  ScannerEventUpdateRequest,
  ShoppingListAddRequest,
  ShoppingListItem,
  ShoppingListResponse,
  ShoppingListUpdateRequest,
  Stock,
  StockAddRequest,
  StockMoveRequest,
  StockReduceRequest,
  StockReduceResponse,
  UserPublic,
} from './types'

export type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type ApiClientOptions = {
  baseUrl?: string
  apiPrefix?: string
  bearerToken?: string
}

export class ApiRequestError extends Error {
  status: number
  statusText: string
  code: string
  details?: unknown

  constructor(status: number, statusText: string, body?: Partial<ApiErrorBody>) {
    const error = body?.error
    super(error?.message || `Request failed ${status} ${statusText}`)
    this.name = 'ApiRequestError'
    this.status = status
    this.statusText = statusText
    this.code = error?.code || String(status)
    this.details = error?.details
  }
}

export class ApiClient {
  baseUrl: string
  apiPrefix: string
  bearerToken?: string

  constructor(options?: string | ApiClientOptions) {
    const normalizedOptions = typeof options === 'string' ? { baseUrl: options } : options || {}
    const envBase =
      typeof process !== 'undefined' && (process as any).env
        ? (process as any).env.NEXT_PUBLIC_API_BASE
        : undefined

    this.baseUrl = (normalizedOptions.baseUrl || envBase || '').replace(/\/$/, '')
    this.apiPrefix = normalizedOptions.apiPrefix || '/api/v1'
    this.bearerToken = normalizedOptions.bearerToken
  }

  apiPath(path: string) {
    if (path.startsWith('/api/')) return path
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${this.apiPrefix}${normalizedPath}`
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.baseUrl ? `${this.baseUrl}${path}` : path
    const headers: Record<string, string> = { ...(opts.headers || {}) }
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData

    if (this.bearerToken && !headers.Authorization) headers.Authorization = `Bearer ${this.bearerToken}`
    if (opts.body != null && !isFormData && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body == null || isFormData ? (opts.body as BodyInit | undefined) : JSON.stringify(opts.body),
      signal: opts.signal,
    })

    if (!res.ok) {
      let body: Partial<ApiErrorBody> | undefined
      try {
        const parsed = await res.json()
        if (parsed?.error) body = parsed
        else if (parsed?.error || typeof parsed?.error === 'string') {
          body = { error: { code: String(parsed.error), message: String(parsed.error) } }
        }
      } catch {
        body = undefined
      }
      throw new ApiRequestError(res.status, res.statusText, body)
    }

    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  get<T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...opts, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...opts, method: 'POST', body })
  }

  patch<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...opts, method: 'PATCH', body })
  }

  delete<T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...opts, method: 'DELETE' })
  }

  health() {
    return this.get<ApiHealth>(this.apiPath('/health'))
  }

  lookupProduct(body: ProductLookupRequest) {
    return this.post<ProductLookupResponse>(this.apiPath('/lookup'), body)
  }

  getProducts(q?: string) {
    const search = q ? `?q=${encodeURIComponent(q)}` : ''
    return this.get<Product[]>(`${this.apiPath('/products')}${search}`)
  }

  createProduct(body: ProductCreateRequest) {
    return this.post<Product>(this.apiPath('/products'), body)
  }

  getProduct(id: ID) {
    return this.get<Product>(this.apiPath(`/products/${id}`))
  }

  getLocations(householdId?: ID) {
    const search = householdId ? `?householdId=${encodeURIComponent(String(householdId))}` : ''
    return this.get<Location[]>(`${this.apiPath('/locations')}${search}`)
  }

  createLocation(body: LocationCreateRequest) {
    return this.post<Location>(this.apiPath('/locations'), body)
  }

  updateLocation(id: ID, body: LocationUpdateRequest) {
    return this.patch<Location>(this.apiPath(`/locations/${id}`), body)
  }

  deleteLocation(id: ID) {
    return this.delete<OkResponse>(this.apiPath(`/locations/${id}`))
  }

  getStock() {
    return this.get<Stock[]>(this.apiPath('/stock'))
  }

  addStock(body: StockAddRequest) {
    return this.post<Stock>(this.apiPath('/stock'), body)
  }

  moveStock(body: StockMoveRequest) {
    return this.post<OkResponse>(this.apiPath('/stock/move'), body)
  }

  reduceStock(id: ID, body: StockReduceRequest) {
    return this.post<StockReduceResponse>(this.apiPath(`/stock/${id}/reduce`), body)
  }

  getShopping(opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.get<ShoppingListResponse>(this.apiPath('/shopping'), opts)
  }

  addShoppingItem(body: ShoppingListAddRequest) {
    return this.post<{ ok: true; item: ShoppingListItem }>(this.apiPath('/shopping'), body)
  }

  updateShoppingItem(id: ID, body: ShoppingListUpdateRequest) {
    return this.patch<{ ok: true; updated: ShoppingListItem }>(this.apiPath(`/shopping/${id}`), body)
  }

  deleteShoppingItem(id: ID) {
    return this.delete<OkResponse>(this.apiPath(`/shopping/${id}`))
  }

  getRecentRemovedShoppingCandidates() {
    return this.get<Array<{ product: Product; lastRemovedAt: string; quantity: number }>>(
      this.apiPath('/shopping/recent-removed')
    )
  }

  getProfile(email: string) {
    return this.get<UserPublic | null>(`${this.apiPath('/profile')}?email=${encodeURIComponent(email)}`)
  }

  getAvailableRecipeItems() {
    return this.get<RecipeAvailableItem[]>(this.apiPath('/recipes/available'))
  }

  generateRecipe(body: RecipeGenerateRequest) {
    return this.post<RecipeGenerateResponse>(this.apiPath('/recipes/generate'), body)
  }

  emailRecipe(body: RecipeEmailRequest) {
    return this.post<OkResponse>(this.apiPath('/recipes/email'), body)
  }

  register(body: RegisterRequest) {
    return this.post<RegisterResponse>(this.apiPath('/auth/register'), body)
  }

  invite(body: InviteRequest) {
    return this.post<OkResponse>(this.apiPath('/auth/invite'), body)
  }

  getDevices() {
    return this.get<DeviceListResponse>(this.apiPath('/devices'))
  }

  createDevicePairing(body: DevicePairingCreateRequest = {}) {
    return this.post<DevicePairingCreateResponse>(this.apiPath('/devices/pairing'), body)
  }

  pairDevice(body: DevicePairRequest) {
    return this.post<DevicePairResponse>(this.apiPath('/devices/pair'), body)
  }

  revokeDevice(id: ID) {
    return this.post<OkResponse>(this.apiPath(`/devices/${id}/revoke`))
  }

  createScannerEvent(body: ScannerEventCreateRequest) {
    return this.post<ScannerEventResponse>(this.apiPath('/scanner/events'), body)
  }

  getScannerEvents(status = 'pending') {
    return this.get<ScannerEventListResponse>(`${this.apiPath('/scanner/events')}?status=${encodeURIComponent(status)}`)
  }

  updateScannerEvent(id: ID, body: ScannerEventUpdateRequest) {
    return this.patch<ScannerEventResponse>(this.apiPath(`/scanner/events/${id}`), body)
  }
}

export type { Product }
