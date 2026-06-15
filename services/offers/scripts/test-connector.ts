import fs from 'fs'
import path from 'path'

import { RETAILERS } from '../src/config'
import { connectorFor, extractOffers } from '../src/connectors'
import type { OfferSource, RetailerKey, ScanTargetInput } from '../src/types'

type CliOptions = {
  retailerKey: RetailerKey
  postalCode: string
  saveDir: string | null
}

function usage() {
  const keys = Object.keys(RETAILERS).join('|')
  return [
    `Usage: pnpm --filter nomnomstock-offers run test:connector -- ${keys} [--postal-code 12345] [--save-dir ./tmp/connector-debug]`,
    '',
    'Examples:',
    '  pnpm --filter nomnomstock-offers run test:connector:marktkauf -- --postal-code 10115',
    '  pnpm --filter nomnomstock-offers run test:connector:netto -- --save-dir ./tmp/netto',
  ].join('\n')
}

function parseArgs(argv: string[]): CliOptions {
  const [rawKey, ...rest] = argv
  const retailerKey = String(rawKey || '').trim().toLowerCase() as RetailerKey
  if (!retailerKey || !(retailerKey in RETAILERS)) {
    throw new Error(`Unknown retailer. ${usage()}`)
  }

  let postalCode = '10115'
  let saveDir: string | null = null

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    const next = rest[index + 1]
    if (arg === '--postal-code' || arg === '--plz') {
      postalCode = String(next || '').trim() || postalCode
      index += 1
    } else if (arg === '--save-dir') {
      saveDir = next ? path.resolve(process.cwd(), next) : null
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`)
    }
  }

  return { retailerKey, postalCode, saveDir }
}

function methodFromContentType(contentType: string | null): OfferSource['method'] {
  if (contentType?.startsWith('image/')) return 'image'
  if (contentType?.includes('json')) return 'json'
  if (contentType?.includes('pdf')) return 'pdf'
  return 'html'
}

async function fetchSource(url: string): Promise<{ status: number; ok: boolean; source: OfferSource }> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'User-Agent': process.env.OFFERS_DEBUG_USER_AGENT || 'NomNomStockOffersDebug/0.1 (+https://quaxel.de/nomnomstock)',
    },
  })
  const contentType = response.headers.get('content-type')
  const isImage = Boolean(contentType?.startsWith('image/'))
  const body = isImage
    ? `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    : await response.text()

  return {
    status: response.status,
    ok: response.ok,
    source: {
      url,
      body,
      contentType,
      method: methodFromContentType(contentType),
    },
  }
}

function writeDebugFile(saveDir: string | null, fileName: string, content: string) {
  if (!saveDir) return
  fs.mkdirSync(saveDir, { recursive: true })
  fs.writeFileSync(path.join(saveDir, fileName), content)
}

function targetSummary(target: ScanTargetInput) {
  return {
    retailerKey: target.retailerKey,
    retailerName: target.retailerName,
    scopeType: target.scopeType,
    scopeValue: target.scopeValue,
    sourceUrl: target.sourceUrl,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const connector = connectorFor(options.retailerKey)
  const targets = connector.resolveScanTargets(options.postalCode)
  const allOffers = []

  console.log(
    JSON.stringify(
      {
        retailer: RETAILERS[options.retailerKey],
        postalCode: options.postalCode,
        targets: targets.map(targetSummary),
      },
      null,
      2
    )
  )

  for (const target of targets) {
    const urls = connector.sourceUrls(target)
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index]
      const fetched = await fetchSource(url)
      const offers = await extractOffers(target, fetched.source)
      allOffers.push(...offers)

      const prefix = `${options.retailerKey}-${index + 1}`
      writeDebugFile(options.saveDir, `${prefix}.html`, fetched.source.body)
      writeDebugFile(options.saveDir, `${prefix}.offers.json`, JSON.stringify(offers, null, 2))

      console.log(
        JSON.stringify(
          {
            url,
            status: fetched.status,
            ok: fetched.ok,
            contentType: fetched.source.contentType,
            method: fetched.source.method,
            bodyLength: fetched.source.body.length,
            bodySample: fetched.source.body.slice(0, 240),
            offersFound: offers.length,
            firstOffers: offers.slice(0, 5).map((offer) => ({
              name: offer.name,
              priceCents: offer.priceCents,
              imageUrl: offer.imageUrl,
              extractionMethod: offer.extractionMethod,
            })),
          },
          null,
          2
        )
      )
    }
  }

  console.log(
    JSON.stringify(
      {
        done: true,
        totalOffers: allOffers.length,
        saveDir: options.saveDir,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err)
  process.exitCode = 1
})
