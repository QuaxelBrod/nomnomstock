import { prisma } from '../../lib/prisma'
import { lookupOpenFoodFacts, lookupOpenBeautyFacts } from '../../lib/api/lookup'

export type ProductDTO = {
  id: number
  barcode: string
  name: string
  brand?: string | null
  image?: string | null
}

export async function productLookup(barcode: string): Promise<ProductDTO | null> {
  if (!barcode) return null

  // 1) Check local DB
  const local = await prisma.product.findUnique({ where: { barcode } })
  if (local) {
    return {
      id: local.id,
      barcode: local.barcode,
      name: local.name,
      brand: local.brand,
      image: local.image,
    }
  }

  // 2) Query OpenFoodFacts
  const of = await lookupOpenFoodFacts(barcode)
  if (of) {
    const created = await prisma.product.create({
      data: {
        barcode,
        name: of.name,
        brand: of.brand,
        image: of.image,
      },
    })
    return { id: created.id, barcode: created.barcode, name: created.name, brand: created.brand, image: created.image }
  }

  // 3) Query OpenBeautyFacts
  const ob = await lookupOpenBeautyFacts(barcode)
  if (ob) {
    const created = await prisma.product.create({
      data: {
        barcode,
        name: ob.name,
        brand: ob.brand,
        image: ob.image,
      },
    })
    return { id: created.id, barcode: created.barcode, name: created.name, brand: created.brand, image: created.image }
  }

  return null
}
