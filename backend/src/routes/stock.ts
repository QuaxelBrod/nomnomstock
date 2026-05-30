import type { Express } from 'express'
import type { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { ensureShoppingListItemTable } from '../../lib/dbFixes'
import { apiRoute } from '../apiContract'
import { buildHouseholdScope, parsePositiveInt, productLookup, requireAuth } from '../serverUtils'

export function registerStockRoutes(app: Express) {
  app.get(apiRoute('/api/stock'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const stocks = await prisma.stock.findMany({
        where: buildHouseholdScope(auth.householdId),
        include: { product: true, location: true },
        orderBy: { createdAt: 'desc' },
      })

      const aggregate = new Map<string, any>()
      for (const stock of stocks) {
        const key = `${stock.productId}-${stock.locationId}-${stock.householdId ?? 'null'}`
        if (!aggregate.has(key)) {
          aggregate.set(key, { ...stock })
        } else {
          const current = aggregate.get(key)
          current.quantity = Number(current.quantity) + Number(stock.quantity)
          if (new Date(stock.createdAt) < new Date(current.createdAt)) current.createdAt = stock.createdAt
        }
      }

      const aggregated = Array.from(aggregate.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      return res.json(aggregated)
    } catch (err) {
      console.error('GET /api/stock error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/stock'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const body = req.body || {}
      const locationId = parsePositiveInt(body.locationId)
      const quantity = Number(body.quantity || 1)
      const unit = body.unit ? String(body.unit) : undefined
      const mhd = body.mhd ? new Date(String(body.mhd)) : undefined

      if (!locationId) return res.status(400).json({ error: 'locationId required' })
      if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity invalid' })

      let productId = parsePositiveInt(body.productId)
      const barcode = body.barcode ? String(body.barcode).trim() : ''

      if (!productId && barcode) {
        const product = await productLookup(barcode)
        productId = product ? product.id : null
      }

      if (!productId) return res.status(400).json({ error: 'productId or barcode required' })

      const requestedHousehold = parsePositiveInt(body.householdId)
      if (requestedHousehold && auth.householdId && requestedHousehold !== auth.householdId) {
        return res.status(403).json({ error: 'forbidden' })
      }

      const householdId = requestedHousehold || auth.householdId || null

      const existing = await prisma.stock.findFirst({
        where: {
          productId,
          locationId,
          householdId: householdId ?? undefined,
        },
      })

      if (existing) {
        const updated = await prisma.stock.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
        })
        await prisma.history.create({
          data: {
            productId,
            locationId,
            quantity,
            action: 'ADD',
            householdId: householdId ?? undefined,
          },
        })
        return res.json(updated)
      }

      const created = await prisma.stock.create({
        data: {
          productId,
          locationId,
          quantity,
          unit,
          mhd,
          householdId: householdId ?? undefined,
        },
      })

      await prisma.history.create({
        data: {
          productId,
          locationId,
          quantity,
          action: 'ADD',
          householdId: householdId ?? undefined,
        },
      })

      return res.json(created)
    } catch (err) {
      console.error('POST /api/stock error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/stock/move'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const fromStockId = parsePositiveInt(req.body?.fromStockId)
      const toLocationId = parsePositiveInt(req.body?.toLocationId)
      const amount = Number(req.body?.amount || 1)

      if (!fromStockId || !toLocationId || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'invalid parameters' })
      }

      const source = await prisma.stock.findUnique({ where: { id: fromStockId } })
      if (!source) return res.status(404).json({ error: 'source stock not found' })
      if (auth.householdId && source.householdId !== auth.householdId) return res.status(404).json({ error: 'source stock not found' })
      if (source.locationId === toLocationId) return res.status(400).json({ error: 'target must be different' })
      if (source.quantity < amount) return res.status(400).json({ error: 'insufficient quantity' })

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const remaining = source.quantity - amount

        await tx.history.create({
          data: {
            productId: source.productId,
            locationId: source.locationId,
            quantity: amount,
            action: 'REMOVED',
            householdId: source.householdId ?? undefined,
          },
        })

        if (remaining <= 0) await tx.stock.delete({ where: { id: source.id } })
        else await tx.stock.update({ where: { id: source.id }, data: { quantity: remaining } })

        const target = await tx.stock.findFirst({
          where: {
            productId: source.productId,
            locationId: toLocationId,
            householdId: source.householdId ?? undefined,
          },
        })

        if (target) {
          await tx.stock.update({ where: { id: target.id }, data: { quantity: target.quantity + amount } })
        } else {
          await tx.stock.create({
            data: {
              productId: source.productId,
              locationId: toLocationId,
              quantity: amount,
              unit: source.unit || undefined,
              householdId: source.householdId ?? undefined,
            },
          })
        }

        await tx.history.create({
          data: {
            productId: source.productId,
            locationId: toLocationId,
            quantity: amount,
            action: 'ADDED',
            householdId: source.householdId ?? undefined,
          },
        })
      })

      return res.json({ ok: true })
    } catch (err) {
      console.error('POST /api/stock/move error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/stock/:id/reduce'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      const amount = Number(req.body?.amount || 1)
      const toShopping = Boolean(req.body?.toShopping)
      const userId = parsePositiveInt(req.body?.userId) || auth.userId

      if (!id || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid amount' })

      const stock = await prisma.stock.findUnique({ where: { id } })
      if (!stock) return res.status(404).json({ error: 'not found' })
      if (auth.householdId && stock.householdId !== auth.householdId) return res.status(404).json({ error: 'not found' })

      const remaining = Number(stock.quantity) - amount

      await prisma.history.create({
        data: {
          productId: stock.productId,
          locationId: stock.locationId,
          quantity: amount,
          action: 'REMOVED',
          householdId: stock.householdId ?? undefined,
        },
      })

      if (toShopping && stock.householdId) {
        await ensureShoppingListItemTable()
        const existing = await prisma.shoppingListItem.findFirst({
          where: { productId: stock.productId, householdId: stock.householdId },
        })

        if (existing) {
          await prisma.shoppingListItem.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + 1 },
          })
        } else {
          await prisma.shoppingListItem.create({
            data: {
              productId: stock.productId,
              householdId: stock.householdId,
              quantity: 1,
              addedById: userId || undefined,
            },
          })
        }
      }

      if (remaining <= 0) {
        await prisma.stock.delete({ where: { id } })
        return res.json({ ok: true, deleted: true })
      }

      const updated = await prisma.stock.update({ where: { id }, data: { quantity: remaining } })
      return res.json({ ok: true, updated })
    } catch (err) {
      console.error('POST /api/stock/:id/reduce error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
