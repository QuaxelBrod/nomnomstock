import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function ensureNote() {
  try {
    const rows = await prisma.$queryRaw`PRAGMA table_info('ShoppingListItem')`
    const has = rows.some(r => r.name === 'note')
    if (!has) {
      await prisma.$executeRawUnsafe('ALTER TABLE "ShoppingListItem" ADD COLUMN note TEXT')
      console.log('[db] Added note column to ShoppingListItem')
    } else {
      console.log('[db] note column already exists')
    }
  } catch (e) {
    console.error('Error ensuring note column', e)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

ensureNote()
