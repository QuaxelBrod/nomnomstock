import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function POST(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find all stocks and group duplicates
  const stocks = await prisma.stock.findMany({ orderBy: { productId: 'asc' } })
  const groups = new Map<string, any[]>()
  for (const s of stocks) {
    const key = `${s.productId}-${s.locationId ?? 'null'}-${s.householdId ?? 'null'}`
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }

  const results: any[] = []
  for (const [key, arr] of groups.entries()) {
    if (arr.length <= 1) continue
    const total = arr.reduce((sum, r) => sum + Number(r.quantity), 0)
    const first = arr[0]
    const others = arr.slice(1)

    // update first with total
    const updated = await prisma.stock.update({ where: { id: first.id }, data: { quantity: total } })
    // delete others
    const idsToDelete = others.map((o) => o.id)
    await prisma.stock.deleteMany({ where: { id: { in: idsToDelete } } })

    // create history entry for merge
    await prisma.history.create({ data: { productId: first.productId, locationId: first.locationId ?? null, quantity: total, action: 'MERGE', householdId: first.householdId ?? null } })

    results.push({ mergedInto: updated.id, total, deleted: idsToDelete })
  }

  return NextResponse.json({ ok: true, merged: results })
}
