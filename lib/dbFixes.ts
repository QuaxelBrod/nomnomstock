import { prisma } from './prisma'

export async function ensurePasswordColumn() {
  try {
    // For SQLite, check pragma table_info
    const rows: Array<{ name: string }> = await prisma.$queryRaw`PRAGMA table_info('User')`
    const has = rows.some((r: any) => r.name === 'password')
    if (!has) {
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN password TEXT')
      console.warn('[dbFixes] Added missing password column to User table')
    }
  } catch (err) {
    console.error('ensurePasswordColumn error', err)
    // ignore — best effort
  }
}

export async function ensureImageColumn() {
  try {
    const rows: Array<{ name: string }> = await prisma.$queryRaw`PRAGMA table_info('User')`
    const has = rows.some((r: any) => r.name === 'image')
    if (!has) {
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN image TEXT')
      console.warn('[dbFixes] Added missing image column to User table')
    }
  } catch (err) {
    console.error('ensureImageColumn error', err)
  }
}

export async function ensureVerificationTokenTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VerificationToken" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "email" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "expiresAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token")'
    )
  } catch (err) {
    console.error('ensureVerificationTokenTable error', err)
    throw err
  }
}
