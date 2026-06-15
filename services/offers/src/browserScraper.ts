import fs from 'fs/promises'
import path from 'path'

import { envNumber, isTruthy, normalizePostalCode, normalizeRetailerKeys } from './config'
import { connectorFor, extractOffers } from './connectors'
import { sha256 } from './connectors/common'
import { prisma } from './db'
import { replaceOffersForTarget, scanTargetRowToInput, upsertScanTargets } from './refresh'
import type { NormalizedOffer, OfferSource, RetailerKey, ScanTargetInput } from './types'

type BrowserScrapeStatus = 'ok' | 'blocked' | 'error' | 'skipped'

type BrowserScrapeUrlResult = {
  url: string
  finalUrl: string
  status: BrowserScrapeStatus
  httpStatus: number | null
  offersFound: number
  message: string | null
  htmlPath: string | null
  screenshotPath: string | null
  source: OfferSource | null
  offers: NormalizedOffer[]
}

type BrowserScrapeUrlPublicResult = Omit<BrowserScrapeUrlResult, 'source' | 'offers'>

type BrowserScrapeTargetResult = {
  scanTargetId: number
  retailerKey: RetailerKey
  retailerName: string
  scopeValue: string
  status: BrowserScrapeStatus
  changed: boolean
  offersFound: number
  message: string | null
  urls: BrowserScrapeUrlPublicResult[]
}

type BrowserScrapeRunInput = {
  postalCode?: unknown
  retailerKeys?: unknown
  scanTargetIds?: unknown
  force?: boolean
  requestedBy?: string
}

const SUPPORTED_BROWSER_RETAILERS = new Set<RetailerKey>(['marktkauf'])

function browserRetailerKeys(value: unknown): RetailerKey[] {
  const raw = value == null || value === '' ? process.env.OFFERS_BROWSER_RETAILERS || 'marktkauf' : value
  return normalizeRetailerKeys(raw).filter((key) => SUPPORTED_BROWSER_RETAILERS.has(key))
}

export function browserScraperEnabled() {
  return isTruthy(process.env.OFFERS_BROWSER_SCRAPER_ENABLED)
}

function snapshotRoot() {
  return process.env.OFFERS_BROWSER_SNAPSHOT_DIR || path.resolve(process.cwd(), 'tmp/offers-browser-snapshots')
}

function safePathPart(value: unknown) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function timestampPart() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function redactSecretText(value: unknown) {
  return String(value || '')
    .replace(/([?&](?:token|api_key|apikey|access_token|key)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[redacted]')
}

async function loadPlaywright() {
  const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
  try {
    return await importer('playwright-core')
  } catch (err: any) {
    const message = String(err?.message || err)
    if (!/Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)) throw err
  }

  try {
    return await importer('playwright')
  } catch (err: any) {
    const message = String(err?.message || err)
    if (/Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)) return null
    throw err
  }
}

function browserCdpEndpoint() {
  return String(process.env.OFFERS_BROWSER_WS_ENDPOINT || process.env.OFFERS_BROWSER_CDP_ENDPOINT || '').trim()
}

function statusFromResults(results: Array<Pick<BrowserScrapeUrlResult, 'status' | 'offersFound'>>): BrowserScrapeStatus {
  if (!results.length) return 'skipped'
  if (results.some((result) => result.status === 'ok' && result.offersFound > 0)) return 'ok'
  if (results.every((result) => result.status === 'blocked')) return 'blocked'
  if (results.every((result) => result.status === 'skipped')) return 'skipped'
  if (results.some((result) => result.status === 'error')) return 'error'
  return results.some((result) => result.status === 'blocked') ? 'blocked' : 'ok'
}

function publicUrlResult(result: BrowserScrapeUrlResult): BrowserScrapeUrlPublicResult {
  return {
    url: result.url,
    finalUrl: result.finalUrl,
    status: result.status,
    httpStatus: result.httpStatus,
    offersFound: result.offersFound,
    message: result.message,
    htmlPath: result.htmlPath,
    screenshotPath: result.screenshotPath,
  }
}

function blockedMessage(httpStatus: number | null, html: string) {
  if (httpStatus && [401, 403, 429].includes(httpStatus)) return `blocked_http_${httpStatus}`
  const sample = html.slice(0, 50000)
  if (/Access Denied|Akamai|captcha|Cloudflare|unusual traffic|bot detection|automated access/i.test(sample)) {
    return 'blocked_marker_detected'
  }
  return null
}

async function clickFirstVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first()
      if (await locator.isVisible({ timeout: 800 })) {
        await locator.click({ timeout: 1500 })
        await page.waitForTimeout(500)
        return true
      }
    } catch {
      // Try the next known cookie selector.
    }
  }
  return false
}

