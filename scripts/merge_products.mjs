import '../lib/env.js'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function mergeGroup(primary, others) {
  for (const dup of others) {
    console.log(`Merging product ${dup.id} (${dup.name}) -> ${primary.id} (${primary.name})`)
    // Move or collapse stocks
    const dupStocks = await prisma.stock.findMany({ where: { productId: dup.id } })
    for (const s of dupStocks) {
      const existing = await prisma.stock.findFirst({ where: { productId: primary.id, locationId: s.locationId, householdId: s.householdId } })
      if (existing) {
        await prisma.stock.update({ where: { id: existing.id }, data: { quantity: existing.quantity + s.quantity } })
        await prisma.stock.delete({ where: { id: s.id } })
      } else {
        await prisma.stock.update({ where: { id: s.id }, data: { productId: primary.id } })
      }
    }

    // Reassign histories
    await prisma.history.updateMany({ where: { productId: dup.id }, data: { productId: primary.id } })

    // Delete duplicate product
    await prisma.product.delete({ where: { id: dup.id } })
  }
}

async function run() {
  try {
    console.log('Starting strict product merge: first by barcode, then by case-insensitive name')

    // 1) Merge by barcode
    const all = await prisma.product.findMany({ orderBy: { id: 'asc' } })
    const byBarcode = new Map()
    for (const p of all) {
      if (p.barcode) {
        const arr = byBarcode.get(p.barcode) || []
        arr.push(p)
        byBarcode.set(p.barcode, arr)
      }
    }

    for (const [barcode, group] of byBarcode.entries()) {
      if (group.length > 1) {
        const primary = group[0]
        const others = group.slice(1)
        await mergeGroup(primary, others)
      }
    }

    // 2) Merge by normalized name (case-insensitive)
    const remaining = await prisma.product.findMany({ orderBy: { id: 'asc' } })
    const byName = new Map()
    for (const p of remaining) {
      const key = String(p.name || '').trim().toLowerCase()
      if (!key) continue
      const arr = byName.get(key) || []
      arr.push(p)
      byName.set(key, arr)
    }

    for (const [name, group] of byName.entries()) {
      if (group.length > 1) {
        const primary = group[0]
        const others = group.slice(1)
        await mergeGroup(primary, others)
      }
    }

    console.log('Merge complete')
  } catch (err) {
    console.error('Error during merge:', err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

run()
