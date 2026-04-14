import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getRequestAuthContext } from '../../../../lib/requestAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await getRequestAuthContext(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!auth.householdId) return NextResponse.json([], { status: 200 })

    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)

    // fetch recent REMOVED history entries with product
    const h = await prisma.history.findMany({
      where: { action: 'REMOVED', createdAt: { gte: since }, householdId: auth.householdId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // dedupe by productId, keep latest, and filter: product.stock === 0 and not already on shopping list
    const seen = new Set<number>()
    const items: Array<any> = []
    for (const entry of h) {
      const p = entry.product
      if (!p) continue
      if (seen.has(entry.productId)) continue

      const dismissed = await prisma.history.findFirst({
        where: {
          productId: p.id,
          householdId: auth.householdId,
          action: 'SHOPPING_DISMISSED',
        },
        orderBy: { createdAt: 'desc' },
      })
      if (dismissed && dismissed.createdAt >= entry.createdAt) continue

      // skip if there's any stock > 0 for this product
      const hasStock = await prisma.stock.findFirst({
        where: { productId: p.id, householdId: auth.householdId, quantity: { gt: 0 } },
      })
      if (hasStock) continue

      // skip if already on shopping list
      const onList = await prisma.shoppingListItem.findFirst({
        where: { productId: p.id, householdId: auth.householdId },
      })
      if (onList) continue

      seen.add(entry.productId)
      items.push({ product: p, lastRemovedAt: entry.createdAt, quantity: entry.quantity })
      if (items.length >= 20) break
    }

    return NextResponse.json(items)
  } catch (e) {
    console.error('recent-removed error', e)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
