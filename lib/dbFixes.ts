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
