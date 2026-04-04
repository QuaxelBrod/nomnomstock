import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function POST(request: Request) {
  try {
    // auth
    // @ts-ignore
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, quantity, note } = body
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // find or create a household (fallback to first household)
    const household = await prisma.household.findFirst()
    if (!household) return NextResponse.json({ error: 'no household' }, { status: 500 })

    // create a product placeholder with a unique manual barcode
    const barcode = `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const product = await prisma.product.create({ data: { name, barcode } })

    const item = await prisma.shoppingListItem.create({
      data: {
        productId: product.id,
        householdId: household.id,
        quantity: Number(quantity) || 1,
        note: note || null,
      },
    })

    return NextResponse.json({ ok: true, item })
  } catch (e: any) {
    console.error('POST /api/shopping error', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
