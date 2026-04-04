import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function POST(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, brand, barcode, image } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Ensure a barcode is present — Prisma schema requires barcode to be unique/non-null.
  const bc = barcode || `manual-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  const existing = await prisma.product.findUnique({ where: { barcode: bc } }).catch(() => null)
  if (existing) return NextResponse.json(existing)

  const product = await prisma.product.create({ data: { name, brand, barcode: bc, image } })
  return NextResponse.json(product)
}
