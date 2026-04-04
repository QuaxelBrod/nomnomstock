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
  if (existingName) {
    // If an existing product was created with a placeholder/manual barcode, upgrade it to a slug based on the name.
    const isManual = typeof existingName.barcode === 'string' && existingName.barcode.startsWith('manual-')
    if (isManual) {
      // attempt to compute a nicer barcode from the name and update the product if possible
      const base = String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || `manual-${Date.now()}`
      let candidate = base
      let suffix = 0
      while (true) {
        try {
          const exists = await prisma.product.findUnique({ where: { barcode: candidate } }).catch(() => null)
          if (!exists) {
            const updated = await prisma.product.update({ where: { id: existingName.id }, data: { barcode: candidate } })
            return NextResponse.json(updated)
          }
        } catch (e) {
          // if update fails (race/constraint), fallthrough and try next suffix
        }
        suffix += 1
        candidate = `${base}-${suffix}`
      }
    }

    return NextResponse.json(existingName)
  }

  // Ensure a barcode is present — prefer a slug based on the product name when not provided.
  let bc: string
  if (bcProvided) {
    bc = String(barcode)
  } else {
    // create slug from name: lowercase, spaces -> '-', remove invalid chars
    const base = String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || `manual-${Date.now()}`
    let candidate = base
    let suffix = 0
    // ensure uniqueness by appending numeric suffix if needed
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await prisma.product.findUnique({ where: { barcode: candidate } }).catch(() => null)
      if (!exists) {
        bc = candidate
        break
      }
      suffix += 1
      candidate = `${base}-${suffix}`
    }
  }

  const product = await prisma.product.create({ data: { name: String(name).trim(), brand: brand || undefined, barcode: bc, image: image || undefined } })
  return NextResponse.json(product)
}
