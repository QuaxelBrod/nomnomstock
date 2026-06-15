import { normalizePostalCode, normalizeRetailerKeys } from './config'
import { prisma } from './db'
import { refreshOffers, upsertScanTargets } from './refresh'
import type { OfferMatch, OfferPlanResult, ShoppingItem } from './types'

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: unknown) {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function tokenScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0
  const bSet = new Set(b)
  const hits = a.filter((token) => bSet.has(token)).length
  return hits / Math.max(a.length, b.length)
}

function scoreOffer(item: ShoppingItem, offer: any) {
  const productName = item.product?.name || ''
  const productBrand = item.product?.brand || ''
  const offerName = offer.name || ''
  const offerBrand = offer.brand || ''
  const nameA = normalizeText(productName)
  const nameB = normalizeText(offerName)
  const brandA = normalizeText(productBrand)
  const brandB = normalizeText(offerBrand)

  if (nameA && nameA === nameB && (!brandA || !brandB || brandA === brandB)) return { score: 0.98, type: 'exact' as const }
  if (nameA && nameB && (nameA.includes(nameB) || nameB.includes(nameA))) {
    const brandBonus = brandA && brandB && brandA === brandB ? 0.1 : 0
    return { score: Math.min(0.94, 0.78 + brandBonus), type: 'fuzzy' as const }
  }

  const overlap = tokenScore(tokens(`${productBrand} ${productName}`), tokens(`${offerBrand} ${offerName}`))
  if (overlap >= 0.55) return { score: Math.min(0.88, 0.55 + overlap * 0.35), type: 'fuzzy' as const }
  if (overlap >= 0.28) return { score: Math.min(0.68, 0.36 + overlap * 0.55), type: 'substitute' as const }
  return { score: 0, type: 'substitute' as const }
}

function combinations<T>(items: T[], maxSize: number) {
  const result: T[][] = []
  const walk = (start: number, current: T[]) => {
    if (current.length) result.push([...current])
    if (current.length >= maxSize) return
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i])
      walk(i + 1, current)
      current.pop()
    }
  }
  walk(0, [])
  return result
}

function buildMatch(item: ShoppingItem, offer: any, score: number, matchType: OfferMatch['matchType']): OfferMatch {
  return {
    itemId: item.id,
    productName: item.product?.name || 'Unbekannt',
    retailerKey: offer.retailerKey,
    retailerName: offer.retailerName,
    offerId: offer.id,
    offerName: offer.name,
    offerBrand: offer.brand,
    priceCents: offer.priceCents,
    unit: offer.unit,
    quantityText: offer.quantityText,
    validUntil: offer.validUntil ? offer.validUntil.toISOString() : null,
    sourceUrl: offer.sourceUrl,
    score,
    matchType,
    confidence: Math.min(1, Math.max(0, Number(offer.confidence || 0.5) * score)),
  }
}

function choosePlan(items: ShoppingItem[], offers: any[], maxStores: number, freshness: OfferPlanResult['dataFreshness']) {
  const retailers = Array.from(new Set(offers.map((offer) => offer.retailerKey)))
  const groups = combinations(retailers, Math.min(maxStores, retailers.length || maxStores))
  const candidates = groups.length ? groups : [[]]
  let best: OfferPlanResult | null = null

  for (const selectedRetailers of candidates) {
    const selectedOffers = offers.filter((offer) => selectedRetailers.includes(offer.retailerKey))
    const matches: OfferMatch[] = []
    const substitutes: OfferMatch[] = []
    const missingItems: OfferPlanResult['missingItems'] = []

    for (const item of items) {
      let bestMatch: OfferMatch | null = null
      let bestSubstitute: OfferMatch | null = null
      for (const offer of selectedOffers) {
        const scored = scoreOffer(item, offer)
        if (scored.score >= 0.55) {
          const match = buildMatch(item, offer, scored.score, scored.type === 'substitute' ? 'fuzzy' : scored.type)
          if (!bestMatch || match.priceCents < bestMatch.priceCents || match.score > bestMatch.score + 0.12) {
            bestMatch = match
          }
        } else if (scored.score >= 0.28) {
          const substitute = buildMatch(item, offer, scored.score, 'substitute')
          if (!bestSubstitute || substitute.score > bestSubstitute.score) bestSubstitute = substitute
        }
      }

      if (bestMatch) matches.push(bestMatch)
      else {
        missingItems.push({ itemId: item.id, productName: item.product?.name || 'Unbekannt' })
        if (bestSubstitute) substitutes.push(bestSubstitute)
      }
    }

    const byRetailer = selectedRetailers.map((retailerKey) => {
      const retailerMatches = matches.filter((match) => match.retailerKey === retailerKey)
      const retailerName =
        retailerMatches[0]?.retailerName || offers.find((offer) => offer.retailerKey === retailerKey)?.retailerName || retailerKey
      return {
        retailerKey,
        retailerName,
        totalCents: retailerMatches.reduce((sum, match) => sum + match.priceCents, 0),
        matches: retailerMatches,
      }
    }).filter((store) => store.matches.length)

    const candidate: OfferPlanResult = {
      postalCode: '',
      maxStores,
      selectedRetailers,
      totalCents: matches.reduce((sum, match) => sum + match.priceCents, 0),
      matchedItems: matches.length,
      missingItems,
      stores: byRetailer,
      substitutes,
      dataFreshness: freshness,
    }

    if (!best) {
      best = candidate
      continue
    }

    if (candidate.matchedItems > best.matchedItems) best = candidate
    else if (candidate.matchedItems === best.matchedItems && candidate.totalCents < best.totalCents) best = candidate
    else if (
      candidate.matchedItems === best.matchedItems &&
      candidate.totalCents === best.totalCents &&
      candidate.stores.length < best.stores.length
    ) {
      best = candidate
    }
  }

  return best || {
    postalCode: '',
    maxStores,
    selectedRetailers: [],
    totalCents: 0,
    matchedItems: 0,
    missingItems: items.map((item) => ({ itemId: item.id, productName: item.product?.name || 'Unbekannt' })),
    stores: [],
    substitutes: [],
    dataFreshness: freshness,
  }
}

