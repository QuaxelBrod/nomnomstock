import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  // auth
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  const body = await request.json()
  const { amount = 1, toShopping = false, userId } = body

  const stock = await prisma.stock.findUnique({ where: { id } })
  if (!stock) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const removed = Number(amount)
  const remaining = stock.quantity - removed

  // create history entry
  await prisma.history.create({
    data: {
      productId: stock.productId,
      locationId: stock.locationId,
      quantity: removed,
      action: 'REMOVED',
      householdId: stock.householdId,
    },
  })

  if (remaining <= 0) {
    // optionally add to shopping list
    if (toShopping && stock.householdId) {
      await prisma.shoppingListItem.create({
        data: {
          productId: stock.productId,
          householdId: stock.householdId,
          quantity: 1,
          addedById: userId || undefined,
        },
      })
    }
    await prisma.stock.delete({ where: { id } })
    return NextResponse.json({ ok: true, deleted: true })
  }

  const updated = await prisma.stock.update({ where: { id }, data: { quantity: remaining } })
  return NextResponse.json({ ok: true, updated })
}
