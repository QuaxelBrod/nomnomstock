type RequestOptions = {
  method?: string
  body?: any
  headers?: Record<string, string>
}

export class ApiClient {
  baseUrl: string

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/$/, '')
    else if (typeof process !== 'undefined' && (process as any).env && (process as any).env.NEXT_PUBLIC_API_BASE)
      this.baseUrl = (process as any).env.NEXT_PUBLIC_API_BASE.replace(/\/$/, '')
    else this.baseUrl = ''
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.baseUrl ? `${this.baseUrl}${path}` : path
    const headers: Record<string, string> = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    })
    if (!res.ok) throw new Error(`Request failed ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' })
  }

  post<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'POST', body })
  }

  // Example helpers
  getProducts() {
    return this.get<Product[]>('/api/products')
  }

  getProduct(id: number) {
    return this.get<Product>(`/api/products/${id}`)
  }
}

// Re-export types for convenience (avoid circular dependency in package.json)
import type { Product } from './types'
export type { Product }
