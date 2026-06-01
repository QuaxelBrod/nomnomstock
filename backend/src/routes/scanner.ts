import type { Express } from 'express'

import { prisma } from '../../lib/prisma'
import { apiRoute, sendApiError } from '../apiContract'
import { parsePositiveInt, productLookup, requireAuth } from '../serverUtils'

function normalizeScannerMode(value: unknown) {
  const mode = String(value || 'lookup').trim()
  return ['lookup', 'stock_add', 'shopping_check'].includes(mode) ? mode : 'lookup'
}

function normalizeScannerStatus(value: unknown) {
  const status = String(value || '').trim()
  return ['pending', 'processed', 'ignored'].includes(status) ? status : null
}

function includeScannerEvent() {
  return {
    product: true,
    device: { select: { id: true, name: true, type: true, status: true, defaultMode: true, defaultLocationId: true } },
    location: true,
  }
}

async function resolveEventLocation(locationId: number | null, householdId: number) {
  if (!locationId) return null
  const location = await prisma.location.findUnique({ where: { id: locationId } })
  if (!location || location.householdId !== householdId) return null
  return location
}

export function registerScannerRoutes(app: Express) {
  app.post(apiRoute('/api/scanner/events'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const barcode = String(req.body?.barcode || '').trim()
      if (!barcode) return sendApiError(res, 400, 'bad_request', 'barcode required')

      const device = auth.deviceId ? await prisma.device.findUnique({ where: { id: auth.deviceId } }) : null
      const requestedLocationId = parsePositiveInt(req.body?.locationId)
      const defaultLocationId = requestedLocationId || device?.defaultLocationId || null
      const location = await resolveEventLocation(defaultLocationId, auth.householdId)
      const mode = normalizeScannerMode(req.body?.mode || device?.defaultMode)
      const quantity = Number(req.body?.quantity || 1)

      const product = await productLookup(barcode).catch((err) => {
        console.error('scanner event product lookup error', err)
        return null
      })

      const event = await prisma.scannerEvent.create({
        data: {
          barcode,
          mode,
          source: req.body?.source ? String(req.body.source).slice(0, 40) : auth.clientType === 'device' ? 'esp' : 'web',
          status: 'pending',
          householdId: auth.householdId,
          deviceId: auth.deviceId || undefined,
          apiTokenId: auth.apiTokenId || undefined,
          productId: product?.id || undefined,
          locationId: location?.id || undefined,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          rawPayload: JSON.stringify(req.body || {}),
        },
        include: includeScannerEvent(),
      })

      return res.json({ ok: true, event })
    } catch (err) {
      console.error('POST /api/scanner/events error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.get(apiRoute('/api/scanner/events'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return res.json({ events: [] })

      const status = normalizeScannerStatus(req.query.status) || 'pending'
      const takeRaw = Number(req.query.limit || 50)
      const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.floor(takeRaw), 1), 200) : 50

      const events = await prisma.scannerEvent.findMany({
        where: { householdId: auth.householdId, status },
        include: includeScannerEvent(),
        orderBy: { createdAt: 'desc' },
        take,
      })

      return res.json({ events })
    } catch (err) {
      console.error('GET /api/scanner/events error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.patch(apiRoute('/api/scanner/events/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const id = parsePositiveInt(req.params.id)
      if (!id) return sendApiError(res, 400, 'bad_request', 'invalid id')

      const event = await prisma.scannerEvent.findUnique({ where: { id } })
      if (!event || event.householdId !== auth.householdId) {
        return sendApiError(res, 404, 'not_found', 'Scanner event not found')
      }

      const nextStatus = normalizeScannerStatus(req.body?.status) || event.status
      const data: Record<string, any> = {
        status: nextStatus,
        processedAt: nextStatus === 'processed' || nextStatus === 'ignored' ? new Date() : null,
      }
      if (typeof req.body?.note !== 'undefined') data.note = req.body.note ? String(req.body.note) : null

      const productId = parsePositiveInt(req.body?.productId)
      if (productId) data.productId = productId

      const locationId = parsePositiveInt(req.body?.locationId)
      if (locationId) {
        const location = await resolveEventLocation(locationId, auth.householdId)
        if (!location) return sendApiError(res, 404, 'not_found', 'Location not found')
        data.locationId = location.id
      }

      const updated = await prisma.scannerEvent.update({
        where: { id },
        data,
        include: includeScannerEvent(),
      })

      return res.json({ ok: true, event: updated })
    } catch (err) {
      console.error('PATCH /api/scanner/events/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
