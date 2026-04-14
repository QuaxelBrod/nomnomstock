import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getRequestAuthContext } from '../../../../lib/requestAuth'

async function findScopedItem(id: number, householdId: number | null) {
  if (!householdId) return null
  const item = await prisma.shoppingListItem.findUnique({ where: { id } })
  if (!item || item.householdId !== householdId) return null
  return item
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getRequestAuthContext(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = Number(params.id)
    const body = await request.json()
    const { quantity, note } = body

    const item = await findScopedItem(id, auth.householdId)
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const data: any = {}
    if (typeof quantity !== 'undefined') data.quantity = Number(quantity)
    if (typeof note !== 'undefined') data.note = note || null

    try {
      const updated = await prisma.shoppingListItem.update({ where: { id }, data })
      return NextResponse.json({ ok: true, updated })
    } catch (e: any) {
      // If Prisma client doesn't know about `note` (client/schema mismatch), fall back to raw SQL update
      const msg = String(e?.message || '')
      if (msg.includes('Unknown argument') && msg.includes('note')) {
        const q = Number(data.quantity ?? item.quantity)
        const n = data.note ?? null
        await prisma.$executeRawUnsafe('UPDATE "ShoppingListItem" SET quantity = ?, note = ? WHERE id = ?', q, n, id)
        const refreshed = await prisma.shoppingListItem.findUnique({ where: { id } })
        return NextResponse.json({ ok: true, updated: refreshed })
      }
      throw e
    }
  } catch (err: any) {
    console.error('PATCH /api/shopping/:id error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await getRequestAuthContext(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  const item = await prisma.shoppingListItem.findUnique({ where: { id }, include: { product: true, addedBy: true } })
  if (!item || !auth.householdId || item.householdId !== auth.householdId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getRequestAuthContext(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = Number(params.id)
    const item = await findScopedItem(id, auth.householdId)
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

    await prisma.$transaction([
      prisma.history.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          action: 'SHOPPING_DISMISSED',
          householdId: item.householdId,
        },
      }),
      prisma.shoppingListItem.delete({ where: { id } }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('DELETE /api/shopping/:id error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
