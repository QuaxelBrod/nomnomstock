import type { Express } from 'express'

import { prisma } from '../../lib/prisma'
import { apiRoute } from '../apiContract'
import { ensureDefaultLocation, parsePositiveInt, requireAuth } from '../serverUtils'

export function registerLocationRoutes(app: Express) {
  app.get(apiRoute('/api/locations'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const requestedHousehold = parsePositiveInt(req.query.householdId)
      if (requestedHousehold && auth.householdId && requestedHousehold !== auth.householdId) {
        return res.status(403).json({ error: 'forbidden' })
      }

      const householdId = requestedHousehold || auth.householdId || null
      if (!householdId) return res.json([])

      await ensureDefaultLocation(householdId)

      const locations = await prisma.location.findMany({
        where: { householdId },
        orderBy: { createdAt: 'desc' },
      })
      return res.json(locations)
    } catch (err) {
      console.error('GET /api/locations error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/locations'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const name = String(req.body?.name || '').trim()
      if (!name) return res.status(400).json({ error: 'name required' })

      const requestedHousehold = parsePositiveInt(req.body?.householdId)
      if (requestedHousehold && auth.householdId && requestedHousehold !== auth.householdId) {
        return res.status(403).json({ error: 'forbidden' })
      }

      const householdId = requestedHousehold || auth.householdId || null
      if (!householdId) return res.status(400).json({ error: 'householdId required' })

      const location = await prisma.location.create({ data: { name, householdId } })
      await ensureDefaultLocation(householdId)
      return res.json(location)
    } catch (err) {
      console.error('POST /api/locations error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.patch(apiRoute('/api/locations/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      const name = String(req.body?.name || '').trim()
      if (!id || !name) return res.status(400).json({ error: 'invalid request' })

      const existing = await prisma.location.findUnique({ where: { id } })
      if (!existing) return res.status(404).json({ error: 'not found' })
      if (auth.householdId && existing.householdId !== auth.householdId) return res.status(404).json({ error: 'not found' })

      const updated = await prisma.location.update({ where: { id }, data: { name } })
      if (existing.householdId) await ensureDefaultLocation(existing.householdId)
      return res.json(updated)
    } catch (err) {
      console.error('PATCH /api/locations/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.delete(apiRoute('/api/locations/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'invalid id' })

      const existing = await prisma.location.findUnique({ where: { id } })
      if (!existing) return res.status(404).json({ error: 'not found' })
      if (auth.householdId && existing.householdId !== auth.householdId) return res.status(404).json({ error: 'not found' })

      await prisma.location.delete({ where: { id } })
      if (existing.householdId) await ensureDefaultLocation(existing.householdId)
      return res.json({ ok: true })
    } catch (err) {
      console.error('DELETE /api/locations/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
