import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  // auth
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  const body = await request.json()
  const { locationId, quantity, unit, mhd } = body

  const data: any = {}
  if (locationId !== undefined) data.locationId = locationId
  if (quantity !== undefined) data.quantity = Number(quantity)
  if (unit !== undefined) data.unit = unit
  if (mhd !== undefined) data.mhd = mhd ? new Date(mhd) : null

  const updated = await prisma.stock.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  // auth
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  await prisma.stock.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
