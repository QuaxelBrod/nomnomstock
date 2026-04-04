type LookupResult = {
  name: string
  brand?: string | null
  image?: string | null
  source: 'local' | 'openfood' | 'openbeauty'
}

export async function lookupOpenFoodFacts(barcode: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
    if (!res.ok) return null
    const body = await res.json()
    if (body.status === 1 && body.product) {
      return {
        name: body.product.product_name || body.product.generic_name || barcode,
        brand: body.product.brands || null,
        image: body.product.image_url || null,
        source: 'openfood',
      }
    }
  } catch (e) {
    console.error('OpenFoodFacts lookup error', e)
  }
  return null
}

export async function lookupOpenBeautyFacts(barcode: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`)
    if (!res.ok) return null
    const body = await res.json()
    if (body.status === 1 && body.product) {
      return {
        name: body.product.product_name || body.product.generic_name || barcode,
        brand: body.product.brands || null,
        image: body.product.image_url || null,
        source: 'openbeauty',
      }
    }
  } catch (e) {
    console.error('OpenBeautyFacts lookup error', e)
  }
  return null
}
