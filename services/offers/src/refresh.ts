import { envNumber, normalizePostalCode, normalizeRetailerKeys } from './config'
import { prisma } from './db'
import { extractOffers, fetchSources, resolveScanTargets } from './connectors'
import { sha256 } from './connectors/common'
import type { NormalizedOffer, RetailerKey, ScanTargetInput } from './types'

function asJson(value: unknown) {
  return JSON.stringify(value)
}

export async function upsertScanTargets(postalCode: string, retailerKeys: RetailerKey[]) {
  const targets = resolveScanTargets(postalCode, retailerKeys)
  const rows = []
  for (const target of targets) {
    rows.push(
      await prisma.scanTarget.upsert({
        where: {
          retailerKey_scopeType_scopeValue: {
            retailerKey: target.retailerKey,
            scopeType: target.scopeType,
            scopeValue: target.scopeValue,
          },
        },
        update: {
          retailerName: target.retailerName,
          postalCode: target.postalCode || null,
          storeId: target.storeId || null,
          regionId: target.regionId || null,
          label: target.label,
          sourceUrl: target.sourceUrl || null,
          isActive: true,
        },
        create: {
          retailerKey: target.retailerKey,
          retailerName: target.retailerName,
          scopeType: target.scopeType,
          scopeValue: target.scopeValue,
          postalCode: target.postalCode || null,
          storeId: target.storeId || null,
          regionId: target.regionId || null,
          label: target.label,
          sourceUrl: target.sourceUrl || null,
        },
      })
    )
  }
  return rows
}

function toTargetInput(row: any): ScanTargetInput {
  return {
    retailerKey: row.retailerKey,
    retailerName: row.retailerName,
    scopeType: row.scopeType,
    scopeValue: row.scopeValue,
    postalCode: row.postalCode,
    storeId: row.storeId,
    regionId: row.regionId,
    label: row.label,
    sourceUrl: row.sourceUrl,
  }
}

async function replaceActiveOffers(scanTargetId: number, offers: NormalizedOffer[]) {
  await prisma.$transaction([
    prisma.offer.updateMany({ where: { scanTargetId, isActive: true }, data: { isActive: false } }),
    ...offers.map((offer) =>
      prisma.offer.create({
        data: {
          scanTargetId,
          retailerKey: offer.retailerKey,
          retailerName: offer.retailerName,
          sourceUrl: offer.sourceUrl || null,
          sourceFingerprint: offer.sourceFingerprint,
          extractionMethod: offer.extractionMethod,
          externalId: offer.externalId || null,
          name: offer.name,
          brand: offer.brand || null,
          description: offer.description || null,
          priceCents: offer.priceCents,
          unitPriceCents: offer.unitPriceCents || null,
          unit: offer.unit || null,
          quantityText: offer.quantityText || null,
          validFrom: offer.validFrom ? new Date(offer.validFrom) : null,
          validUntil: offer.validUntil ? new Date(offer.validUntil) : null,
          confidence: offer.confidence || 0.6,
          imageUrl: offer.imageUrl || null,
          rawText: offer.rawText ? String(offer.rawText).slice(0, 1000) : null,
        },
      })
    ),
  ])
}

async function refreshTarget(runId: number, row: any, force: boolean) {
  const target = toTargetInput(row)
  try {
    const sources = await fetchSources(target)
    const offersBySource = await Promise.all(sources.map((source) => extractOffers(target, source)))
    const allOffers = offersBySource.flat()
    const fingerprint = sha256(sources.map((source) => `${source.url}\n${source.body}`).join('\n---source---\n'))
    const changed = force || !row.lastFingerprint || row.lastFingerprint !== fingerprint

    if (changed) {
      await replaceActiveOffers(row.id, allOffers)
    }

    await prisma.scanTarget.update({
      where: { id: row.id },
      data: {
        lastFingerprint: fingerprint,
        lastRefreshedAt: new Date(),
      },
    })

    await prisma.refreshItem.create({
      data: {
        refreshRunId: runId,
        scanTargetId: row.id,
        status: 'ok',
        fingerprint,
        changed,
        offersFound: allOffers.length,
        message: changed ? null : 'unchanged',
      },
    })

    return { changed, offersFound: allOffers.length }
  } catch (err: any) {
    await prisma.refreshItem.create({
      data: {
        refreshRunId: runId,
        scanTargetId: row.id,
        status: 'error',
        changed: false,
        offersFound: 0,
        message: String(err?.message || err).slice(0, 500),
      },
    })
    return { changed: false, offersFound: 0, error: err }
  }
}

export async function refreshOffers(input: {
  postalCode?: unknown
  retailerKeys?: unknown
  scanTargetIds?: unknown
  force?: boolean
  requestedBy?: string
}) {
  const postalCode = normalizePostalCode(input.postalCode)
  const retailerKeys = normalizeRetailerKeys(input.retailerKeys)
  const force = Boolean(input.force)

  let targets: any[] = []
  if (postalCode) {
    targets = await upsertScanTargets(postalCode, retailerKeys)
  } else if (Array.isArray(input.scanTargetIds) && input.scanTargetIds.length) {
    targets = await prisma.scanTarget.findMany({
      where: { id: { in: input.scanTargetIds.map(Number).filter(Boolean) }, isActive: true },
    })
  } else {
    targets = await prisma.scanTarget.findMany({ where: { isActive: true } })
  }

  const run = await prisma.refreshRun.create({
    data: {
      status: 'running',
      requestedBy: input.requestedBy || null,
      postalCode: postalCode || null,
      retailerKeys: asJson(retailerKeys),
    },
  })

  let changedTargets = 0
  let offersFound = 0
  const maxTargets = envNumber('OFFERS_MAX_TARGETS_PER_REFRESH', 50)

  for (const target of targets.slice(0, maxTargets)) {
    const result = await refreshTarget(run.id, target, force)
    if (result.changed) changedTargets += 1
    offersFound += result.offersFound
  }

  const failedItems = await prisma.refreshItem.count({ where: { refreshRunId: run.id, status: 'error' } })
  const finished = await prisma.refreshRun.update({
    where: { id: run.id },
    data: {
      status: failedItems && failedItems === targets.length ? 'error' : 'ok',
      scannedTargets: targets.length,
      changedTargets,
      offersFound,
      message: failedItems ? `${failedItems} target(s) failed` : null,
      finishedAt: new Date(),
    },
    include: { items: true },
  })

  return finished
}

export async function getLatestRefresh() {
  return prisma.refreshRun.findFirst({ orderBy: { startedAt: 'desc' }, include: { items: true } })
}

export async function purgeOldOffers() {
  const days = envNumber('OFFERS_HISTORY_RETENTION_DAYS', 180)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  await prisma.offer.deleteMany({ where: { isActive: false, createdAt: { lt: cutoff } } })
}
