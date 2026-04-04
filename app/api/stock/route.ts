import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { productLookup } from '../../actions/productLookup'
import { getToken } from 'next-auth/jwt'

export async function GET(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch raw stocks and aggregate duplicates (same productId + locationId + householdId)
  const stocks = await prisma.stock.findMany({ include: { product: true, location: true }, orderBy: { createdAt: 'desc' } })

  const map = new Map<string, any>()
  for (const s of stocks) {
    const key = `${s.productId}-${s.locationId ?? 'null'}-${s.householdId ?? 'null'}`
    if (!map.has(key)) {
      map.set(key, { ...s })
    } else {
      const cur = map.get(key)
      cur.quantity = Number(cur.quantity) + Number(s.quantity)
      // keep earliest createdAt as createdAt
      if (new Date(s.createdAt) < new Date(cur.createdAt)) cur.createdAt = s.createdAt
    }
  }

  const aggregated = Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return NextResponse.json(aggregated)
}

export async function POST(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { productId, barcode, locationId, quantity = 1, unit, mhd, householdId } = body

  let pid = productId
  if (!pid && barcode) {
    const p = await productLookup(barcode)
    if (p) pid = p.id
  }

  if (!pid) return NextResponse.json({ error: 'productId or barcode required' }, { status: 400 })

  // derive householdId from token if not provided
  const hid = householdId ?? (token as any)?.householdId ?? undefined

  // Try to find existing stock in same location + household for this product
  const where: any = { productId: pid }
  if (typeof locationId !== 'undefined') where.locationId = locationId
  if (typeof hid !== 'undefined') where.householdId = hid

  const existing = await prisma.stock.findFirst({ where })
  if (existing) {
    const updated = await prisma.stock.update({ where: { id: existing.id }, data: { quantity: existing.quantity + Number(quantity) } })
    // record history
    await prisma.history.create({ data: { productId: pid, locationId: locationId ?? null, quantity: Number(quantity), action: 'ADD', householdId: hid } })
    return NextResponse.json(updated)
  }

  const stock = await prisma.stock.create({
    data: {
      productId: pid,
      locationId,
      quantity: Number(quantity),
      unit,
      mhd: mhd ? new Date(mhd) : undefined,
      householdId: hid,
    },
  })

  await prisma.history.create({ data: { productId: pid, locationId: locationId ?? null, quantity: Number(quantity), action: 'ADD', householdId: hid } })

  return NextResponse.json(stock)
}
