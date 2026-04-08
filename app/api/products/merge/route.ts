import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import type { Prisma } from '@prisma/client'
import { getToken } from 'next-auth/jwt'

function normName(n: string) {
  return (n || '').trim().toLowerCase()
}

export async function POST(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // fetch all products
  const products = await prisma.product.findMany({ orderBy: { id: 'asc' } })

  const processed = new Set<number>()
  const report: any[] = []

  // group by barcode
  const byBarcode = new Map<string, number[]>()
  for (const p of products) {
    if (p.barcode) {
      const arr = byBarcode.get(p.barcode) ?? []
      arr.push(p.id)
      byBarcode.set(p.barcode, arr)
    }
  }

  // process barcode groups
  for (const [bc, ids] of byBarcode.entries()) {
    if (ids.length <= 1) continue
    const dup = ids.filter((id) => !processed.has(id))
    if (dup.length <= 1) continue
    const primary = dup[0]
    const others = dup.slice(1)
    // merge stocks and histories
    const res = await mergeProductGroup(primary, dup)
    report.push({ key: `barcode:${bc}`, primary, merged: dup, result: res })
    dup.forEach((i) => processed.add(i))
  }

  // group by normalized name for remaining products
  const byName = new Map<string, number[]>()
  for (const p of products) {
    if (processed.has(p.id)) continue
    const k = normName(p.name)
    const arr = byName.get(k) ?? []
    arr.push(p.id)
    byName.set(k, arr)
  }

  for (const [nm, ids] of byName.entries()) {
    if (ids.length <= 1) continue
    const dup = ids.filter((id) => !processed.has(id))
    if (dup.length <= 1) continue
    const primary = dup[0]
    const res = await mergeProductGroup(primary, dup)
    report.push({ key: `name:${nm}`, primary, merged: dup, result: res })
    dup.forEach((i) => processed.add(i))
  }

  return NextResponse.json({ ok: true, report })
}

async function mergeProductGroup(primaryId: number, ids: number[]) {
  // ids: list of product ids to merge into primaryId
  const duplicateIds = ids.filter((id) => id !== primaryId)
  // find all stocks for these products
  const stocks = await prisma.stock.findMany({ where: { productId: { in: ids } } })

  // group stocks by location+household
  const keyMap = new Map<string, { locationId: number | null, householdId: number | null, total: number, unit?: string | null }>()
  for (const s of stocks) {
    const key = `${s.locationId ?? 'null'}-${s.householdId ?? 'null'}`
    const cur = keyMap.get(key) ?? { locationId: s.locationId ?? null, householdId: s.householdId ?? null, total: 0, unit: s.unit }
    cur.total += Number(s.quantity)
    if (!cur.unit && s.unit) cur.unit = s.unit
    keyMap.set(key, cur)
  }

  const results: any[] = []

  // run inside a transaction per group
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const [key, info] of keyMap.entries()) {
      // delete all old stocks for these product ids at this location/household
      await tx.stock.deleteMany({ where: { productId: { in: ids }, locationId: info.locationId ?? undefined, householdId: info.householdId ?? undefined } })
      // create new stock for primary if total > 0
      if (info.total > 0) {
        const createData: any = { productId: primaryId, quantity: info.total, unit: info.unit }
        if (info.locationId !== null) createData.locationId = info.locationId
        if (info.householdId !== null) createData.householdId = info.householdId
        await tx.stock.create({ data: createData })
      }
    }

    // reassign histories pointing to duplicate product ids
    if (duplicateIds.length > 0) {
      await tx.history.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: primaryId } })
      // delete duplicate products
      await tx.product.deleteMany({ where: { id: { in: duplicateIds } } })
    }
  })

  return { mergedStocks: keyMap.size, removedProducts: duplicateIds.length }
}
