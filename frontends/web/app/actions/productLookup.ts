import { ApiClient } from 'nomnomstock-shared'
import type { Product as ProductDTO } from 'nomnomstock-shared'

export async function productLookup(barcode: string): Promise<ProductDTO | null> {
  if (!barcode) return null
  const apiBase = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || ''
  const client = new ApiClient(apiBase)
  try {
    const res = await client.lookupProduct({ barcode })
    if (!res || !res.found) return null
    return res.product || null
  } catch (e) {
    console.error('productLookup proxy error', e)
    return null
  }
}
