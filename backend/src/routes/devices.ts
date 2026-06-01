import type { Express, Request as ExpressRequest } from 'express'
import type { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { apiRoute, sendApiError } from '../apiContract'
import {
  generateApiToken,
  generatePairingKey,
  hashSecret,
  parseScopes,
  parsePositiveInt,
  requireAuth,
  serializeScopes,
} from '../serverUtils'

const DEFAULT_DEVICE_SCOPES = ['scanner:write', 'product:lookup', 'stock:add', 'location:read']
const ALLOWED_DEVICE_SCOPES = new Set([
  ...DEFAULT_DEVICE_SCOPES,
  'product:read',
  'stock:read',
  'stock:write',
  'location:*',
])

function normalizePairingKey(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function normalizeDeviceMode(value: unknown) {
  const mode = String(value || 'lookup').trim()
  return ['lookup', 'stock_add', 'shopping_check'].includes(mode) ? mode : 'lookup'
}

function normalizeDeviceType(value: unknown) {
  const type = String(value || 'scanner').trim().toLowerCase()
  return type || 'scanner'
}

function normalizeDeviceScopes(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_DEVICE_SCOPES
  const scopes = value.map((scope) => String(scope).trim()).filter((scope) => ALLOWED_DEVICE_SCOPES.has(scope))
  return scopes.length ? Array.from(new Set(scopes)) : DEFAULT_DEVICE_SCOPES
}

function resolveApiBaseUrl(req: ExpressRequest) {
  const configured =
    process.env.API_BASE_URL || process.env.BACKEND_PUBLIC_URL || process.env.NEXT_PUBLIC_API_BASE || process.env.BACKEND_URL
  const raw =
    configured ||
    `${String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0]}://${
      String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]
    }`
  const normalized = raw.replace(/\/$/, '')
  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`
}

function publicDevice(device: {
  id: number
  name: string
  type: string
  status: string
  householdId: number
  defaultLocationId: number | null
  defaultMode: string
  lastSeenAt?: Date | null
  createdAt: Date
  updatedAt?: Date
}) {
  return {
    id: device.id,
    name: device.name,
    type: device.type,
    status: device.status,
    householdId: device.householdId,
    defaultLocationId: device.defaultLocationId,
    defaultMode: device.defaultMode,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  }
}

export function registerDeviceRoutes(app: Express) {
  app.get(apiRoute('/api/devices'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return res.json({ devices: [] })

      const devices = await prisma.device.findMany({
        where: { householdId: auth.householdId },
        orderBy: { createdAt: 'desc' },
        include: {
          tokens: {
            select: {
              id: true,
              tokenPrefix: true,
              scopes: true,
              lastUsedAt: true,
              revokedAt: true,
              expiresAt: true,
              createdAt: true,
            },
          },
        },
      })

      return res.json({
        devices: devices.map((device: any) => ({
          ...publicDevice(device),
          tokens: device.tokens.map((token: any) => ({
            id: token.id,
            tokenPrefix: token.tokenPrefix,
            scopes: parseScopes(token.scopes),
            lastUsedAt: token.lastUsedAt,
            revokedAt: token.revokedAt,
            expiresAt: token.expiresAt,
            createdAt: token.createdAt,
          })),
        })),
      })
    } catch (err) {
      console.error('GET /api/devices error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/devices/pairing'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const defaultLocationId = parsePositiveInt(req.body?.defaultLocationId)
      if (defaultLocationId) {
        const location = await prisma.location.findUnique({ where: { id: defaultLocationId } })
        if (!location || location.householdId !== auth.householdId) {
          return sendApiError(res, 404, 'not_found', 'Default location not found')
        }
      }

      const ttlSecondsRaw = Number(req.body?.ttlSeconds || 600)
      const ttlSeconds = Number.isFinite(ttlSecondsRaw) ? Math.min(Math.max(ttlSecondsRaw, 60), 3600) : 600
      const pairingKey = generatePairingKey()
      const apiBase = resolveApiBaseUrl(req)
      const scopes = normalizeDeviceScopes(req.body?.scopes)
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

      const pairing = await prisma.devicePairing.create({
        data: {
          keyHash: hashSecret(pairingKey),
          keyPrefix: pairingKey.slice(0, 10),
          householdId: auth.householdId,
          createdById: auth.userId || undefined,
          deviceName: req.body?.name ? String(req.body.name).trim() : null,
          deviceType: normalizeDeviceType(req.body?.type),
          defaultLocationId: defaultLocationId || null,
          defaultMode: normalizeDeviceMode(req.body?.defaultMode),
          scopes: serializeScopes(scopes),
          expiresAt,
        },
      })

      return res.json({
        ok: true,
        pairing: {
          id: pairing.id,
          key: pairingKey,
          keyPrefix: pairing.keyPrefix,
          apiBase,
          qrPayload: JSON.stringify({ v: 1, api: apiBase, pair: pairingKey }),
          expiresAt: pairing.expiresAt,
          scopes,
          defaultMode: pairing.defaultMode,
          defaultLocationId: pairing.defaultLocationId,
        },
      })
    } catch (err) {
      console.error('POST /api/devices/pairing error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/devices/pair'), async (req, res) => {
    try {
      const pairingKey = normalizePairingKey(req.body?.pairingKey || req.body?.pair || req.body?.key)
      if (!pairingKey) return sendApiError(res, 400, 'bad_request', 'pairingKey required')

      const pairing = await prisma.devicePairing.findUnique({ where: { keyHash: hashSecret(pairingKey) } })
      if (!pairing) return sendApiError(res, 404, 'not_found', 'Pairing key not found')
      if (pairing.usedAt) return sendApiError(res, 409, 'conflict', 'Pairing key already used')
      if (pairing.expiresAt <= new Date()) return sendApiError(res, 410, 'expired', 'Pairing key expired')

      const requestedName =
        req.body?.device?.name || req.body?.name || req.body?.deviceName || pairing.deviceName || `Scanner ${pairing.keyPrefix}`
      const requestedType = req.body?.device?.type || req.body?.type || pairing.deviceType
      const scopes = parseScopes(pairing.scopes)
      const apiBase = resolveApiBaseUrl(req)
      const plainToken = generateApiToken()
      const tokenPrefix = plainToken.slice(0, 12)

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const device = await tx.device.create({
          data: {
            name: String(requestedName).trim() || `Scanner ${pairing.keyPrefix}`,
            type: normalizeDeviceType(requestedType),
            status: 'active',
            householdId: pairing.householdId,
            createdById: pairing.createdById || undefined,
            defaultLocationId: pairing.defaultLocationId || undefined,
            defaultMode: pairing.defaultMode,
          },
        })

        await tx.apiToken.create({
          data: {
            name: `${device.name} token`,
            tokenHash: hashSecret(plainToken),
            tokenPrefix,
            scopes: serializeScopes(scopes),
            clientType: 'device',
            householdId: pairing.householdId,
            userId: pairing.createdById || undefined,
            deviceId: device.id,
          },
        })

        await tx.devicePairing.update({
          where: { id: pairing.id },
          data: { usedAt: new Date(), deviceId: device.id },
        })

        return device
      })

      return res.json({
        ok: true,
        device: publicDevice(result),
        apiBase,
        token: plainToken,
        scopes,
        defaultMode: result.defaultMode,
        defaultLocationId: result.defaultLocationId,
      })
    } catch (err) {
      console.error('POST /api/devices/pair error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/devices/:id/revoke'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = parsePositiveInt(req.params.id)
      if (!id) return sendApiError(res, 400, 'bad_request', 'invalid id')

      const device = await prisma.device.findUnique({ where: { id } })
      if (!device || (auth.householdId && device.householdId !== auth.householdId)) {
        return sendApiError(res, 404, 'not_found', 'Device not found')
      }

      const now = new Date()
      await prisma.$transaction([
        prisma.device.update({ where: { id }, data: { status: 'revoked' } }),
        prisma.apiToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: now } }),
      ])

      return res.json({ ok: true })
    } catch (err) {
      console.error('POST /api/devices/:id/revoke error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/devices/:id/rotate-token'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = parsePositiveInt(req.params.id)
      if (!id) return sendApiError(res, 400, 'bad_request', 'invalid id')

      const device = await prisma.device.findUnique({
        where: { id },
        include: {
          tokens: {
            where: { revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })
      if (!device || (auth.householdId && device.householdId !== auth.householdId)) {
        return sendApiError(res, 404, 'not_found', 'Device not found')
      }
      if (device.status !== 'active') {
        return sendApiError(res, 400, 'bad_request', 'Device is not active')
      }

      const now = new Date()
      const plainToken = generateApiToken()
      const tokenPrefix = plainToken.slice(0, 12)
      const scopes = device.tokens[0] ? parseScopes(device.tokens[0].scopes) : DEFAULT_DEVICE_SCOPES

      await prisma.$transaction([
        prisma.apiToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: now } }),
        prisma.apiToken.create({
          data: {
            name: `${device.name} token`,
            tokenHash: hashSecret(plainToken),
            tokenPrefix,
            scopes: serializeScopes(scopes),
            clientType: 'device',
            householdId: device.householdId,
            userId: auth.userId || undefined,
            deviceId: device.id,
          },
        }),
      ])

      return res.json({
        ok: true,
        device: publicDevice(device),
        apiBase: resolveApiBaseUrl(req),
        token: plainToken,
        tokenPrefix,
        scopes,
      })
    } catch (err) {
      console.error('POST /api/devices/:id/rotate-token error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
