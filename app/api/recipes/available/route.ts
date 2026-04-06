import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export async function GET() {
  try {
    // return stocks with product name where quantity > 0
    const stocks = await prisma.stock.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: true },
    })
    const items = stocks.map((s) => ({ id: s.id, name: s.product.name, quantity: s.quantity, unit: s.unit }))
    return NextResponse.json(items)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 500 })
  }
}
