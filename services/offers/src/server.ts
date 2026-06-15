import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

import { browserScraperEnabled, listBrowserScrapeSnapshots, runBrowserScrapes } from './browserScraper'
import { DEFAULT_RETAILERS, envNumber, normalizePostalCode, normalizeRetailerKeys } from './config'
import { prisma } from './db'
import { createOfferPlan, getLatestPlan, getPlan } from './planner'
import { getLatestRefresh, listCurrentOffers, purgeOldOffers, refreshOffers, upsertScanTargets } from './refresh'
import { ensureOfferSchema } from './schema'

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(bodyParser.json({ limit: '10mb' }))

function requireServiceToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected = process.env.OFFERS_SERVICE_TOKEN
  if (!expected) return next()

  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization || ''
  const token = String(header).replace(/^Bearer\s+/i, '').trim()
  if (token && token === expected) return next()

  return res.status(401).json({ error: 'unauthorized' })
}

function errorResponse(res: express.Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'postal_code_required') return res.status(400).json({ error: message })
  if (message === 'invalid_household') return res.status(400).json({ error: message })
  console.error('[offers] request error', err)
  return res.status(500).json({ error: 'server_error', message })
}

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

app.use(requireServiceToken)

app.post('/scan-targets/resolve', async (req, res) => {
  try {
    const postalCode = normalizePostalCode(req.body?.postalCode)
    if (!postalCode) return res.status(400).json({ error: 'postal_code_required' })
    const retailerKeys = normalizeRetailerKeys(req.body?.retailerKeys)
    const targets = await upsertScanTargets(postalCode, retailerKeys)
    return res.json({ targets })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.post('/refresh', async (req, res) => {
  try {
    const run = await refreshOffers({
      postalCode: req.body?.postalCode,
      retailerKeys: req.body?.retailerKeys || DEFAULT_RETAILERS,
      scanTargetIds: req.body?.scanTargetIds,
      force: Boolean(req.body?.force),
      requestedBy: req.body?.requestedBy ? String(req.body.requestedBy) : 'api',
    })
    await purgeOldOffers().catch((err) => console.warn('[offers] purge failed', err))
    return res.json({ run })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.get('/refresh/latest', async (_req, res) => {
  try {
    return res.json({ run: await getLatestRefresh() })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.post('/browser-scrape/run', async (req, res) => {
  try {
    const run = await runBrowserScrapes({
      postalCode: req.body?.postalCode,
      retailerKeys: req.body?.retailerKeys,
      scanTargetIds: req.body?.scanTargetIds,
      force: Boolean(req.body?.force),
      requestedBy: req.body?.requestedBy ? String(req.body.requestedBy) : 'api',
    })
    return res.json({ run })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.get('/browser-scrape/snapshots/latest', async (req, res) => {
  try {
    return res.json({
      snapshots: await listBrowserScrapeSnapshots({
        retailerKeys: req.query.retailerKeys,
        limit: req.query.limit,
      }),
    })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.get('/offers/current', async (req, res) => {
  try {
    const data = await listCurrentOffers({
      postalCode: req.query.postalCode,
      retailerKeys: req.query.retailerKeys,
      limit: req.query.limit,
    })
    return res.json(data)
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.post('/plans', async (req, res) => {
  try {
    const plan = await createOfferPlan({
      householdId: req.body?.householdId,
      postalCode: req.body?.postalCode,
      retailerKeys: req.body?.retailerKeys,
      maxStores: req.body?.maxStores,
      shoppingItems: req.body?.shoppingItems || [],
      forceRefresh: Boolean(req.body?.forceRefresh),
    })
    return res.json({ plan })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.get('/plans/latest', async (req, res) => {
  try {
    return res.json({ plan: await getLatestPlan(req.query.householdId) })
  } catch (err) {
    return errorResponse(res, err)
  }
})

app.get('/plans/:id', async (req, res) => {
  try {
    const plan = await getPlan(req.params.id)
    if (!plan) return res.status(404).json({ error: 'not_found' })
    return res.json({ plan })
  } catch (err) {
    return errorResponse(res, err)
  }
})

function millisUntilNextDailyRun(hour: number) {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

function scheduleDailyRefresh() {
  if (process.env.OFFERS_SCHEDULER_ENABLED === 'false') return
  const hour = envNumber('OFFERS_REFRESH_HOUR', 6)
  const run = async () => {
    try {
      console.log('[offers] daily refresh started')
      await refreshOffers({ requestedBy: 'scheduler', force: false })
      if (browserScraperEnabled()) {
        const browserRun = await runBrowserScrapes({ requestedBy: 'scheduler', force: false })
        console.log(
          `[offers] browser scrape finished: status=${browserRun.status} targets=${browserRun.scannedTargets} offers=${browserRun.offersFound}`
        )
      }
      await purgeOldOffers()
      console.log('[offers] daily refresh finished')
    } catch (err) {
      console.error('[offers] daily refresh failed', err)
    } finally {
      setTimeout(run, millisUntilNextDailyRun(hour))
    }
  }
  setTimeout(run, millisUntilNextDailyRun(hour))
}

async function start() {
  await ensureOfferSchema()
  const port = Number(process.env.PORT || 3010)
  app.listen(port, () => {
    console.log(`[offers] service listening on http://0.0.0.0:${port}`)
    scheduleDailyRefresh()
  })
}

start().catch((err) => {
  console.error('[offers] failed to start', err)
  process.exit(1)
})
