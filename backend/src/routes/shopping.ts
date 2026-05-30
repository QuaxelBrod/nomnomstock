import type { Express, Request as ExpressRequest } from 'express'

import { prisma } from '../../lib/prisma'
import { ensureShoppingListItemColumns, ensureShoppingListItemTable } from '../../lib/dbFixes'
import { apiRoute } from '../apiContract'
import { parsePositiveInt, requireAuth, type AuthContext } from '../serverUtils'

async function resolveShoppingHouseholdId(req: ExpressRequest, auth: AuthContext) {
  const fromQuery = parsePositiveInt(req.query.householdId)
  if (fromQuery && auth.householdId && fromQuery !== auth.householdId) return { error: 'forbidden', householdId: null }
  const householdId = fromQuery || auth.householdId || null
  return { householdId, error: null }
}

async function findScopedShoppingItem(id: number, householdId: number | null) {
  if (!householdId) return null
  const item = await prisma.shoppingListItem.findUnique({ where: { id } })
  if (!item || item.householdId !== householdId) return null
  return item
}

export function registerShoppingRoutes(app: Express) {
  app.get(apiRoute('/api/shopping'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const scope = await resolveShoppingHouseholdId(req, auth)
      if (scope.error) return res.status(403).json({ error: scope.error })
      if (!scope.householdId) return res.json({ items: [] })

      await ensureShoppingListItemTable()
      const items = await prisma.shoppingListItem.findMany({
        where: { householdId: scope.householdId },
        orderBy: { createdAt: 'desc' },
        include: { product: true, addedBy: true },
      })
      return res.json({ items })
    } catch (err) {
      console.error('GET /api/shopping error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/shopping'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return res.status(400).json({ error: 'No household assigned' })

      await ensureShoppingListItemTable()

      const productId = parsePositiveInt(req.body?.productId)
      const name = req.body?.name ? String(req.body.name).trim() : ''
      const note = req.body?.note ? String(req.body.note) : null
      const quantity = Number(req.body?.quantity || 1)

      if (!name && !productId) return res.status(400).json({ error: 'name or productId required' })

      let product = null as Awaited<ReturnType<typeof prisma.product.findUnique>>
      if (productId) {
        product = await prisma.product.findUnique({ where: { id: productId } })
        if (!product) return res.status(404).json({ error: 'product not found' })
      } else {
        const barcode = `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        product = await prisma.product.create({ data: { name, barcode } })
      }

      if (!product) return res.status(500).json({ error: 'product not resolved' })

      const existing = await prisma.shoppingListItem.findFirst({
        where: { productId: product.id, householdId: auth.householdId },
      })

      const item = existing
        ? await prisma.shoppingListItem.update({
            where: { id: existing.id },
            data: {
              quantity: existing.quantity + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1),
              note: note || existing.note,
            },
          })
        : await prisma.shoppingListItem.create({
            data: {
              productId: product.id,
              householdId: auth.householdId,
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
              note,
              addedById: auth.userId || undefined,
            },
          })

      return res.json({ ok: true, item })
    } catch (err) {
      console.error('POST /api/shopping error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.get(apiRoute('/api/shopping/recent-removed'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return res.json([])

      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
      const history = await prisma.history.findMany({
        where: {
          action: 'REMOVED',
          createdAt: { gte: since },
          householdId: auth.householdId,
        },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })

      const seen = new Set<number>()
      const items: Array<any> = []

      for (const entry of history) {
        const product = entry.product
        if (!product) continue
        if (seen.has(entry.productId)) continue

        const dismissed = await prisma.history.findFirst({
          where: {
            productId: product.id,
            householdId: auth.householdId,
            action: 'SHOPPING_DISMISSED',
          },
          orderBy: { createdAt: 'desc' },
        })
        if (dismissed && dismissed.createdAt >= entry.createdAt) continue

        const hasStock = await prisma.stock.findFirst({
          where: { productId: product.id, householdId: auth.householdId, quantity: { gt: 0 } },
        })
        if (hasStock) continue

        const onList = await prisma.shoppingListItem.findFirst({
          where: { productId: product.id, householdId: auth.householdId },
        })
        if (onList) continue

        seen.add(entry.productId)
        items.push({ product, lastRemovedAt: entry.createdAt, quantity: entry.quantity })
        if (items.length >= 20) break
      }

      return res.json(items)
    } catch (err) {
      console.error('GET /api/shopping/recent-removed error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.get(apiRoute('/api/shopping/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'invalid id' })

      const item = await prisma.shoppingListItem.findUnique({
        where: { id },
        include: { product: true, addedBy: true },
      })

      if (!item || !auth.householdId || item.householdId !== auth.householdId) {
        return res.status(404).json({ error: 'not found' })
      }

      return res.json(item)
    } catch (err) {
      console.error('GET /api/shopping/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.patch(apiRoute('/api/shopping/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'invalid id' })

      const item = await findScopedShoppingItem(id, auth.householdId)
      if (!item) return res.status(404).json({ error: 'not found' })

      await ensureShoppingListItemColumns()

      const data: Record<string, any> = {}
      if (typeof req.body?.quantity !== 'undefined') data.quantity = Number(req.body.quantity)
      if (typeof req.body?.note !== 'undefined') data.note = req.body.note || null

      try {
        const updated = await prisma.shoppingListItem.update({ where: { id }, data })
        return res.json({ ok: true, updated })
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (msg.includes('Unknown argument') && msg.includes('note')) {
          const q = Number(data.quantity ?? item.quantity)
          const n = data.note ?? null
          await prisma.$executeRawUnsafe('UPDATE "ShoppingListItem" SET quantity = ?, note = ? WHERE id = ?', q, n, id)
          const refreshed = await prisma.shoppingListItem.findUnique({ where: { id } })
          return res.json({ ok: true, updated: refreshed })
        }
        throw err
      }
    } catch (err) {
      console.error('PATCH /api/shopping/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.delete(apiRoute('/api/shopping/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'invalid id' })

      const item = await findScopedShoppingItem(id, auth.householdId)
      if (!item) return res.status(404).json({ error: 'not found' })

      await prisma.$transaction([
        prisma.history.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            action: 'SHOPPING_DISMISSED',
            householdId: item.householdId,
          },
        }),
        prisma.shoppingListItem.delete({ where: { id } }),
      ])

      return res.json({ ok: true })
    } catch (err) {
      console.error('DELETE /api/shopping/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
