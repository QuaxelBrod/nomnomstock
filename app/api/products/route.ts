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

  // Stricter auto-merge: if a product with same barcode or same name (case-insensitive) exists, return it instead of creating a duplicate.
  const bcProvided = barcode && String(barcode).trim().length > 0
  if (bcProvided) {
    const existingBc = await prisma.product.findUnique({ where: { barcode: String(barcode) } }).catch(() => null)
    if (existingBc) return NextResponse.json(existingBc)
  }

  const existingName = await prisma.product.findFirst({ where: { name: String(name).trim() } })
  if (existingName) return NextResponse.json(existingName)

  // Ensure a barcode is present — Prisma schema requires barcode to be unique/non-null.
  const bc = bcProvided ? String(barcode) : `manual-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  const product = await prisma.product.create({ data: { name: String(name).trim(), brand: brand || undefined, barcode: bc, image: image || undefined } })
  return NextResponse.json(product)
}
