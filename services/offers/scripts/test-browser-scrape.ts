import path from 'path'

import { RETAILERS } from '../src/config'
import type { RetailerKey } from '../src/types'

type CliOptions = {
  retailerKeys: RetailerKey[]
  postalCode: string
  snapshotDir: string | null
  browserEndpoint: string | null
  headful: boolean
  force: boolean
}

function usage() {
  return [
    'Usage: pnpm --filter nomnomstock-offers run test:browser -- [marktkauf] [--postal-code 12345] [--snapshot-dir ./tmp/browser] [--browser-endpoint ws://host:5600?token=...] [--headful] [--force]',
    '',
    'Examples:',
    '  pnpm --filter nomnomstock-offers run test:browser:marktkauf -- --postal-code 10115 --snapshot-dir ./tmp/marktkauf-browser',
    '  pnpm --filter nomnomstock-offers run test:browser -- marktkauf --headful',
  ].join('\n')
}

function parseArgs(argv: string[]): CliOptions {
  const retailerKeys: RetailerKey[] = []
  let postalCode = '10115'
  let snapshotDir: string | null = null
  let browserEndpoint: string | null = null
  let headful = false
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--postal-code' || arg === '--plz') {
      postalCode = String(next || '').trim() || postalCode
      index += 1
    } else if (arg === '--snapshot-dir' || arg === '--save-dir') {
      snapshotDir = next ? path.resolve(process.cwd(), next) : null
      index += 1
    } else if (arg === '--browser-endpoint' || arg === '--ws-endpoint' || arg === '--cdp-endpoint') {
      browserEndpoint = next ? String(next).trim() : null
      index += 1
    } else if (arg === '--headful') {
      headful = true
    } else if (arg === '--force') {
      force = true
    } else if (arg === '--help' || arg === '-h') {
      throw new Error(usage())
    } else if (arg in RETAILERS) {
      retailerKeys.push(arg as RetailerKey)
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`)
    }
  }

  return {
    retailerKeys: retailerKeys.length ? retailerKeys : ['marktkauf'],
    postalCode,
    snapshotDir,
    browserEndpoint,
    headful,
    force,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.snapshotDir) process.env.OFFERS_BROWSER_SNAPSHOT_DIR = options.snapshotDir
  if (options.browserEndpoint) process.env.OFFERS_BROWSER_WS_ENDPOINT = options.browserEndpoint
  if (options.headful) process.env.OFFERS_BROWSER_HEADLESS = 'false'
  process.env.OFFERS_BROWSER_RETAILERS = options.retailerKeys.join(',')

  const { ensureOfferSchema } = await import('../src/schema')
  const { runBrowserScrapes } = await import('../src/browserScraper')
  await ensureOfferSchema()

  const run = await runBrowserScrapes({
    postalCode: options.postalCode,
    retailerKeys: options.retailerKeys,
    force: options.force,
    requestedBy: 'debug-script',
  })

  console.log(JSON.stringify(run, null, 2))
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err)
  process.exitCode = 1
})
