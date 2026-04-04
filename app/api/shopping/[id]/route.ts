import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    // auth
    // @ts-ignore
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = Number(params.id)
    const body = await request.json()
    const { quantity, note } = body

    const item = await prisma.shoppingListItem.findUnique({ where: { id } })
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
  const id = Number(params.id)
  const item = await prisma.shoppingListItem.findUnique({ where: { id }, include: { product: true, addedBy: true } })
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    // @ts-ignore
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = Number(params.id)
    try {
      await prisma.shoppingListItem.delete({ where: { id } })
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
  } catch (err: any) {
    console.error('DELETE /api/shopping/:id error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
