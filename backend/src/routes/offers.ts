import type { Express } from 'express'

import { prisma } from '../../lib/prisma'
import { ensureHouseholdOfferSettingsTable, ensureShoppingListItemTable } from '../../lib/dbFixes'
import { apiRoute, sendApiError } from '../apiContract'
import { requireAuth } from '../serverUtils'

const ALLOWED_RETAILERS = ['aldi', 'kaufland', 'lidl', 'rewe'] as const
const DEFAULT_RETAILERS = [...ALLOWED_RETAILERS]

function parseRetailerKeys(value: unknown) {
  let raw: unknown[] = []
  if (Array.isArray(value)) raw = value
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      raw = Array.isArray(parsed) ? parsed : value.split(/[,\s]+/)
    } catch {
      raw = value.split(/[,\s]+/)
    }
  }

  const keys = raw
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry): entry is (typeof ALLOWED_RETAILERS)[number] => ALLOWED_RETAILERS.includes(entry as any))

  return Array.from(new Set(keys.length ? keys : DEFAULT_RETAILERS))
}

function normalizePostalCode(value: unknown) {
  const postalCode = String(value || '').trim()
  return /^[0-9A-Za-z][0-9A-Za-z\-\s]{2,12}$/.test(postalCode) ? postalCode : ''
}

async function getOrCreateSettings(householdId: number) {
  await ensureHouseholdOfferSettingsTable()
  const existing = await prisma.householdOfferSettings.findUnique({ where: { householdId } })
  if (existing) return existing
  return prisma.householdOfferSettings.create({
    data: {
      householdId,
      retailerKeys: JSON.stringify(DEFAULT_RETAILERS),
      maxStores: 3,
    },
  })
}

function publicSettings(settings: any) {
  return {
    id: settings.id,
    householdId: settings.householdId,
    postalCode: settings.postalCode || '',
    retailerKeys: parseRetailerKeys(settings.retailerKeys),
    maxStores: Math.max(1, Math.min(3, Number(settings.maxStores || 3))),
    retailers: ALLOWED_RETAILERS.map((key) => ({
      key,
      name: key === 'aldi' ? 'ALDI' : key === 'rewe' ? 'REWE' : key[0].toUpperCase() + key.slice(1),
    })),
  }
}

async function callOffersService(path: string, body?: unknown, method = 'POST') {
  const base = (process.env.OFFERS_SERVICE_URL || '').replace(/\/$/, '')
  if (!base) {
    const err = new Error('OFFERS_SERVICE_URL_NOT_CONFIGURED')
    ;(err as any).status = 503
    throw err
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.OFFERS_SERVICE_TOKEN) headers.Authorization = `Bearer ${process.env.OFFERS_SERVICE_TOKEN}`

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `offers_service_${res.status}`)
    ;(err as any).status = res.status
    ;(err as any).details = data
    throw err
  }
  return data
}

async function getShoppingItemsForHousehold(householdId: number) {
  await ensureShoppingListItemTable()
  return prisma.shoppingListItem.findMany({
    where: { householdId },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
  })
}

export function registerOfferRoutes(app: Express) {
  app.get(apiRoute('/api/offers/settings'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const settings = await getOrCreateSettings(auth.householdId)
      return res.json({ settings: publicSettings(settings) })
    } catch (err) {
      console.error('GET /api/offers/settings error', err)
      return sendApiError(res, 500, 'server_error', 'server error')
    }
  })

  app.put(apiRoute('/api/offers/settings'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      await ensureHouseholdOfferSettingsTable()
      const postalCode = normalizePostalCode(req.body?.postalCode)
      const retailerKeys = parseRetailerKeys(req.body?.retailerKeys)
      const maxStores = Math.max(1, Math.min(3, Number(req.body?.maxStores || 3)))

      const settings = await prisma.householdOfferSettings.upsert({
        where: { householdId: auth.householdId },
        update: {
          postalCode: postalCode || null,
          retailerKeys: JSON.stringify(retailerKeys),
          maxStores,
        },
        create: {
          householdId: auth.householdId,
          postalCode: postalCode || null,
          retailerKeys: JSON.stringify(retailerKeys),
          maxStores,
        },
      })

      if (postalCode) {
        await callOffersService('/scan-targets/resolve', { postalCode, retailerKeys }).catch((err) => {
          console.warn('[offers] scan target resolve failed', err)
        })
      }

      return res.json({ settings: publicSettings(settings) })
    } catch (err) {
      console.error('PUT /api/offers/settings error', err)
      return sendApiError(res, 500, 'server_error', 'server error')
    }
  })

  app.post(apiRoute('/api/offers/refresh'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const settings = publicSettings(await getOrCreateSettings(auth.householdId))
      if (!settings.postalCode) return sendApiError(res, 400, 'validation_error', 'postalCode required')

      const data = await callOffersService('/refresh', {
        postalCode: settings.postalCode,
        retailerKeys: settings.retailerKeys,
        force: Boolean(req.body?.force),
        requestedBy: `household:${auth.householdId}`,
      })
      return res.json(data)
    } catch (err: any) {
      console.error('POST /api/offers/refresh error', err)
      return sendApiError(res, err?.status || 500, 'server_error', err?.message || 'server error', err?.details)
    }
  })

  app.post(apiRoute('/api/shopping/offer-plan'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const settings = publicSettings(await getOrCreateSettings(auth.householdId))
      if (!settings.postalCode) return sendApiError(res, 400, 'validation_error', 'postalCode required')

      const items = await getShoppingItemsForHousehold(auth.householdId)
      const data = await callOffersService('/plans', {
        householdId: auth.householdId,
        postalCode: settings.postalCode,
        retailerKeys: settings.retailerKeys,
        maxStores: settings.maxStores,
        shoppingItems: items,
        forceRefresh: Boolean(req.body?.forceRefresh),
      })
      return res.json(data)
    } catch (err: any) {
      console.error('POST /api/shopping/offer-plan error', err)
      return sendApiError(res, err?.status || 500, 'server_error', err?.message || 'server error', err?.details)
    }
  })

  app.get(apiRoute('/api/shopping/offer-plan/latest'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!auth.householdId) return sendApiError(res, 400, 'bad_request', 'No household assigned')

      const query = new URLSearchParams({ householdId: String(auth.householdId) }).toString()
      const data = await callOffersService(`/plans/latest?${query}`, undefined, 'GET')
      return res.json(data)
    } catch (err: any) {
      if (err?.message === 'OFFERS_SERVICE_URL_NOT_CONFIGURED') return res.json({ plan: null })
      console.error('GET /api/shopping/offer-plan/latest error', err)
      return sendApiError(res, err?.status || 500, 'server_error', err?.message || 'server error', err?.details)
    }
  })
}
