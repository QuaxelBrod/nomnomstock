import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function GET(request: Request) {
  try {
    // auth
    // @ts-ignore
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)

    // fetch recent REMOVED history entries with product
    const h = await prisma.history.findMany({
      where: { action: 'REMOVED', createdAt: { gte: since } },
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
      // skip if there's any stock > 0 for this product
      const hasStock = await prisma.stock.findFirst({ where: { productId: p.id, quantity: { gt: 0 } } })
      if (hasStock) continue

      // skip if already on shopping list
      const onList = await prisma.shoppingListItem.findFirst({ where: { productId: p.id } })
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
