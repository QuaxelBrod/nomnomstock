import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function POST(request: Request) {
  // auth
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { fromStockId, toLocationId, amount = 1 } = body
  const fromId = Number(fromStockId)
  const toLoc = Number(toLocationId)
  const qty = Number(amount)

  if (!fromId || !toLoc || qty <= 0) return NextResponse.json({ error: 'invalid parameters' }, { status: 400 })

  const fromStock = await prisma.stock.findUnique({ where: { id: fromId } })
  if (!fromStock) return NextResponse.json({ error: 'source stock not found' }, { status: 404 })

  if (fromStock.quantity < qty) return NextResponse.json({ error: 'insufficient quantity' }, { status: 400 })

  if (fromStock.locationId === toLoc) return NextResponse.json({ error: 'target must be different' }, { status: 400 })

  // perform move in transaction
  await prisma.$transaction(async (tx) => {
    const remaining = fromStock.quantity - qty

    // create REMOVED history for source
    await tx.history.create({ data: {
      productId: fromStock.productId,
      locationId: fromStock.locationId,
      quantity: qty,
      action: 'REMOVED',
      householdId: fromStock.householdId,
    }})

    if (remaining <= 0) {
      await tx.stock.delete({ where: { id: fromStock.id } })
    } else {
      await tx.stock.update({ where: { id: fromStock.id }, data: { quantity: remaining } })
    }

    // find or create target stock
    const existing = await tx.stock.findFirst({ where: { productId: fromStock.productId, locationId: toLoc, householdId: fromStock.householdId } })
    if (existing) {
      await tx.stock.update({ where: { id: existing.id }, data: { quantity: existing.quantity + qty } })
      await tx.history.create({ data: {
        productId: fromStock.productId,
        locationId: toLoc,
        quantity: qty,
        action: 'ADDED',
        householdId: fromStock.householdId,
      }})
    } else {
      await tx.stock.create({ data: {
        productId: fromStock.productId,
        locationId: toLoc,
        householdId: fromStock.householdId,
        quantity: qty,
        unit: fromStock.unit || undefined,
      }})
      await tx.history.create({ data: {
        productId: fromStock.productId,
        locationId: toLoc,
        quantity: qty,
        action: 'ADDED',
        householdId: fromStock.householdId,
      }})
    }
  })

  return NextResponse.json({ ok: true })
}
