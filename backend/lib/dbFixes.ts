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

export async function ensureShoppingListItemTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShoppingListItem" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "productId" INTEGER NOT NULL,
        "householdId" INTEGER NOT NULL,
        "quantity" REAL NOT NULL DEFAULT 1,
        "note" TEXT,
        "unit" TEXT,
        "addedById" INTEGER,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ShoppingListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "ShoppingListItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "ShoppingListItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `)
    await ensureShoppingListItemColumns()
  } catch (err) {
    console.error('ensureShoppingListItemTable error', err)
    throw err
  }
}

export async function ensureShoppingListItemColumns() {
  try {
    const rows: Array<{ name: string }> = await prisma.$queryRaw`PRAGMA table_info('ShoppingListItem')`
    const hasNote = rows.some((r: any) => r.name === 'note')
    if (!hasNote) {
      await prisma.$executeRawUnsafe('ALTER TABLE "ShoppingListItem" ADD COLUMN note TEXT')
      console.warn('[dbFixes] Added missing note column to ShoppingListItem table')
    }
  } catch (err) {
    console.error('ensureShoppingListItemColumns error', err)
    throw err
  }
}

export async function ensureHouseholdOfferSettingsTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HouseholdOfferSettings" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "householdId" INTEGER NOT NULL,
        "postalCode" TEXT,
        "retailerKeys" TEXT NOT NULL DEFAULT '["aldi","cap","edeka","kaufland","lidl","marktkauf","netto","norma","rewe"]',
        "maxStores" INTEGER NOT NULL DEFAULT 3,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HouseholdOfferSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "HouseholdOfferSettings_householdId_key" ON "HouseholdOfferSettings"("householdId")'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "HouseholdOfferSettings_postalCode_idx" ON "HouseholdOfferSettings"("postalCode")'
    )
  } catch (err) {
    console.error('ensureHouseholdOfferSettingsTable error', err)
    throw err
  }
}