export async function createOfferPlan(input: {
  householdId: unknown
  postalCode: unknown
  retailerKeys: unknown
  maxStores?: unknown
  shoppingItems: ShoppingItem[]
  forceRefresh?: boolean
}) {
  const householdId = Number(input.householdId)
  const postalCode = normalizePostalCode(input.postalCode)
  const retailerKeys = normalizeRetailerKeys(input.retailerKeys)
  const maxStores = Math.max(1, Math.min(3, Number(input.maxStores || 3)))
  const shoppingItems = Array.isArray(input.shoppingItems) ? input.shoppingItems : []

  if (!Number.isInteger(householdId) || householdId <= 0) throw new Error('invalid_household')
  if (!postalCode) throw new Error('postal_code_required')

  const targets = await upsertScanTargets(postalCode, retailerKeys)
  const staleBefore = new Date(Date.now() - 20 * 60 * 60 * 1000)
  const needsRefresh = input.forceRefresh || targets.some((target: any) => !target.lastRefreshedAt || target.lastRefreshedAt < staleBefore)
  if (needsRefresh) {
    await refreshOffers({ postalCode, retailerKeys, force: Boolean(input.forceRefresh), requestedBy: `household:${householdId}` })
  }

  const activeTargets = await prisma.scanTarget.findMany({
    where: {
      retailerKey: { in: retailerKeys },
      scopeType: 'postalCode',
      scopeValue: postalCode,
      isActive: true,
    },
  })

  const offers = await prisma.offer.findMany({
    where: {
      scanTargetId: { in: activeTargets.map((target: any) => target.id) },
      isActive: true,
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    orderBy: [{ priceCents: 'asc' }, { confidence: 'desc' }],
    take: 1000,
  })

  const freshness = activeTargets.map((target: any) => ({
    retailerKey: target.retailerKey,
    retailerName: target.retailerName,
    scopeValue: target.scopeValue,
    lastRefreshedAt: target.lastRefreshedAt ? target.lastRefreshedAt.toISOString() : null,
  }))

  const result = choosePlan(shoppingItems, offers, maxStores, freshness)
  result.postalCode = postalCode

  const saved = await prisma.offerPlan.create({
    data: {
      householdId,
      postalCode,
      retailerKeys: JSON.stringify(retailerKeys),
      maxStores,
      settingsSnapshot: JSON.stringify({ householdId, postalCode, retailerKeys, maxStores }),
      shoppingSnapshot: JSON.stringify(shoppingItems),
      result: JSON.stringify(result),
    },
  })

  return { ...result, id: saved.id, createdAt: saved.createdAt.toISOString() }
}

export async function getPlan(id: unknown) {
  const planId = Number(id)
  if (!Number.isInteger(planId) || planId <= 0) return null
  const row = await prisma.offerPlan.findUnique({ where: { id: planId } })
  if (!row) return null
  return { ...JSON.parse(row.result), id: row.id, createdAt: row.createdAt.toISOString() }
}

export async function getLatestPlan(householdId: unknown) {
  const id = Number(householdId)
  if (!Number.isInteger(id) || id <= 0) return null
  const row = await prisma.offerPlan.findFirst({ where: { householdId: id }, orderBy: { createdAt: 'desc' } })
  if (!row) return null
  return { ...JSON.parse(row.result), id: row.id, createdAt: row.createdAt.toISOString() }
}
