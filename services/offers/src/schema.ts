import { prisma } from './db'

export async function ensureOfferSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScanTarget" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "retailerKey" TEXT NOT NULL,
      "retailerName" TEXT NOT NULL,
      "scopeType" TEXT NOT NULL,
      "scopeValue" TEXT NOT NULL,
      "postalCode" TEXT,
      "storeId" TEXT,
      "regionId" TEXT,
      "label" TEXT NOT NULL,
      "sourceUrl" TEXT,
      "lastFingerprint" TEXT,
      "lastRefreshedAt" DATETIME,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Offer" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "scanTargetId" INTEGER NOT NULL,
      "retailerKey" TEXT NOT NULL,
      "retailerName" TEXT NOT NULL,
      "sourceUrl" TEXT,
      "sourceFingerprint" TEXT NOT NULL,
      "extractionMethod" TEXT NOT NULL,
      "externalId" TEXT,
      "name" TEXT NOT NULL,
      "brand" TEXT,
      "description" TEXT,
      "priceCents" INTEGER NOT NULL,
      "unitPriceCents" INTEGER,
      "unit" TEXT,
      "quantityText" TEXT,
      "validFrom" DATETIME,
      "validUntil" DATETIME,
      "confidence" REAL NOT NULL DEFAULT 0.6,
      "imageUrl" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "rawText" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Offer_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RefreshRun" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "status" TEXT NOT NULL DEFAULT 'running',
      "requestedBy" TEXT,
      "postalCode" TEXT,
      "retailerKeys" TEXT,
      "scannedTargets" INTEGER NOT NULL DEFAULT 0,
      "changedTargets" INTEGER NOT NULL DEFAULT 0,
      "offersFound" INTEGER NOT NULL DEFAULT 0,
      "message" TEXT,
      "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" DATETIME
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RefreshItem" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "refreshRunId" INTEGER NOT NULL,
      "scanTargetId" INTEGER NOT NULL,
      "status" TEXT NOT NULL,
      "fingerprint" TEXT,
      "changed" BOOLEAN NOT NULL DEFAULT false,
      "offersFound" INTEGER NOT NULL DEFAULT 0,
      "message" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RefreshItem_refreshRunId_fkey" FOREIGN KEY ("refreshRunId") REFERENCES "RefreshRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "RefreshItem_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OfferPlan" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "householdId" INTEGER NOT NULL,
      "postalCode" TEXT NOT NULL,
      "retailerKeys" TEXT NOT NULL,
      "maxStores" INTEGER NOT NULL DEFAULT 3,
      "settingsSnapshot" TEXT NOT NULL,
      "shoppingSnapshot" TEXT NOT NULL,
      "result" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BrowserScrapeSnapshot" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "scanTargetId" INTEGER,
      "retailerKey" TEXT NOT NULL,
      "retailerName" TEXT NOT NULL,
      "postalCode" TEXT,
      "sourceUrl" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "httpStatus" INTEGER,
      "offersFound" INTEGER NOT NULL DEFAULT 0,
      "message" TEXT,
      "htmlPath" TEXT,
      "screenshotPath" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BrowserScrapeSnapshot_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)

  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "ScanTarget_retailerKey_scopeType_scopeValue_key" ON "ScanTarget"("retailerKey", "scopeType", "scopeValue")'
  )
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ScanTarget_postalCode_idx" ON "ScanTarget"("postalCode")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ScanTarget_retailerKey_idx" ON "ScanTarget"("retailerKey")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Offer_scanTargetId_isActive_idx" ON "Offer"("scanTargetId", "isActive")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Offer_retailerKey_idx" ON "Offer"("retailerKey")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Offer_sourceFingerprint_idx" ON "Offer"("sourceFingerprint")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Offer_validUntil_idx" ON "Offer"("validUntil")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "RefreshItem_refreshRunId_idx" ON "RefreshItem"("refreshRunId")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "RefreshItem_scanTargetId_idx" ON "RefreshItem"("scanTargetId")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "OfferPlan_householdId_createdAt_idx" ON "OfferPlan"("householdId", "createdAt")')
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "BrowserScrapeSnapshot_retailerKey_createdAt_idx" ON "BrowserScrapeSnapshot"("retailerKey", "createdAt")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "BrowserScrapeSnapshot_scanTargetId_createdAt_idx" ON "BrowserScrapeSnapshot"("scanTargetId", "createdAt")'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "BrowserScrapeSnapshot_status_createdAt_idx" ON "BrowserScrapeSnapshot"("status", "createdAt")'
  )
}