async function dismissCookieDialog(page: any) {
  await clickFirstVisible(page, [
    '#onetrust-accept-btn-handler',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Akzeptieren")',
    'button:has-text("Zustimmen")',
    'button:has-text("Einverstanden")',
    '[aria-label*="akzeptieren" i]',
  ])
}

async function setPostalCodeIfPossible(page: any, postalCode: string | null | undefined) {
  if (!postalCode) return false
  const selectors = [
    'input[name*="plz" i]',
    'input[name*="zip" i]',
    'input[name*="postal" i]',
    'input[placeholder*="PLZ" i]',
    'input[placeholder*="Postleitzahl" i]',
    'input[type="search"]',
  ]

  for (const selector of selectors) {
    try {
      const input = page.locator(selector).first()
      if (!(await input.isVisible({ timeout: 800 }))) continue
      await input.fill(postalCode, { timeout: 2000 })
      await input.press('Enter', { timeout: 1000 }).catch(() => undefined)
      await page.waitForTimeout(envNumber('OFFERS_BROWSER_SETTLE_MS', 2500))
      return true
    } catch {
      // Form structure is retailer-specific; keep trying generic selectors.
    }
  }
  return false
}

async function createSnapshotFilePaths(target: ScanTargetInput, urlIndex: number) {
  const dir = path.join(snapshotRoot(), safePathPart(target.retailerKey), safePathPart(target.scopeValue || target.postalCode))
  await fs.mkdir(dir, { recursive: true })
  const baseName = `${timestampPart()}-${safePathPart(target.retailerKey)}-${safePathPart(target.scopeValue)}-${urlIndex + 1}`
  return {
    htmlPath: path.join(dir, `${baseName}.html`),
    screenshotPath: path.join(dir, `${baseName}.png`),
  }
}

async function recordSnapshot(input: {
  row: any
  target: ScanTargetInput
  sourceUrl: string
  status: BrowserScrapeStatus
  httpStatus?: number | null
  offersFound?: number
  message?: string | null
  htmlPath?: string | null
  screenshotPath?: string | null
}) {
  return prisma.browserScrapeSnapshot.create({
    data: {
      scanTargetId: input.row.id,
      retailerKey: input.target.retailerKey,
      retailerName: input.target.retailerName,
      postalCode: input.target.postalCode || null,
      sourceUrl: input.sourceUrl,
      status: input.status,
      httpStatus: input.httpStatus || null,
      offersFound: input.offersFound || 0,
      message: input.message || null,
      htmlPath: input.htmlPath || null,
      screenshotPath: input.screenshotPath || null,
    },
  })
}

async function scrapeUrlWithBrowser(context: any, row: any, target: ScanTargetInput, url: string, urlIndex: number) {
  const timeoutMs = envNumber('OFFERS_BROWSER_TIMEOUT_MS', 45000)
  const settleMs = envNumber('OFFERS_BROWSER_SETTLE_MS', 2500)
  const page = await context.newPage()
  let httpStatus: number | null = null
  let html = ''
  let finalUrl = url
  let htmlPath: string | null = null
  let screenshotPath: string | null = null

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    httpStatus = response ? response.status() : null
    await dismissCookieDialog(page)
    await setPostalCodeIfPossible(page, target.postalCode)
    await page.waitForTimeout(settleMs)

    finalUrl = page.url() || url
    html = await page.content()
    const paths = await createSnapshotFilePaths(target, urlIndex)
    htmlPath = paths.htmlPath
    screenshotPath = paths.screenshotPath
    await fs.writeFile(htmlPath, html, 'utf8')
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {
      screenshotPath = null
    })

    const blocked = blockedMessage(httpStatus, html)
    if (blocked) {
      await recordSnapshot({
        row,
        target,
        sourceUrl: finalUrl,
        status: 'blocked',
        httpStatus,
        message: blocked,
        htmlPath,
        screenshotPath,
      })
      return {
        url,
        finalUrl,
        status: 'blocked' as const,
        httpStatus,
        offersFound: 0,
        message: blocked,
        htmlPath,
        screenshotPath,
        source: null,
        offers: [],
      }
    }

    const source: OfferSource = {
      url: finalUrl,
      body: html,
      contentType: 'text/html; charset=utf-8',
      method: 'html',
    }
    const offers = await extractOffers(target, source)
    const message = offers.length ? null : 'no_offers_extracted'
    await recordSnapshot({
      row,
      target,
      sourceUrl: finalUrl,
      status: 'ok',
      httpStatus,
      offersFound: offers.length,
      message,
      htmlPath,
      screenshotPath,
    })

    return {
      url,
      finalUrl,
      status: 'ok' as const,
      httpStatus,
      offersFound: offers.length,
      message,
      htmlPath,
      screenshotPath,
      source,
      offers,
    }
  } catch (err: any) {
    const message = redactSecretText(err?.message || err).slice(0, 500)
    try {
      html = html || (await page.content())
      finalUrl = page.url() || url
      const paths = await createSnapshotFilePaths(target, urlIndex)
      htmlPath = paths.htmlPath
      screenshotPath = paths.screenshotPath
      await fs.writeFile(htmlPath, html, 'utf8')
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {
        screenshotPath = null
      })
    } catch {
      // Keep the original browser error as the useful diagnostic.
    }
    await recordSnapshot({
      row,
      target,
      sourceUrl: finalUrl,
      status: 'error',
      httpStatus,
      message,
      htmlPath,
      screenshotPath,
    })
    return {
      url,
      finalUrl,
      status: 'error' as const,
      httpStatus,
      offersFound: 0,
      message,
      htmlPath,
      screenshotPath,
      source: null,
      offers: [],
    }
  } finally {
    await page.close().catch(() => undefined)
  }
}

