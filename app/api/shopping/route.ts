import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { ensureShoppingListItemTable } from '../../../lib/dbFixes'
import { getRequestAuthContext } from '../../../lib/requestAuth'

export async function POST(request: Request) {
  try {
    const auth = await getRequestAuthContext(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!auth.householdId) return NextResponse.json({ error: 'No household assigned' }, { status: 400 })

    const body = await request.json()
    const { name, quantity, note, productId } = body
    if (!name && !productId) return NextResponse.json({ error: 'name or productId required' }, { status: 400 })

    await ensureShoppingListItemTable()

    const normalizedQuantity = Number(quantity) || 1

    let product
    if (productId) {
      product = await prisma.product.findUnique({ where: { id: Number(productId) } })
      if (!product) return NextResponse.json({ error: 'product not found' }, { status: 404 })
    } else {
      // create a product placeholder with a unique manual barcode
      const barcode = `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      product = await prisma.product.create({ data: { name, barcode } })
    }

    const existing = await prisma.shoppingListItem.findFirst({
      where: { productId: product.id, householdId: auth.householdId },
    })

    const item = existing
      ? await prisma.shoppingListItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + normalizedQuantity,
            note: note ? String(note) : existing.note,
          },
        })
      : await prisma.shoppingListItem.create({
          data: {
            productId: product.id,
            householdId: auth.householdId,
            quantity: normalizedQuantity,
            note: note || null,
            addedById: auth.userId ?? undefined,
          },
        })

    return NextResponse.json({ ok: true, item })
  } catch (e: any) {
    console.error('POST /api/shopping error', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
