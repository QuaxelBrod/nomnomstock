import fs from 'fs'
import path from 'path'

if (!process.env.OFFERS_DATABASE_URL) {
  process.env.OFFERS_DATABASE_URL = 'file:./data/offers.db'
} else {
  let url = process.env.OFFERS_DATABASE_URL
  if (/^sqlite:\/\//.test(url)) url = url.replace(/^sqlite:\/\//, 'file:')
  else if (/^sqlite:/.test(url)) url = url.replace(/^sqlite:/, 'file:')
  else if (!/^[a-zA-Z]+:/.test(url)) url = `file:${url}`
  process.env.OFFERS_DATABASE_URL = url
}

const dbPath = process.env.OFFERS_DATABASE_URL.replace(/^file:/, '')
if (dbPath && !dbPath.startsWith(':')) {
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), dbPath)), { recursive: true })
}

function requireGeneratedClient() {
  const candidates = [
    path.resolve(__dirname, '..', 'generated', 'prisma'),
    path.resolve(__dirname, '..', '..', 'generated', 'prisma'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error(`offers_prisma_client_not_generated: ${candidates.join(', ')}`)
}

const { PrismaClient } = requireGeneratedClient() as any

declare global {
  // eslint-disable-next-line no-var
  var offersPrisma: any | undefined
}

export const prisma = global.offersPrisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.offersPrisma = prisma