async function markBrowserUnavailable(row: any, target: ScanTargetInput, status: BrowserScrapeStatus, message: string) {
  const urls = connectorFor(target.retailerKey).sourceUrls(target)
  const results: BrowserScrapeUrlResult[] = []
  for (const url of urls) {
    await recordSnapshot({
      row,
      target,
      sourceUrl: url,
      status,
      message,
    })
    results.push({
      url,
      finalUrl: url,
      status,
      httpStatus: null,
      offersFound: 0,
      message,
      htmlPath: null,
      screenshotPath: null,
      source: null,
      offers: [],
    })
  }
  return results.map(publicUrlResult)
}

async function runTargetWithContext(row: any, context: any, force: boolean): Promise<BrowserScrapeTargetResult> {
  const target = scanTargetRowToInput(row)
  const connector = connectorFor(target.retailerKey)
  const urls = connector.sourceUrls(target)
  const results: BrowserScrapeUrlResult[] = []

  for (let index = 0; index < urls.length; index += 1) {
    results.push(await scrapeUrlWithBrowser(context, row, target, urls[index], index))
  }

  const sources = results.map((result) => result.source).filter(Boolean) as OfferSource[]
  const offers = results.flatMap((result) => result.offers)
  const combinedFingerprint = sources.length
    ? sha256(sources.map((source) => `${source.url}\n${source.body}`).join('\n---browser-source---\n'))
    : null
  const changed = Boolean(offers.length && combinedFingerprint && (force || !row.lastFingerprint || row.lastFingerprint !== combinedFingerprint))

  if (offers.length && combinedFingerprint) {
    if (changed) await replaceOffersForTarget(row.id, offers)
    await prisma.scanTarget.update({
      where: { id: row.id },
      data: {
        lastFingerprint: combinedFingerprint,
        lastRefreshedAt: new Date(),
        sourceUrl: sources[0]?.url || row.sourceUrl || null,
      },
    })
  }

  return {
    scanTargetId: row.id,
    retailerKey: target.retailerKey,
    retailerName: target.retailerName,
    scopeValue: target.scopeValue,
    status: statusFromResults(results),
    changed,
    offersFound: offers.length,
    message: offers.length ? null : results.find((result) => result.message)?.message || 'no_offers_extracted',
    urls: results.map(publicUrlResult),
  }
}

async function loadTargets(input: BrowserScrapeRunInput, retailerKeys: RetailerKey[]) {
  const postalCode = normalizePostalCode(input.postalCode)
  if (postalCode) return upsertScanTargets(postalCode, retailerKeys)

  if (Array.isArray(input.scanTargetIds) && input.scanTargetIds.length) {
    return prisma.scanTarget.findMany({
      where: {
        id: { in: input.scanTargetIds.map(Number).filter(Boolean) },
        isActive: true,
        retailerKey: { in: retailerKeys },
      },
      orderBy: { updatedAt: 'asc' },
    })
  }

  return prisma.scanTarget.findMany({
    where: { isActive: true, retailerKey: { in: retailerKeys } },
    orderBy: { updatedAt: 'asc' },
  })
}

