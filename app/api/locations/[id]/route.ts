import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  const body = await request.json()
  const { name } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const updated = await prisma.location.update({ where: { id }, data: { name } })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  await prisma.location.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
