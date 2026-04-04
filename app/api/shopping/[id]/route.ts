import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

  const updated = await prisma.shoppingListItem.update({ where: { id }, data })
  return NextResponse.json({ ok: true, updated })
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const item = await prisma.shoppingListItem.findUnique({ where: { id }, include: { product: true, addedBy: true } })
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(item)
}