export async function runBrowserScrapes(input: BrowserScrapeRunInput = {}) {
  const retailerKeys = browserRetailerKeys(input.retailerKeys)
  const targets = retailerKeys.length ? await loadTargets(input, retailerKeys) : []
  const maxTargets = envNumber('OFFERS_BROWSER_MAX_TARGETS_PER_RUN', 5)
  const selectedTargets = targets.slice(0, maxTargets)
  const startedAt = new Date()

  if (!selectedTargets.length) {
    return {
      status: 'skipped',
      requestedBy: input.requestedBy || null,
      supportedRetailers: Array.from(SUPPORTED_BROWSER_RETAILERS),
      scannedTargets: 0,
      changedTargets: 0,
      offersFound: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      message: retailerKeys.length ? 'no_browser_scan_targets' : 'no_supported_browser_retailers',
      targets: [],
    }
  }

  const playwright = await loadPlaywright()
  if (!playwright) {
    const targetResults: BrowserScrapeTargetResult[] = []
    for (const row of selectedTargets) {
      const target = scanTargetRowToInput(row)
      const urls = await markBrowserUnavailable(
        row,
        target,
        'skipped',
        'browser_runtime_missing: install playwright-core in the offers service to enable browser scraping'
      )
      targetResults.push({
        scanTargetId: row.id,
        retailerKey: target.retailerKey,
        retailerName: target.retailerName,
        scopeValue: target.scopeValue,
        status: 'skipped',
        changed: false,
        offersFound: 0,
        message: 'browser_runtime_missing',
        urls,
      })
    }
    return {
      status: 'skipped',
      requestedBy: input.requestedBy || null,
      supportedRetailers: Array.from(SUPPORTED_BROWSER_RETAILERS),
      scannedTargets: selectedTargets.length,
      changedTargets: 0,
      offersFound: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      message: 'browser_runtime_missing: install playwright-core in the offers service to enable browser scraping',
      targets: targetResults,
    }
  }

  const cdpEndpoint = browserCdpEndpoint()
  let browser: any
  try {
    browser = cdpEndpoint
      ? await playwright.chromium.connectOverCDP(cdpEndpoint, {
          timeout: envNumber('OFFERS_BROWSER_CONNECT_TIMEOUT_MS', 30000),
        })
      : await playwright.chromium.launch({
          headless: process.env.OFFERS_BROWSER_HEADLESS !== 'false',
        })
  } catch (err: any) {
    const message = `${cdpEndpoint ? 'browser_connect_failed' : 'browser_launch_failed'}: ${redactSecretText(err?.message || err).slice(0, 500)}`
    const targetResults: BrowserScrapeTargetResult[] = []
    for (const row of selectedTargets) {
      const target = scanTargetRowToInput(row)
      const urls = await markBrowserUnavailable(row, target, 'error', message)
      targetResults.push({
        scanTargetId: row.id,
        retailerKey: target.retailerKey,
        retailerName: target.retailerName,
        scopeValue: target.scopeValue,
        status: 'error',
        changed: false,
        offersFound: 0,
        message,
        urls,
      })
    }
    return {
      status: 'error',
      requestedBy: input.requestedBy || null,
      supportedRetailers: Array.from(SUPPORTED_BROWSER_RETAILERS),
      scannedTargets: selectedTargets.length,
      changedTargets: 0,
      offersFound: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      message,
      browserMode: cdpEndpoint ? 'remote-cdp' : 'local',
      targets: targetResults,
    }
  }

  let context: any
  try {
    const contextOptions = {
      locale: 'de-DE',
      timezoneId: process.env.TZ || 'Europe/Berlin',
      viewport: { width: 1365, height: 900 },
      userAgent: process.env.OFFERS_BROWSER_USER_AGENT || undefined,
    }
    context = await browser.newContext(contextOptions).catch(() => browser.contexts?.()[0])
    if (!context) throw new Error('browser_context_unavailable')

    const targetResults: BrowserScrapeTargetResult[] = []
    for (const row of selectedTargets) {
      targetResults.push(await runTargetWithContext(row, context, Boolean(input.force)))
    }

    const changedTargets = targetResults.filter((target) => target.changed).length
    const offersFound = targetResults.reduce((sum, target) => sum + target.offersFound, 0)
    const status = targetResults.some((target) => target.status === 'ok' && target.offersFound > 0)
      ? 'ok'
      : statusFromResults(targetResults.flatMap((target) => target.urls))

    return {
      status,
      requestedBy: input.requestedBy || null,
      supportedRetailers: Array.from(SUPPORTED_BROWSER_RETAILERS),
      scannedTargets: selectedTargets.length,
      changedTargets,
      offersFound,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      message: offersFound ? null : targetResults.find((target) => target.message)?.message || null,
      browserMode: cdpEndpoint ? 'remote-cdp' : 'local',
      targets: targetResults,
    }
  } finally {
    await context?.close?.().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

export async function listBrowserScrapeSnapshots(input: { retailerKeys?: unknown; limit?: unknown } = {}) {
  const retailerKeys = input.retailerKeys == null ? null : normalizeRetailerKeys(input.retailerKeys)
  const rawLimit = Number(input.limit || 25)
  const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 25))
  return prisma.browserScrapeSnapshot.findMany({
    where: retailerKeys ? { retailerKey: { in: retailerKeys } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
