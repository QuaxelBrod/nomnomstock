// Ensure a sensible default for local development when DATABASE_URL is missing
// or when a plain file path is provided (e.g. "./data/nomnom.db").
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/nomnom.db'
} else {
  let url = process.env.DATABASE_URL
  // If it starts with sqlite:// or sqlite:, convert to file:
  if (/^sqlite:\/\//.test(url)) {
    url = url.replace(/^sqlite:\/\//, 'file:')
  } else if (/^sqlite:/.test(url)) {
    url = url.replace(/^sqlite:/, 'file:')
  } else if (!/^[a-zA-Z]+:/.test(url)) {
    // No scheme — treat as a filepath
    url = `file:${url}`
  }
  process.env.DATABASE_URL = url
}

// Import PrismaClient after ensuring DATABASE_URL is normalized to avoid
// initialization errors where Prisma validates the datasource URL at import time.
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client')

declare global {
  // allow global for dev to avoid multiple instances in HMR
  // eslint-disable-next-line no-var
  var prisma: import('@prisma/client').PrismaClient | undefined
}

export const prisma = global.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.prisma = prisma
if (process.env.NODE_ENV !== 'production') {
  try {
    // log normalized DATABASE_URL for debugging (do not expose in production)
    // keep it short if it's a file path
    const db = process.env.DATABASE_URL || ''
    console.log('[prisma] DATABASE_URL=', db.startsWith('file:') ? db : db)
  } catch {}
}
